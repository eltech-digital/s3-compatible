import { Elysia } from 'elysia';
import { db } from '../db/connection';
import { accessKeys } from '../db/schema';
import { eq } from 'drizzle-orm';
import { parseAuthorizationHeader, verifySignature, verifyPresignedUrl } from '../lib/auth/signature-v4';
import { S3Errors, s3ErrorResponse } from '../lib/errors';

export const s3Auth = new Elysia({ name: 's3-auth' })
    .derive({ as: 'scoped' }, async ({ request, query }) => {
        const url = new URL(request.url);
        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => {
            headers[key.toLowerCase()] = value;
        });

        const queryParams: Record<string, string> = {};
        url.searchParams.forEach((value, key) => {
            queryParams[key] = value;
        });

        // Read body once upfront so handlers can reuse it
        let bodyBuffer: Buffer;
        try {
            bodyBuffer = Buffer.from(await request.arrayBuffer());
        } catch {
            bodyBuffer = Buffer.alloc(0);
        }

        // Check for presigned URL first
        if (queryParams['X-Amz-Algorithm']) {
            const credential = queryParams['X-Amz-Credential'];
            if (!credential) {
                return { s3Error: S3Errors.MissingSecurityHeader(), accessKeyId: '', ownerId: 0, bodyBuffer };
            }
            const accessKeyId = credential.split('/')[0]!;

            const [keyRecord] = await db.select().from(accessKeys)
                .where(eq(accessKeys.accessKeyId, accessKeyId))
                .limit(1);

            if (!keyRecord || !keyRecord.isActive) {
                return { s3Error: S3Errors.AccessDenied(), accessKeyId: '', ownerId: 0, bodyBuffer };
            }

            const valid = verifyPresignedUrl({
                method: request.method,
                path: url.pathname,
                query: queryParams,
                headers,
                secretAccessKey: keyRecord.secretAccessKey,
            });

            if (!valid) {
                console.warn(`[S3Auth] Presigned URL signature mismatch for ${accessKeyId}`);
                return { s3Error: S3Errors.SignatureDoesNotMatch(), accessKeyId: '', ownerId: 0, bodyBuffer };
            }

            return { s3Error: null, accessKeyId: keyRecord.accessKeyId, ownerId: keyRecord.id, bodyBuffer };
        }

        // Check Authorization header
        const authHeader = headers['authorization'];
        if (!authHeader) {
            return { s3Error: S3Errors.MissingSecurityHeader(), accessKeyId: '', ownerId: 0, bodyBuffer };
        }

        const parsed = parseAuthorizationHeader(authHeader);
        if (!parsed) {
            return { s3Error: S3Errors.AccessDenied(), accessKeyId: '', ownerId: 0, bodyBuffer };
        }

        const [keyRecord] = await db.select().from(accessKeys)
            .where(eq(accessKeys.accessKeyId, parsed.accessKeyId))
            .limit(1);

        if (!keyRecord || !keyRecord.isActive) {
            return { s3Error: S3Errors.AccessDenied(), accessKeyId: '', ownerId: 0, bodyBuffer };
        }

        const valid = verifySignature({
            method: request.method,
            path: url.pathname,
            query: queryParams,
            headers,
            body: bodyBuffer,
            secretAccessKey: keyRecord.secretAccessKey,
        });

        if (!valid) {
            console.warn(`[S3Auth] Signature mismatch for ${parsed.accessKeyId} — ${request.method} ${url.pathname}`);
            // Log canonical request details for debugging
            console.warn(`[S3Auth] x-amz-date: ${headers['x-amz-date']}, x-amz-content-sha256: ${headers['x-amz-content-sha256']}`);
            console.warn(`[S3Auth] SignedHeaders: ${parsed.signedHeaders.join(';')}`);
        }

        if (!valid) {
            return { s3Error: S3Errors.SignatureDoesNotMatch(), accessKeyId: '', ownerId: 0, bodyBuffer };
        }

        return { s3Error: null, accessKeyId: keyRecord.accessKeyId, ownerId: keyRecord.id, bodyBuffer };
    });
