import { Elysia, t } from 'elysia';
import { db } from '../../db/connection';
import { buckets, objects, accessKeys } from '../../db/schema';
import { eq, and, like, count, sum, desc } from 'drizzle-orm';
import { adminAuth } from '../../middleware/admin-auth';
import { storage } from '../../lib/storage/filesystem';
import { generatePresignedUrl } from '../../lib/auth/signature-v4';

export const adminBucketsRoutes = new Elysia({ prefix: '/admin/buckets' })
    .use(adminAuth)
    .onBeforeHandle(({ isAdmin }) => {
        if (!isAdmin) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    })
    .post('/', async ({ body }) => {
        const { name, region, acl, maxSize } = body as { name: string; region?: string; acl?: string; maxSize?: number };

        if (!name || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(name)) {
            return new Response(JSON.stringify({ error: 'Invalid bucket name. Use 3-63 lowercase alphanumeric characters, dots, or hyphens.' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Check if bucket already exists
        const [existing] = await db.select().from(buckets).where(eq(buckets.name, name)).limit(1);
        if (existing) {
            return new Response(JSON.stringify({ error: 'Bucket already exists' }), {
                status: 409,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Auto-resolve owner from first access key
        const [firstKey] = await db.select({ id: accessKeys.id }).from(accessKeys).limit(1);
        if (!firstKey) {
            return new Response(JSON.stringify({ error: 'No access keys exist. Create an access key first.' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        await db.insert(buckets).values({
            name,
            ownerId: firstKey.id,
            region: region || 'us-east-1',
            acl: acl === 'public-read' ? 'public-read' : 'private',
            maxSize: maxSize && maxSize > 0 ? maxSize : 0,
        });

        await storage.createBucket(name);

        const [created] = await db.select().from(buckets).where(eq(buckets.name, name)).limit(1);
        return { bucket: created, message: 'Bucket created successfully' };
    })
    .delete('/:bucket', async ({ params }) => {
        const bucketName = params.bucket;

        const [bucket] = await db.select().from(buckets).where(eq(buckets.name, bucketName)).limit(1);
        if (!bucket) {
            return new Response(JSON.stringify({ error: 'Bucket not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Delete all objects in this bucket (DB + filesystem)
        await db.delete(objects).where(eq(objects.bucketId, bucket.id));
        await storage.deleteBucket(bucketName);
        await db.delete(buckets).where(eq(buckets.id, bucket.id));

        return { deleted: true, name: bucketName };
    })
    .get('/', async () => {
        const allBuckets = await db.select().from(buckets);

        const result = [];
        for (const b of allBuckets) {
            const [objStats] = await db.select({
                count: count(),
                totalSize: sum(objects.size),
            }).from(objects).where(eq(objects.bucketId, b.id));

            result.push({
                id: b.id,
                name: b.name,
                region: b.region,
                acl: b.acl,
                maxSize: b.maxSize,
                createdAt: b.createdAt,
                objectCount: objStats?.count || 0,
                totalSize: Number(objStats?.totalSize || 0),
            });
        }
        return { buckets: result };
    })
    .get('/:bucket', async ({ params }) => {
        const bucketName = params.bucket;
        const [bucket] = await db.select().from(buckets).where(eq(buckets.name, bucketName)).limit(1);
        if (!bucket) {
            return new Response(JSON.stringify({ error: 'Bucket not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        const [objStats] = await db.select({
            count: count(),
            totalSize: sum(objects.size),
        }).from(objects).where(eq(objects.bucketId, bucket.id));

        return {
            bucket: {
                id: bucket.id,
                name: bucket.name,
                region: bucket.region,
                acl: bucket.acl,
                maxSize: bucket.maxSize,
                createdAt: bucket.createdAt,
                objectCount: objStats?.count || 0,
                totalSize: Number(objStats?.totalSize || 0),
            },
        };
    })
    .patch('/:bucket', async ({ params, body }) => {
        const bucketName = params.bucket;
        const { acl, maxSize } = body as { acl?: string; maxSize?: number };

        const [bucket] = await db.select().from(buckets).where(eq(buckets.name, bucketName)).limit(1);
        if (!bucket) {
            return new Response(JSON.stringify({ error: 'Bucket not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const updates: Record<string, any> = {};
        if (acl && ['private', 'public-read'].includes(acl)) {
            updates.acl = acl;
        }
        if (maxSize !== undefined) {
            updates.maxSize = maxSize >= 0 ? maxSize : 0;
        }
        if (Object.keys(updates).length > 0) {
            await db.update(buckets).set(updates).where(eq(buckets.id, bucket.id));
        }

        const [updated] = await db.select().from(buckets).where(eq(buckets.id, bucket.id)).limit(1);
        return { bucket: updated, message: 'Bucket updated successfully' };
    })
    .get('/:bucket/objects', async ({ params, query }) => {
        const bucketName = params.bucket;
        const prefix = (query as any)?.prefix || '';
        const page = parseInt((query as any)?.page || '1');
        const limit = Math.min(parseInt((query as any)?.limit || '50'), 100);
        const offset = (page - 1) * limit;

        const [bucket] = await db.select().from(buckets)
            .where(eq(buckets.name, bucketName))
            .limit(1);

        if (!bucket) {
            return new Response(JSON.stringify({ error: 'Bucket not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const whereClause = prefix
            ? and(eq(objects.bucketId, bucket.id), like(objects.key, `${prefix}%`))
            : eq(objects.bucketId, bucket.id);

        const [total] = await db.select({ count: count() }).from(objects).where(whereClause);

        const objs = await db.select().from(objects)
            .where(whereClause)
            .orderBy(objects.key)
            .limit(limit)
            .offset(offset);

        return {
            bucket: bucketName,
            objects: objs.map((o) => ({
                id: o.id,
                key: o.key,
                size: o.size,
                etag: o.etag,
                contentType: o.contentType,
                lastModified: o.lastModified,
                metadata: o.metadata ? JSON.parse(o.metadata) : null,
            })),
            pagination: {
                page,
                limit,
                total: total?.count || 0,
                totalPages: Math.ceil((total?.count || 0) / limit),
            },
        };
    })
    .delete('/:bucket/objects/*', async ({ params }) => {
        const bucketName = params.bucket;
        const key = (params as any)['*'];

        const [bucket] = await db.select().from(buckets)
            .where(eq(buckets.name, bucketName))
            .limit(1);

        if (!bucket) {
            return new Response(JSON.stringify({ error: 'Bucket not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const [obj] = await db.select().from(objects)
            .where(and(eq(objects.bucketId, bucket.id), eq(objects.key, key)))
            .limit(1);

        if (!obj) {
            return new Response(JSON.stringify({ error: 'Object not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        await storage.deleteObject(bucketName, key);
        await db.delete(objects).where(eq(objects.id, obj.id));

        return { deleted: true, key };
    })
    .get('/:bucket/link/*', async ({ params }) => {
        const bucketName = params.bucket;
        const key = (params as any)['*'];

        const [bucket] = await db.select().from(buckets)
            .where(eq(buckets.name, bucketName))
            .limit(1);

        if (!bucket) {
            return new Response(JSON.stringify({ error: 'Bucket not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const host = process.env.S3_PUBLIC_HOST || `localhost:${process.env.PORT || '3000'}`;
        const protocol = host.includes('localhost') ? 'http' : 'https';
        const objectPath = `/${bucketName}/${key}`;

        // Public bucket — direct URL
        if (bucket.acl === 'public-read') {
            return { url: `${protocol}://${host}${objectPath}`, expiresIn: null };
        }

        // Private bucket — presigned URL (24 hours)
        const [firstKey] = await db.select().from(accessKeys)
            .where(eq(accessKeys.isActive, true))
            .limit(1);

        if (!firstKey) {
            return new Response(JSON.stringify({ error: 'No active access key available for signing' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const expiresIn = 86400; // 24 hours
        const url = generatePresignedUrl({
            method: 'GET',
            host,
            path: objectPath,
            accessKeyId: firstKey.accessKeyId,
            secretAccessKey: firstKey.secretAccessKey,
            region: bucket.region,
            expiresIn,
        });

        return { url, expiresIn };
    });
