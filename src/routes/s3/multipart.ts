import { Elysia } from 'elysia';
import { db } from '../../db/connection';
import { buckets, objects, multipartUploads, multipartParts } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { s3Auth } from '../../middleware/s3-auth';
import { storage } from '../../lib/storage/filesystem';
import { xml } from '../../lib/xml/builder';
import { S3Errors, s3ErrorResponse } from '../../lib/errors';
import { computeETag, computeMultipartETag } from '../../lib/auth/signature-v4';
import { v4 as uuidv4 } from 'uuid';

export const multipartRoutes = new Elysia({ prefix: '' })
    .use(s3Auth)
    // CreateMultipartUpload — POST /:bucket/*?uploads
    // UploadPart — PUT /:bucket/*?partNumber=N&uploadId=X
    // CompleteMultipartUpload — POST /:bucket/*?uploadId=X
    // AbortMultipartUpload — DELETE /:bucket/*?uploadId=X
    // ListParts — GET /:bucket/*?uploadId=X

    // POST handlers (CreateMultipartUpload & CompleteMultipartUpload)
    .post('/:bucket/*', async ({ params, request, s3Error, ownerId, bodyBuffer }) => {
        if (s3Error) return s3ErrorResponse(s3Error);

        const url = new URL(request.url);
        const bucketName = params.bucket;
        const key = decodeURIComponent((params as any)['*']);

        const [bucket] = await db.select().from(buckets)
            .where(eq(buckets.name, bucketName))
            .limit(1);

        if (!bucket) return s3ErrorResponse(S3Errors.NoSuchBucket(bucketName));

        // CreateMultipartUpload (POST /:bucket/:key?uploads)
        if (url.searchParams.has('uploads')) {
            const uploadId = uuidv4();
            const contentType = request.headers.get('content-type') || 'application/octet-stream';

            const metadata: Record<string, string> = {};
            request.headers.forEach((value, headerKey) => {
                if (headerKey.toLowerCase().startsWith('x-amz-meta-')) {
                    metadata[headerKey.toLowerCase().slice(11)] = value;
                }
            });

            await db.insert(multipartUploads).values({
                uploadId,
                bucketId: bucket.id,
                key,
                contentType,
                metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
            });

            const body = xml.initiateMultipartUploadResponse(bucketName, key, uploadId);
            return new Response(body, {
                status: 200,
                headers: { 'Content-Type': 'application/xml' },
            });
        }

        // CompleteMultipartUpload (POST /:bucket/:key?uploadId=X)
        const uploadId = url.searchParams.get('uploadId');
        if (uploadId) {
            const [upload] = await db.select().from(multipartUploads)
                .where(eq(multipartUploads.uploadId, uploadId))
                .limit(1);

            if (!upload) return s3ErrorResponse(S3Errors.NoSuchUpload(uploadId));

            // Parse request body for part list
            const bodyText = bodyBuffer.toString('utf-8');
            const parsed = xml.parse(bodyText);
            let partList: { PartNumber: number | string; ETag: string }[] = [];
            const partObj = parsed?.CompleteMultipartUpload?.Part;
            if (Array.isArray(partObj)) {
                partList = partObj;
            } else if (partObj) {
                partList = [partObj];
            }

            // Get stored parts
            const storedParts = await db.select().from(multipartParts)
                .where(eq(multipartParts.uploadId, uploadId));

            const storedPartsMap = new Map(storedParts.map((p) => [p.partNumber, p]));

            // Validate parts
            const assemblyParts: { partNumber: number; storagePath: string }[] = [];
            const partETags: string[] = [];

            for (const part of partList) {
                const partNumber = typeof part.PartNumber === 'string' ? parseInt(part.PartNumber) : part.PartNumber;
                const stored = storedPartsMap.get(partNumber);
                if (!stored) {
                    return s3ErrorResponse(S3Errors.InvalidArgument(`Part ${partNumber} not found`));
                }
                assemblyParts.push({ partNumber, storagePath: stored.storagePath });
                partETags.push(stored.etag);
            }

            // Assemble final object
            const { size, storagePath } = await storage.assembleMultipartUpload(uploadId, assemblyParts, bucketName, key);
            const etag = computeMultipartETag(partETags, partETags.length);

            // Upsert object record
            const [existing] = await db.select().from(objects)
                .where(and(eq(objects.bucketId, bucket.id), eq(objects.key, key)))
                .limit(1);

            if (existing) {
                await db.update(objects).set({
                    size,
                    etag,
                    contentType: upload.contentType,
                    storagePath,
                    metadata: upload.metadata,
                }).where(eq(objects.id, existing.id));
            } else {
                await db.insert(objects).values({
                    bucketId: bucket.id,
                    key,
                    size,
                    etag,
                    contentType: upload.contentType,
                    storagePath,
                    metadata: upload.metadata,
                });
            }

            // Cleanup multipart records
            await db.delete(multipartParts).where(eq(multipartParts.uploadId, uploadId));
            await db.delete(multipartUploads).where(eq(multipartUploads.uploadId, uploadId));

            const location = `/${bucketName}/${key}`;
            const body = xml.completeMultipartUploadResponse(location, bucketName, key, etag);
            return new Response(body, {
                status: 200,
                headers: { 'Content-Type': 'application/xml' },
            });
        }

        return s3ErrorResponse(S3Errors.InvalidArgument('Missing uploads or uploadId parameter'));
    })
    // AbortMultipartUpload — DELETE /:bucket/*?uploadId=X
    .delete('/:bucket/*', async ({ params, request, s3Error, ownerId }) => {
        if (s3Error) return s3ErrorResponse(s3Error);

        const url = new URL(request.url);
        const uploadId = url.searchParams.get('uploadId');
        if (!uploadId) return;

        const [upload] = await db.select().from(multipartUploads)
            .where(eq(multipartUploads.uploadId, uploadId))
            .limit(1);

        if (!upload) return s3ErrorResponse(S3Errors.NoSuchUpload(uploadId));

        await storage.cleanupMultipart(uploadId);
        await db.delete(multipartParts).where(eq(multipartParts.uploadId, uploadId));
        await db.delete(multipartUploads).where(eq(multipartUploads.uploadId, uploadId));

        return new Response(null, { status: 204 });
    })
    // ListParts — GET /:bucket/*?uploadId=X
    .get('/:bucket/*', async ({ params, request, s3Error, ownerId }) => {
        if (s3Error) return s3ErrorResponse(s3Error);

        const url = new URL(request.url);
        const uploadId = url.searchParams.get('uploadId');
        if (!uploadId) return;

        const bucketName = params.bucket;
        const key = decodeURIComponent((params as any)['*']);

        const [upload] = await db.select().from(multipartUploads)
            .where(eq(multipartUploads.uploadId, uploadId))
            .limit(1);

        if (!upload) return s3ErrorResponse(S3Errors.NoSuchUpload(uploadId));

        const parts = await db.select().from(multipartParts)
            .where(eq(multipartParts.uploadId, uploadId))
            .orderBy(multipartParts.partNumber);

        const body = xml.listPartsResponse({
            bucket: bucketName,
            key,
            uploadId,
            parts: parts.map((p) => ({
                partNumber: p.partNumber,
                lastModified: p.createdAt,
                etag: p.etag,
                size: p.size,
            })),
            isTruncated: false,
            maxParts: 1000,
        });

        return new Response(body, {
            status: 200,
            headers: { 'Content-Type': 'application/xml' },
        });
    });
