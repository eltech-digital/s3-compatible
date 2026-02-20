import { Elysia, t } from 'elysia';
import { env } from '../../config/env';
import { generateAdminToken, verifyAdminToken } from '../../middleware/admin-auth';

// Rate limiter: max 5 attempts per IP per 15 minutes
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const record = loginAttempts.get(ip);
    if (!record || now > record.resetAt) {
        loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
        return true;
    }
    record.count++;
    return record.count <= MAX_ATTEMPTS;
}

// Cleanup expired entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of loginAttempts) {
        if (now > record.resetAt) loginAttempts.delete(ip);
    }
}, 5 * 60 * 1000);

export const adminAuthRoutes = new Elysia({ prefix: '/admin/auth' })
    .post('/login', async ({ body, request }) => {
        const { username, password } = body as { username: string; password: string };

        // Rate limit check
        const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || 'unknown';

        if (!checkRateLimit(clientIp)) {
            return new Response(JSON.stringify({ error: 'Too many login attempts. Try again later.' }), {
                status: 429,
                headers: {
                    'Content-Type': 'application/json',
                    'Retry-After': '900',
                },
            });
        }

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

