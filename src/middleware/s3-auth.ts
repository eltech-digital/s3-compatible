import { Elysia } from 'elysia';
import { db } from '../db/connection';
import { accessKeys, buckets } from '../db/schema';
import { eq } from 'drizzle-orm';
import { parseAuthorizationHeader, verifySignature, verifyPresignedUrl, verifyPresignedUrlV2 } from '../lib/auth/signature-v4';
import { S3Errors, s3ErrorResponse } from '../lib/errors';

export const s3Auth = new Elysia({ name: 's3-auth' })
    .derive({ as: 'scoped' }, async ({ request, query }) => {
        const url = new URL(request.url);
        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => {
            headers[key.toLowerCase()] = value;
        });

        // Behind a reverse proxy, the Host header gets rewritten to localhost.
        // Use x-forwarded-host to restore the original host for signature verification.
        if (headers['x-forwarded-host'] && !headers['x-forwarded-host'].includes(',')) {
            headers['host'] = headers['x-forwarded-host'];
        }

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

        // Check for V2 presigned URL (AWSAccessKeyId + Expires + Signature)
        if (queryParams['AWSAccessKeyId']) {
            const accessKeyId = queryParams['AWSAccessKeyId'];

            const [keyRecord] = await db.select().from(accessKeys)
                .where(eq(accessKeys.accessKeyId, accessKeyId))
                .limit(1);

            if (!keyRecord || !keyRecord.isActive) {
                return { s3Error: S3Errors.AccessDenied(), accessKeyId: '', ownerId: 0, bodyBuffer };
            }

            const valid = verifyPresignedUrlV2({
                method: request.method,
                path: url.pathname,
                query: queryParams,
                headers,
                secretAccessKey: keyRecord.secretAccessKey,
            });

            if (!valid) {
                console.warn(`[S3Auth] V2 presigned URL signature mismatch for ${accessKeyId}`);
                return { s3Error: S3Errors.SignatureDoesNotMatch(), accessKeyId: '', ownerId: 0, bodyBuffer };
            }

            return { s3Error: null, accessKeyId: keyRecord.accessKeyId, ownerId: keyRecord.id, bodyBuffer };
        }

        // Check for V4 presigned URL (X-Amz-Algorithm)
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
            // No auth — check if this is a read request on a public-read bucket
            if (request.method === 'GET' || request.method === 'HEAD') {
                const pathParts = url.pathname.split('/').filter(Boolean);
                if (pathParts.length >= 1) {
                    const bucketName = pathParts[0];
                    const [bucket] = await db.select({ acl: buckets.acl })
                        .from(buckets)
                        .where(eq(buckets.name, bucketName!))
                        .limit(1);

                    if (bucket?.acl === 'public-read') {
                        return { s3Error: null, accessKeyId: 'anonymous', ownerId: 0, bodyBuffer };
                    }
                }
            }
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
            return { s3Error: S3Errors.SignatureDoesNotMatch(), accessKeyId: '', ownerId: 0, bodyBuffer };
        }

        return { s3Error: null, accessKeyId: keyRecord.accessKeyId, ownerId: keyRecord.id, bodyBuffer };
    });
