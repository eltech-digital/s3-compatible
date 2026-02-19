import { Elysia } from 'elysia';
import { db } from '../../db/connection';
import { buckets, objects, multipartUploads, multipartParts } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { s3Auth } from '../../middleware/s3-auth';
import { storage } from '../../lib/storage/filesystem';
import { xml } from '../../lib/xml/builder';
import { S3Errors, s3ErrorResponse } from '../../lib/errors';
import { computeETag } from '../../lib/auth/signature-v4';

export const objectRoutes = new Elysia({ prefix: '' })
    .use(s3Auth)
    // PutObject / UploadPart — PUT /:bucket/*
    .put('/:bucket/*', async ({ params, request, s3Error, ownerId, bodyBuffer }) => {
        if (s3Error) return s3ErrorResponse(s3Error);

        const bucketName = params.bucket;
        const key = decodeURIComponent((params as any)['*']);
        if (!key) return s3ErrorResponse(S3Errors.InvalidArgument('Object key is required'));

        // Check if this is an UploadPart request
        const url = new URL(request.url);
        const uploadId = url.searchParams.get('uploadId');
        const partNumberStr = url.searchParams.get('partNumber');

        if (uploadId && partNumberStr) {
            // Handle as UploadPart
            const partNumber = parseInt(partNumberStr);
            const [upload] = await db.select().from(multipartUploads)
                .where(eq(multipartUploads.uploadId, uploadId))
                .limit(1);

            if (!upload) return s3ErrorResponse(S3Errors.NoSuchUpload(uploadId));

            const etag = computeETag(bodyBuffer);
            const partPath = await storage.writeMultipartPart(uploadId, partNumber, bodyBuffer);

            const [existingPart] = await db.select().from(multipartParts)
                .where(and(eq(multipartParts.uploadId, uploadId), eq(multipartParts.partNumber, partNumber)))
                .limit(1);

            if (existingPart) {
                await db.update(multipartParts).set({
                    size: bodyBuffer.length,
                    etag,
                    storagePath: partPath,
                }).where(eq(multipartParts.id, existingPart.id));
            } else {
                await db.insert(multipartParts).values({
                    uploadId,
                    partNumber,
                    size: bodyBuffer.length,
                    etag,
                    storagePath: partPath,
                });
            }

            return new Response(null, {
                status: 200,
                headers: { ETag: `"${etag}"` },
            });
        }

        // Check for CopyObject header
        const copySource = request.headers.get('x-amz-copy-source');
        if (copySource) {
            return handleCopyObject(bucketName, key, copySource, ownerId);
        }

        // Normal PutObject
        const [bucket] = await db.select().from(buckets)
            .where(eq(buckets.name, bucketName))
            .limit(1);

        if (!bucket) return s3ErrorResponse(S3Errors.NoSuchBucket(bucketName));

        const etag = computeETag(bodyBuffer);
        const contentType = request.headers.get('content-type') || 'application/octet-stream';

        // Extract user metadata (x-amz-meta-*)
        const metadata: Record<string, string> = {};
        request.headers.forEach((value, headerKey) => {
            if (headerKey.toLowerCase().startsWith('x-amz-meta-')) {
                metadata[headerKey.toLowerCase().slice(11)] = value;
            }
        });

        const { size, storagePath } = await storage.writeObject(bucketName, key, bodyBuffer);

        // Upsert object record
        const [existing] = await db.select().from(objects)
            .where(and(eq(objects.bucketId, bucket.id), eq(objects.key, key)))
            .limit(1);

        if (existing) {
            await db.update(objects).set({
                size,
                etag,
                contentType,
                storagePath,
                metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
            }).where(eq(objects.id, existing.id));
        } else {
            await db.insert(objects).values({
                bucketId: bucket.id,
                key,
                size,
                etag,
                contentType,
                storagePath,
                metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
            });
        }

        return new Response(null, {
            status: 200,
            headers: { ETag: `"${etag}"` },
        });
    })
    // GetObject — GET /:bucket/*
    .get('/:bucket/*', async ({ params, request, s3Error, ownerId }) => {
        if (s3Error) return s3ErrorResponse(s3Error);

        const bucketName = params.bucket;
        const key = decodeURIComponent((params as any)['*']);
        if (!key) return s3ErrorResponse(S3Errors.InvalidArgument('Object key is required'));

        const [bucket] = await db.select().from(buckets)
            .where(eq(buckets.name, bucketName))
            .limit(1);

        if (!bucket) return s3ErrorResponse(S3Errors.NoSuchBucket(bucketName));

        const [obj] = await db.select().from(objects)
            .where(and(eq(objects.bucketId, bucket.id), eq(objects.key, key)))
            .limit(1);

        if (!obj) return s3ErrorResponse(S3Errors.NoSuchKey(key));

        // Parse Range header
        const rangeHeader = request.headers.get('range');
        let range: { start: number; end: number } | undefined;
        let statusCode = 200;

        if (rangeHeader) {
            const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
            if (match) {
                const start = parseInt(match[1]!);
                const end = match[2] ? parseInt(match[2]) : obj.size - 1;
                if (start >= obj.size || start > end) {
                    return s3ErrorResponse(S3Errors.InvalidRange());
                }
                range = { start, end: Math.min(end, obj.size - 1) };
                statusCode = 206;
            }
        }

        const { stream, size } = await storage.readObject(bucketName, key, range);

        const headers: Record<string, string> = {
            'Content-Type': obj.contentType,
            'Content-Length': String(size),
            'ETag': `"${obj.etag}"`,
            'Last-Modified': obj.lastModified.toUTCString(),
            'Accept-Ranges': 'bytes',
        };

        if (range) {
            headers['Content-Range'] = `bytes ${range.start}-${range.end}/${obj.size}`;
        }

        // Add user metadata
        if (obj.metadata) {
            try {
                const meta = JSON.parse(obj.metadata);
                for (const [k, v] of Object.entries(meta)) {
                    headers[`x-amz-meta-${k}`] = String(v);
                }
            } catch { /* ignore */ }
        }

        return new Response(stream, { status: statusCode, headers });
    })
    // HeadObject — HEAD /:bucket/*
    .head('/:bucket/*', async ({ params, s3Error, ownerId }) => {
        if (s3Error) return s3ErrorResponse(s3Error);

        const bucketName = params.bucket;
        const key = decodeURIComponent((params as any)['*']);
        if (!key) return s3ErrorResponse(S3Errors.InvalidArgument('Object key is required'));

        const [bucket] = await db.select().from(buckets)
            .where(eq(buckets.name, bucketName))
            .limit(1);

        if (!bucket) return s3ErrorResponse(S3Errors.NoSuchBucket(bucketName));

        const [obj] = await db.select().from(objects)
            .where(and(eq(objects.bucketId, bucket.id), eq(objects.key, key)))
            .limit(1);

        if (!obj) return s3ErrorResponse(S3Errors.NoSuchKey(key));

        const headers: Record<string, string> = {
            'Content-Type': obj.contentType,
            'Content-Length': String(obj.size),
            'ETag': `"${obj.etag}"`,
            'Last-Modified': obj.lastModified.toUTCString(),
            'Accept-Ranges': 'bytes',
        };

        if (obj.metadata) {
            try {
                const meta = JSON.parse(obj.metadata);
                for (const [k, v] of Object.entries(meta)) {
                    headers[`x-amz-meta-${k}`] = String(v);
                }
            } catch { /* ignore */ }
        }

        return new Response(null, { status: 200, headers });
    })
    // DeleteObject — DELETE /:bucket/*
    .delete('/:bucket/*', async ({ params, s3Error, ownerId }) => {
        if (s3Error) return s3ErrorResponse(s3Error);

        const bucketName = params.bucket;
        const key = decodeURIComponent((params as any)['*']);
        if (!key) return s3ErrorResponse(S3Errors.InvalidArgument('Object key is required'));

        const [bucket] = await db.select().from(buckets)
            .where(eq(buckets.name, bucketName))
            .limit(1);

        if (!bucket) return s3ErrorResponse(S3Errors.NoSuchBucket(bucketName));

        const [obj] = await db.select().from(objects)
            .where(and(eq(objects.bucketId, bucket.id), eq(objects.key, key)))
            .limit(1);

        if (obj) {
            await storage.deleteObject(bucketName, key);
            await db.delete(objects).where(eq(objects.id, obj.id));
        }

        return new Response(null, { status: 204 });
    })
    // DeleteObjects (batch) — POST /:bucket?delete
    .post('/:bucket', async ({ params, request, query, s3Error, ownerId, bodyBuffer }) => {
        if (s3Error) return s3ErrorResponse(s3Error);

        // Only handle ?delete
        const url = new URL(request.url);
        if (!url.searchParams.has('delete')) {
            return s3ErrorResponse(S3Errors.MethodNotAllowed('POST'));
        }

        const bucketName = params.bucket;

        const [bucket] = await db.select().from(buckets)
            .where(eq(buckets.name, bucketName))
            .limit(1);

        if (!bucket) return s3ErrorResponse(S3Errors.NoSuchBucket(bucketName));

        const bodyText = bodyBuffer.toString('utf-8');
        const parsed = xml.parse(bodyText);

        let objectsToDelete: { Key: string }[] = [];
        const deleteObj = parsed?.Delete?.Object;
        if (Array.isArray(deleteObj)) {
            objectsToDelete = deleteObj;
        } else if (deleteObj) {
            objectsToDelete = [deleteObj];
        }

        const deleted: { key: string }[] = [];
        const errors: { key: string; code: string; message: string }[] = [];

        for (const item of objectsToDelete) {
            const objKey = item.Key;
            try {
                const [obj] = await db.select().from(objects)
                    .where(and(eq(objects.bucketId, bucket.id), eq(objects.key, objKey)))
                    .limit(1);

                if (obj) {
                    await storage.deleteObject(bucketName, objKey);
                    await db.delete(objects).where(eq(objects.id, obj.id));
                }
                deleted.push({ key: objKey });
            } catch (err: any) {
                errors.push({ key: objKey, code: 'InternalError', message: err.message });
            }
        }

        const body = xml.deleteObjectsResponse(deleted, errors);
        return new Response(body, {
            status: 200,
            headers: { 'Content-Type': 'application/xml' },
        });
    });

