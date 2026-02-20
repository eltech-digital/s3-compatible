import { createHmac } from 'node:crypto';

const AK = 'AK1842E865411256698A';
const SK = 'tOKKSI3HOaf7txs1fn1Ak8pMUcJ3SyTcR9-SZgZm';

// Helper: V2 presigned GET
function signedGet(path: string) {
    const exp = Math.floor(Date.now() / 1000) + 300;
    const sts = `GET\n\n\n${exp}\n${path}`;
    const sig = encodeURIComponent(createHmac('sha1', SK).update(sts, 'utf8').digest('base64'));
    return `http://localhost:3000${path}?AWSAccessKeyId=${AK}&Expires=${exp}&Signature=${sig}`;
}

// 1. Set test-upload bucket to public-read via admin API
console.log('=== Set bucket to public-read ===');
const patchRes = await fetch('http://localhost:3000/admin/buckets/test-upload', {
    method: 'PATCH',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(await (await fetch('http://localhost:3000/admin/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: 'admin123' }),
        })).json() as any).token}`,
    },
    body: JSON.stringify({ acl: 'public-read' }),
});
console.log('PATCH Status:', patchRes.status);
console.log('PATCH Body:', await patchRes.json());

// 2. Test anonymous GET (no auth) on public-read bucket
console.log('\n=== GET without auth (public-read) ===');
const r1 = await fetch('http://localhost:3000/test-upload/get-test.txt');
console.log('Status:', r1.status);
console.log('Content-Type:', r1.headers.get('content-type'));
const body1 = await r1.text();
console.log('Body:', JSON.stringify(body1.substring(0, 80)));
console.log('Result:', r1.status === 200 ? '✅ PASS (anonymous GET works on public bucket)' : '❌ FAIL');

// 3. Test anonymous PUT (should still fail)
console.log('\n=== PUT without auth (public-read bucket, should fail) ===');
const r2 = await fetch('http://localhost:3000/test-upload/test-write.txt', {
    method: 'PUT',
    body: 'should fail',
});
console.log('Status:', r2.status);
console.log('Result:', r2.status >= 400 ? '✅ PASS (anonymous PUT rejected)' : '❌ FAIL');

// 4. Set back to private
console.log('\n=== Set bucket to private ===');
const token = ((await (await fetch('http://localhost:3000/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
})).json()) as any).token;

await fetch('http://localhost:3000/admin/buckets/test-upload', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ acl: 'private' }),
});

// 5. Test anonymous GET on private bucket (should fail)
console.log('\n=== GET without auth (private bucket, should fail) ===');
const r3 = await fetch('http://localhost:3000/test-upload/get-test.txt');
console.log('Status:', r3.status);
console.log('Result:', r3.status >= 400 ? '✅ PASS (anonymous GET rejected on private bucket)' : '❌ FAIL');

// 6. Test authenticated GET on private bucket (should work)
console.log('\n=== GET with auth (private bucket) ===');
const url = signedGet('/test-upload/get-test.txt');
const r4 = await fetch(url);
console.log('Status:', r4.status);
const body4 = await r4.text();
console.log('Body:', JSON.stringify(body4.substring(0, 80)));
console.log('Result:', r4.status === 200 ? '✅ PASS (auth GET works on private bucket)' : '❌ FAIL');
