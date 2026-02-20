import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { env } from './config/env';
import { bucketRoutes } from './routes/s3/bucket';
import { objectRoutes } from './routes/s3/object';
import { multipartRoutes } from './routes/s3/multipart';
import { adminAuthRoutes } from './routes/admin/auth';
import { adminKeysRoutes } from './routes/admin/keys';
import { adminStatsRoutes } from './routes/admin/stats';
import { adminBucketsRoutes } from './routes/admin/buckets';

const app = new Elysia()
    .use(cors({
        origin: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
        allowedHeaders: ['*'],
        exposeHeaders: ['ETag', 'x-amz-request-id', 'x-amz-id-2', 'Content-Range', 'Accept-Ranges'],
    }))
    .onRequest(({ request }) => {
        const url = new URL(request.url);
        console.log(`[${new Date().toISOString()}] ${request.method} ${url.pathname}${url.search}`);
    })
    // Admin routes (must be registered first so /admin/* doesn't hit S3 routes)
    .use(adminAuthRoutes)
    .use(adminKeysRoutes)
    .use(adminStatsRoutes)
    .use(adminBucketsRoutes)
    // S3 service health check (no auth required — Cyberduck probes this)
    .head('/', () => new Response(null, { status: 200 }))
    // WebDAV PROPFIND fallback (Cyberduck tries this too)
    .all('/PROPFIND_FALLBACK_UNUSED', () => new Response(null, { status: 405 }))
    .onRequest(({ request, set }) => {
        if (request.method === 'PROPFIND') {
            return new Response(null, { status: 405 });
        }
    })
    // S3-compatible routes
    // Order matters: multipart first (more specific query params), then objects, then buckets
    .use(multipartRoutes)
    .use(objectRoutes)
    .use(bucketRoutes)
    .listen(env.port);

console.log(`
╔═══════════════════════════════════════════════════╗
║          S3-Compatible Server Started             ║
╠═══════════════════════════════════════════════════╣
║  S3 API:    http://${env.host}:${env.port}              ║
║  Dashboard: http://localhost:5173                 ║
║  Admin:     http://${env.host}:${env.port}/admin        ║
╚═══════════════════════════════════════════════════╝
`);

export type App = typeof app;
