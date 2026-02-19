import { Elysia } from 'elysia';
import { db } from '../../db/connection';
import { accessKeys, buckets, objects } from '../../db/schema';
import { count, sum, sql, eq, desc } from 'drizzle-orm';
import { adminAuth } from '../../middleware/admin-auth';
import { storage } from '../../lib/storage/filesystem';

export const adminStatsRoutes = new Elysia({ prefix: '/admin/stats' })
    .use(adminAuth)
    .onBeforeHandle(({ isAdmin }) => {
        if (!isAdmin) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    })
    .get('/', async () => {
        const [bucketCount] = await db.select({ count: count() }).from(buckets);
        const [objectCount] = await db.select({ count: count() }).from(objects);
        const [storageUsed] = await db.select({ total: sum(objects.size) }).from(objects);
        const [keyCount] = await db.select({ count: count() }).from(accessKeys);

        const recentObjects = await db.select({
            key: objects.key,
            size: objects.size,
            contentType: objects.contentType,
            createdAt: objects.createdAt,
            bucketId: objects.bucketId,
        }).from(objects)
            .orderBy(desc(objects.createdAt))
            .limit(10);

        // Get bucket names for recent objects
        const bucketIds = [...new Set(recentObjects.map((o) => o.bucketId))];
        const bucketRecords = bucketIds.length > 0
            ? await db.select({ id: buckets.id, name: buckets.name }).from(buckets)
                .where(sql`${buckets.id} IN (${sql.join(bucketIds.map(id => sql`${id}`), sql`, `)})`)
            : [];
        const bucketMap = new Map(bucketRecords.map((b) => [b.id, b.name]));

        return {
            totalBuckets: bucketCount?.count || 0,
            totalObjects: objectCount?.count || 0,
            totalStorageBytes: Number(storageUsed?.total || 0),
            totalKeys: keyCount?.count || 0,
            recentUploads: recentObjects.map((o) => ({
                key: o.key,
                bucket: bucketMap.get(o.bucketId) || 'unknown',
                size: o.size,
                contentType: o.contentType,
                createdAt: o.createdAt,
            })),
        };
    });
