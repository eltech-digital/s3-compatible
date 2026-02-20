import { createHmac, createHash } from 'node:crypto';

const AK = 'AK98F89BAA9C1AF24DD8';
const SK = 'J_0CIzeVx_Fhx7Lk4mBpeJOfHJgtBB0CBXZ2Gbfl'; // need the actual SK for this key

// First, let's check if ListObjectsV2 returns proper XML
console.log('=== ListObjectsV2 Response Check ===');
const listUrl = 'http://localhost:3000/new-bucket-adaac36d?delimiter=%2F&max-keys=1000&prefix=';

// Use the other key that we know works
const AK2 = 'AK1842E865411256698A';
const SK2 = 'tOKKSI3HOaf7txs1fn1Ak8pMUcJ3SyTcR9-SZgZm';

// V2 presigned for list
const exp = Math.floor(Date.now() / 1000) + 300;
const sts = `GET\n\n\n${exp}\n/new-bucket-adaac36d`;
const sig = encodeURIComponent(createHmac('sha1', SK2).update(sts, 'utf8').digest('base64'));
const url = `http://localhost:3000/new-bucket-adaac36d?AWSAccessKeyId=${AK2}&Expires=${exp}&Signature=${sig}&delimiter=%2F&max-keys=1000&prefix=`;

const r = await fetch(url);
const body = await r.text();
console.log('Status:', r.status);
console.log('Content-Type:', r.headers.get('content-type'));
console.log('Body:\n', body);

// Check for proper XML structure
if (body.includes('<?xml')) {
    console.log('\n✅ Response starts with XML declaration');
} else {
    console.log('\n❌ Response does NOT start with XML declaration');
}

// Now generate a V4 presigned URL manually and test
console.log('\n\n=== V4 Presigned URL Test ===');

function hmacSHA256(key: Buffer | string, data: string): Buffer {
    return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256(data: string): string {
    return createHash('sha256').update(data).digest('hex');
}

function uriEncode(str: string, encodeSlash = true): string {
    let encoded = '';
    for (const ch of str) {
        if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch === '_' || ch === '-' || ch === '~' || ch === '.') {
            encoded += ch;
        } else if (ch === '/' && !encodeSlash) {
            encoded += '/';
        } else {
            const bytes = Buffer.from(ch, 'utf8');
            for (const byte of bytes) {
                encoded += `%${byte.toString(16).toUpperCase()}`;
            }
        }
    }
    return encoded;
}

// Generate V4 presigned URL
const host = 'localhost:3000';
const path = '/test-upload/get-test.txt';
const region = 'us-east-1';
const service = 's3';
const now = new Date();
const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
const datetime = dateStamp + 'T' + now.toISOString().slice(11, 19).replace(/:/g, '') + 'Z';
const expiresSeconds = '300';
const credential = `${AK2}/${dateStamp}/${region}/${service}/aws4_request`;

const canonicalUri = uriEncode(path, false);
const canonicalQueryParts = [
    `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
    `X-Amz-Credential=${uriEncode(credential)}`,
    `X-Amz-Date=${datetime}`,
    `X-Amz-Expires=${expiresSeconds}`,
    `X-Amz-SignedHeaders=host`,
].sort();
const canonicalQueryString = canonicalQueryParts.join('&');

const canonicalHeaders = `host:${host}`;
const canonicalRequest = [
    'GET',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    '',
    'host',
    'UNSIGNED-PAYLOAD',
].join('\n');

console.log('Canonical Request:\n', canonicalRequest);

const scope = `${dateStamp}/${region}/${service}/aws4_request`;
const stringToSign = ['AWS4-HMAC-SHA256', datetime, scope, sha256(canonicalRequest)].join('\n');

const kDate = hmacSHA256(`AWS4${SK2}`, dateStamp);
const kRegion = hmacSHA256(kDate, region);
const kService = hmacSHA256(kRegion, service);
const kSigning = hmacSHA256(kService, 'aws4_request');
const signature = hmacSHA256(kSigning, stringToSign).toString('hex');

const presignedUrl = `http://${host}${path}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
console.log('\nPresigned URL:', presignedUrl);

const r2 = await fetch(presignedUrl);
const body2 = await r2.text();
console.log('Status:', r2.status);
console.log('Body:', JSON.stringify(body2.substring(0, 100)));
console.log('Match:', body2.includes('Hello S3') ? '✅ PASS' : '❌ FAIL');