async function handleCopyObject(
    dstBucket: string,
    dstKey: string,
    copySource: string,
    ownerId: number,
): Promise<Response> {
    // Parse source: /bucket/key or bucket/key
    const cleanSource = copySource.startsWith('/') ? copySource.slice(1) : copySource;
    const slashIndex = cleanSource.indexOf('/');
    if (slashIndex < 0) {
        return s3ErrorResponse(S3Errors.InvalidArgument('Invalid x-amz-copy-source'));
    }
    const srcBucketName = cleanSource.slice(0, slashIndex);
    const srcKey = decodeURIComponent(cleanSource.slice(slashIndex + 1));

    // Verify source bucket
    const [srcBucket] = await db.select().from(buckets)
        .where(eq(buckets.name, srcBucketName))
        .limit(1);
    if (!srcBucket) return s3ErrorResponse(S3Errors.NoSuchBucket(srcBucketName));

    // Verify source object
    const [srcObj] = await db.select().from(objects)
        .where(and(eq(objects.bucketId, srcBucket.id), eq(objects.key, srcKey)))
        .limit(1);
    if (!srcObj) return s3ErrorResponse(S3Errors.NoSuchKey(srcKey));

    // Verify destination bucket
    const [dstBucketRecord] = await db.select().from(buckets)
        .where(eq(buckets.name, dstBucket))
        .limit(1);
    if (!dstBucketRecord) return s3ErrorResponse(S3Errors.NoSuchBucket(dstBucket));

    // Copy file
    await storage.copyObject(srcBucketName, srcKey, dstBucket, dstKey);

    const storagePath = `./storage/${dstBucket}/${dstKey}`;

    // Upsert destination record
    const [existing] = await db.select().from(objects)
        .where(and(eq(objects.bucketId, dstBucketRecord.id), eq(objects.key, dstKey)))
        .limit(1);

    if (existing) {
        await db.update(objects).set({
            size: srcObj.size,
            etag: srcObj.etag,
            contentType: srcObj.contentType,
            storagePath,
            metadata: srcObj.metadata,
        }).where(eq(objects.id, existing.id));
    } else {
        await db.insert(objects).values({
            bucketId: dstBucketRecord.id,
            key: dstKey,
            size: srcObj.size,
            etag: srcObj.etag,
            contentType: srcObj.contentType,
            storagePath,
            metadata: srcObj.metadata,
        });
    }

    const body = xml.copyObjectResponse(srcObj.etag, new Date());
    return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/xml' },
    });
}
