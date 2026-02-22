import { Elysia, t } from 'elysia';
import { db } from '../../db/connection';
import { accessKeys, buckets } from '../../db/schema';
import { eq, sql } from 'drizzle-orm';
import { adminAuth } from '../../middleware/admin-auth';
import { randomBytes } from 'node:crypto';

function generateAccessKeyId(): string {
    return 'AK' + randomBytes(16).toString('hex').toUpperCase().slice(0, 18);
}

function generateSecretAccessKey(): string {
    return randomBytes(30).toString('base64url');
}

export const adminKeysRoutes = new Elysia({ prefix: '/admin/keys' })
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
        const keys = await db.select({
            id: accessKeys.id,
            accessKeyId: accessKeys.accessKeyId,
            displayName: accessKeys.displayName,
            isActive: accessKeys.isActive,
            createdAt: accessKeys.createdAt,
        }).from(accessKeys);

        return {
            keys: keys.map((k) => ({
                ...k,
                accessKeyId: k.accessKeyId,
                secretPrefix: '****',
            })),
        };
    })
    .post('/', async ({ body }) => {
        const displayName = (body as any)?.displayName || 'default';
        const accessKeyId = generateAccessKeyId();
        const secretAccessKey = generateSecretAccessKey();

        await db.insert(accessKeys).values({
            accessKeyId,
            secretAccessKey,
            displayName,
        });

        // Return secret only on creation (never shown again)
        return {
            accessKeyId,
            secretAccessKey,
            displayName,
            message: 'Save the secret key now. It will not be shown again.',
        };
    }, {
        body: t.Optional(t.Object({
            displayName: t.Optional(t.String()),
        })),
    })
    .delete('/:id', async ({ params }) => {
        const id = parseInt(params.id);
        const [key] = await db.select().from(accessKeys).where(eq(accessKeys.id, id)).limit(1);
        if (!key) {
            return new Response(JSON.stringify({ error: 'Key not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Check if any buckets are owned by this key
        const ownedBuckets = await db.select({ id: buckets.id }).from(buckets)
            .where(eq(buckets.ownerId, id));

        if (ownedBuckets.length > 0) {
            // Try to reassign to another key
            const [otherKey] = await db.select({ id: accessKeys.id }).from(accessKeys)
                .where(sql`${accessKeys.id} != ${id}`)
                .limit(1);

            if (!otherKey) {
                return new Response(JSON.stringify({
                    error: 'Cannot delete the last access key while buckets exist. Delete all buckets first.',
                }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }

            // Reassign buckets to another key
            await db.update(buckets).set({ ownerId: otherKey.id })
                .where(eq(buckets.ownerId, id));
        }

        await db.delete(accessKeys).where(eq(accessKeys.id, id));
        return { deleted: true };
    })
    .patch('/:id/toggle', async ({ params }) => {
        const id = parseInt(params.id);
        const [key] = await db.select().from(accessKeys).where(eq(accessKeys.id, id)).limit(1);
        if (!key) {
            return new Response(JSON.stringify({ error: 'Key not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        await db.update(accessKeys).set({ isActive: !key.isActive }).where(eq(accessKeys.id, id));
        return { id, isActive: !key.isActive };
    });
