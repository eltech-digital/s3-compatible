import { Elysia } from 'elysia';
import { db } from '../../db/connection';
import { buckets, objects } from '../../db/schema';
import { eq, and, like, count, sql } from 'drizzle-orm';
import { s3Auth } from '../../middleware/s3-auth';
import { storage } from '../../lib/storage/filesystem';
import { xml } from '../../lib/xml/builder';
import { S3Errors, s3ErrorResponse } from '../../lib/errors';
import { env } from '../../config/env';

export const bucketRoutes = new Elysia({ prefix: '' })
    .use(s3Auth)
    .get('/', async ({ s3Error, accessKeyId, ownerId }) => {
        // ListBuckets
        if (s3Error) return s3ErrorResponse(s3Error);

        const userBuckets = await db.select().from(buckets);

        const body = xml.listBucketsResponse(
            String(ownerId),
            accessKeyId,
            userBuckets.map((b) => ({ name: b.name, creationDate: b.createdAt })),
        );
        return new Response(body, {
            status: 200,
            headers: { 'Content-Type': 'application/xml' },
        });
    })
    // HeadBucket
    .head('/:bucket', async ({ params, s3Error, ownerId }) => {
        if (s3Error) return s3ErrorResponse(s3Error);
        const bucketName = params.bucket;

        const [bucket] = await db.select().from(buckets)
            .where(eq(buckets.name, bucketName))
            .limit(1);

        if (!bucket) return s3ErrorResponse(S3Errors.NoSuchBucket(bucketName));

        return new Response(null, {
            status: 200,
            headers: {
                'x-amz-bucket-region': bucket.region,
            },
        });
    })
    // CreateBucket
    .put('/:bucket', async ({ params, s3Error, ownerId }) => {
        if (s3Error) return s3ErrorResponse(s3Error);
        const bucketName = params.bucket;

        // Validate bucket name (S3 rules)
        if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucketName)) {
            return s3ErrorResponse(S3Errors.InvalidBucketName(bucketName));
        }

        // Check if exists
        const [existing] = await db.select().from(buckets)
            .where(eq(buckets.name, bucketName))
            .limit(1);

        if (existing) return s3ErrorResponse(S3Errors.BucketAlreadyExists(bucketName));

        // Create in DB and filesystem
        await db.insert(buckets).values({
            name: bucketName,
            ownerId,
            region: env.s3Region,
        });
        await storage.createBucket(bucketName);

        return new Response(null, {
            status: 200,
            headers: { Location: `/${bucketName}` },
        });
    })
    // DeleteBucket
    .delete('/:bucket', async ({ params, s3Error, ownerId }) => {
        if (s3Error) return s3ErrorResponse(s3Error);
        const bucketName = params.bucket;

        const [bucket] = await db.select().from(buckets)
            .where(eq(buckets.name, bucketName))
            .limit(1);

        if (!bucket) return s3ErrorResponse(S3Errors.NoSuchBucket(bucketName));

        // Check if empty
        const [objCount] = await db.select({ count: count() }).from(objects)
            .where(eq(objects.bucketId, bucket.id));

        if (objCount && objCount.count > 0) {
            return s3ErrorResponse(S3Errors.BucketNotEmpty(bucketName));
        }

        await db.delete(buckets).where(eq(buckets.id, bucket.id));
        await storage.deleteBucket(bucketName);

        return new Response(null, { status: 204 });
    })
    // ListObjectsV2 (GET /:bucket?list-type=2)
    .get('/:bucket', async ({ params, query, s3Error, ownerId }) => {
        if (s3Error) return s3ErrorResponse(s3Error);
        const bucketName = params.bucket;

        const [bucket] = await db.select().from(buckets)
            .where(eq(buckets.name, bucketName))
            .limit(1);

        if (!bucket) return s3ErrorResponse(S3Errors.NoSuchBucket(bucketName));

        const prefix = (query as any)?.prefix || '';
        const delimiter = (query as any)?.delimiter || '';
        const maxKeys = Math.min(parseInt((query as any)?.['max-keys'] || '1000'), 1000);
        const continuationToken = (query as any)?.['continuation-token'];

        // Query objects
        let q = db.select().from(objects)
            .where(
                prefix
                    ? and(eq(objects.bucketId, bucket.id), like(objects.key, `${prefix}%`))
                    : eq(objects.bucketId, bucket.id)
            )
            .orderBy(objects.key)
            .limit(maxKeys + 1);

        if (continuationToken) {
            q = db.select().from(objects)
                .where(
                    prefix
                        ? and(eq(objects.bucketId, bucket.id), like(objects.key, `${prefix}%`), sql`${objects.key} > ${continuationToken}`)
                        : and(eq(objects.bucketId, bucket.id), sql`${objects.key} > ${continuationToken}`)
                )
                .orderBy(objects.key)
                .limit(maxKeys + 1) as any;
        }

        const allObjects = await q;
        const isTruncated = allObjects.length > maxKeys;
        const resultObjects = allObjects.slice(0, maxKeys);

        // Handle delimiter (common prefixes)
        let contents = resultObjects;
        let commonPrefixes: string[] = [];

        if (delimiter) {
            const prefixSet = new Set<string>();
            contents = [];
            for (const obj of resultObjects) {
                const keyAfterPrefix = obj.key.slice(prefix.length);
                const delimiterIndex = keyAfterPrefix.indexOf(delimiter);
                if (delimiterIndex >= 0) {
                    prefixSet.add(prefix + keyAfterPrefix.slice(0, delimiterIndex + delimiter.length));
                } else {
                    contents.push(obj);
                }
            }
            commonPrefixes = Array.from(prefixSet).sort();
        }

        const body = xml.listObjectsV2Response({
            name: bucketName,
            prefix,
            delimiter: delimiter || undefined,
            maxKeys,
            isTruncated,
            contents: contents.map((o) => ({
                key: o.key,
                lastModified: o.lastModified,
                etag: o.etag,
                size: o.size,
            })),
            commonPrefixes: commonPrefixes.length > 0 ? commonPrefixes : undefined,
            continuationToken,
            nextContinuationToken: isTruncated ? resultObjects[resultObjects.length - 1]?.key : undefined,
            keyCount: contents.length + commonPrefixes.length,
        });

        return new Response(body, {
            status: 200,
            headers: { 'Content-Type': 'application/xml' },
        });
    });
