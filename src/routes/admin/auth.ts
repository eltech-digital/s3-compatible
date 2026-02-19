import { Elysia, t } from 'elysia';
import { env } from '../../config/env';
import { generateAdminToken, verifyAdminToken } from '../../middleware/admin-auth';

export const adminAuthRoutes = new Elysia({ prefix: '/admin/auth' })
    .post('/login', async ({ body }) => {
        const { username, password } = body as { username: string; password: string };

        if (username !== env.admin.username || password !== env.admin.password) {
            return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const token = generateAdminToken();
        return { token, expiresIn: 86400 };
    }, {
        body: t.Object({
            username: t.String(),
            password: t.String(),
        }),
    })
    .post('/verify', async ({ request }) => {
        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return { valid: false };
        }
        const token = authHeader.slice(7);
        return { valid: verifyAdminToken(token) };
    });
