import { Elysia } from 'elysia';
import { env } from '../config/env';
import { createHash } from 'node:crypto';

function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

export function generateAdminToken(): string {
    const payload = {
        sub: 'admin',
        iat: Date.now(),
        exp: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        nonce: crypto.randomUUID(),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = hashToken(`${encoded}.${env.jwtSecret}`);
    return `${encoded}.${signature}`;
}

export function verifyAdminToken(token: string): boolean {
    try {
        const [encoded, signature] = token.split('.');
        if (!encoded || !signature) return false;

        const expectedSig = hashToken(`${encoded}.${env.jwtSecret}`);
        if (expectedSig !== signature) return false;

        const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());
        if (payload.exp && payload.exp < Date.now()) return false;

        return true;
    } catch {
        return false;
    }
}

export const adminAuth = new Elysia({ name: 'admin-auth' })
    .derive({ as: 'scoped' }, async ({ request }) => {
        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return { isAdmin: false };
        }
        const token = authHeader.slice(7);
        return { isAdmin: verifyAdminToken(token) };
    });
