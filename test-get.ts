import { createHmac } from 'node:crypto';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const AK = 'AK1842E865411256698A';
const SK = 'tOKKSI3HOaf7txs1fn1Ak8pMUcJ3SyTcR9-SZgZm';

const s3 = new S3Client({
    endpoint: 'http://localhost:3000',
    region: 'us-east-1',
    credentials: { accessKeyId: AK, secretAccessKey: SK },
    forcePathStyle: true,
});

// 1. PUT a test object
console.log('=== PutObject ===');
const testBody = 'Hello S3! This is a test body for GetObject.';
const put = await s3.send(new PutObjectCommand({
    Bucket: 'test-upload',
    Key: 'get-test.txt',
    Body: testBody,
    ContentType: 'text/plain',
}));
console.log('PUT Status:', put.$metadata.httpStatusCode);
console.log('PUT ETag:', put.ETag);

// 2. GET the object via AWS SDK (V4 auth)
console.log('\n=== GetObject (AWS SDK V4) ===');
const get = await s3.send(new GetObjectCommand({
    Bucket: 'test-upload',
    Key: 'get-test.txt',
}));
console.log('GET Status:', get.$metadata.httpStatusCode);
console.log('GET ContentType:', get.ContentType);
console.log('GET ContentLength:', get.ContentLength);
console.log('GET ETag:', get.ETag);
const body = await get.Body?.transformToString();
console.log('GET Body:', JSON.stringify(body));
console.log('GET Body matches:', body === testBody ? '✅ PASS' : '❌ FAIL');

// 3. GET via V2 presigned URL
console.log('\n=== GetObject (V2 Presigned URL) ===');
const exp = Math.floor(Date.now() / 1000) + 300;
const sts = `GET\n\n\n${exp}\n/test-upload/get-test.txt`;
const sig = encodeURIComponent(createHmac('sha1', SK).update(sts, 'utf8').digest('base64'));
const url = `http://localhost:3000/test-upload/get-test.txt?AWSAccessKeyId=${AK}&Expires=${exp}&Signature=${sig}`;

const r = await fetch(url);
const b = await r.text();
console.log('V2 Status:', r.status);
console.log('V2 Content-Type:', r.headers.get('content-type'));
console.log('V2 Content-Length:', r.headers.get('content-length'));
console.log('V2 ETag:', r.headers.get('etag'));
console.log('V2 Body:', JSON.stringify(b));
console.log('V2 Body matches:', b === testBody ? '✅ PASS' : '❌ FAIL');

// 4. HEAD object
console.log('\n=== HeadObject ===');
const headUrl = `http://localhost:3000/test-upload/get-test.txt?AWSAccessKeyId=${AK}&Expires=${exp}&Signature=${sig}`;
const h = await fetch(headUrl, { method: 'HEAD' });
console.log('HEAD Status:', h.status);
console.log('HEAD Content-Type:', h.headers.get('content-type'));
console.log('HEAD Content-Length:', h.headers.get('content-length'));
console.log('HEAD ETag:', h.headers.get('etag'));
