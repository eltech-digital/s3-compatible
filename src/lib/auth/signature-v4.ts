import { createHmac, createHash } from 'node:crypto';

interface SignatureV4Params {
    method: string;
    path: string;
    query: Record<string, string>;
    headers: Record<string, string>;
    body: Buffer | Uint8Array | string;
    secretAccessKey: string;
}

interface ParsedAuth {
    accessKeyId: string;
    date: string;
    region: string;
    service: string;
    signedHeaders: string[];
    signature: string;
}

function hmacSHA256(key: Buffer | string, data: string): Buffer {
    return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256(data: Buffer | Uint8Array | string): string {
    return createHash('sha256').update(data).digest('hex');
}

export function parseAuthorizationHeader(authHeader: string): ParsedAuth | null {
    const match = authHeader.match(
        /^AWS4-HMAC-SHA256\s+Credential=([^/]+)\/(\d{8})\/([^/]+)\/([^/]+)\/aws4_request,\s*SignedHeaders=([^,]+),\s*Signature=([a-f0-9]+)$/
    );
    if (!match) return null;

    return {
        accessKeyId: match[1]!,
        date: match[2]!,
        region: match[3]!,
        service: match[4]!,
        signedHeaders: match[5]!.split(';'),
        signature: match[6]!,
    };
}

function getSigningKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
    const kDate = hmacSHA256(`AWS4${secretKey}`, dateStamp);
    const kRegion = hmacSHA256(kDate, region);
    const kService = hmacSHA256(kRegion, service);
    const kSigning = hmacSHA256(kService, 'aws4_request');
    return kSigning;
}

function buildCanonicalRequest(
    method: string,
    canonicalUri: string,
    canonicalQueryString: string,
    canonicalHeaders: string,
    signedHeaders: string,
    payloadHash: string,
): string {
    return [
        method,
        canonicalUri,
        canonicalQueryString,
        canonicalHeaders,
        '',
        signedHeaders,
        payloadHash,
    ].join('\n');
}

function buildStringToSign(datetime: string, scope: string, canonicalRequestHash: string): string {
    return ['AWS4-HMAC-SHA256', datetime, scope, canonicalRequestHash].join('\n');
}

function uriEncode(str: string, encodeSlash = true): string {
    // AWS-style URI encoding (RFC 3986)
    let encoded = '';
    for (const ch of str) {
        if (
            (ch >= 'A' && ch <= 'Z') ||
            (ch >= 'a' && ch <= 'z') ||
            (ch >= '0' && ch <= '9') ||
            ch === '_' || ch === '-' || ch === '~' || ch === '.'
        ) {
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

function getCanonicalUri(path: string): string {
    // Path from URL.pathname is already decoded — re-encode per AWS rules (don't encode slashes)
    return uriEncode(path, false) || '/';
}

function getCanonicalQueryString(query: Record<string, string>): string {
    const keys = Object.keys(query)
        .filter((k) => k !== 'X-Amz-Signature')
        .sort();
    return keys
        .map((k) => `${uriEncode(k)}=${uriEncode(query[k]!)}`)
        .join('&');
}

export function verifySignature(params: SignatureV4Params): boolean {
    const { method, path, query, headers, body, secretAccessKey } = params;

    // Get auth header
    const authHeader = headers['authorization'] || headers['Authorization'];
    if (!authHeader) return false;

    const parsed = parseAuthorizationHeader(authHeader);
    if (!parsed) return false;

    const { date, region, service, signedHeaders, signature } = parsed;
    const datetime = headers['x-amz-date'] || '';

    // Build canonical headers
    const canonicalHeaders = signedHeaders
        .map((h) => `${h.toLowerCase()}:${(headers[h] || headers[h.toLowerCase()] || '').trim()}`)
        .join('\n');

    const signedHeadersStr = signedHeaders.join(';');

    // Payload hash
    const payloadHash = headers['x-amz-content-sha256'] || sha256(body);

    // Build canonical request
    const canonicalUri = getCanonicalUri(path);
    const canonicalQueryString = getCanonicalQueryString(query);
    const canonicalRequest = buildCanonicalRequest(
        method.toUpperCase(),
        canonicalUri,
        canonicalQueryString,
        canonicalHeaders,
        signedHeadersStr,
        payloadHash,
    );

    // Build string to sign
    const scope = `${date}/${region}/${service}/aws4_request`;
    const stringToSign = buildStringToSign(datetime, scope, sha256(canonicalRequest));

    // Compute expected signature
    const signingKey = getSigningKey(secretAccessKey, date, region, service);
    const expectedSignature = hmacSHA256(signingKey, stringToSign).toString('hex');

    return expectedSignature === signature;
}

export function verifyPresignedUrl(params: {
    method: string;
    path: string;
    query: Record<string, string>;
    headers: Record<string, string>;
    secretAccessKey: string;
}): boolean {
    const { method, path, query, headers, secretAccessKey } = params;

    const algorithm = query['X-Amz-Algorithm'];
    if (algorithm !== 'AWS4-HMAC-SHA256') return false;

    const credential = query['X-Amz-Credential'];
    if (!credential) return false;

    const [, dateStamp, region, service] = credential.split('/');
    const signedHeaders = (query['X-Amz-SignedHeaders'] || '').split(';');
    const signature = query['X-Amz-Signature'];
    const datetime = query['X-Amz-Date'] || '';

    // Check expiry
    const expires = parseInt(query['X-Amz-Expires'] || '0');
    if (expires > 0) {
        const requestDate = new Date(
            `${datetime.substring(0, 4)}-${datetime.substring(4, 6)}-${datetime.substring(6, 8)}T${datetime.substring(9, 11)}:${datetime.substring(11, 13)}:${datetime.substring(13, 15)}Z`
        );
        const expiryTime = requestDate.getTime() + expires * 1000;
        if (Date.now() > expiryTime) return false;
    }

    // Build canonical headers (usually just 'host')
    const canonicalHeaders = signedHeaders
        .map((h) => `${h.toLowerCase()}:${(headers[h] || headers[h.toLowerCase()] || '').trim()}`)
        .join('\n');

    const signedHeadersStr = signedHeaders.join(';');
    const payloadHash = 'UNSIGNED-PAYLOAD';

    const canonicalUri = getCanonicalUri(path);
    const canonicalQueryString = getCanonicalQueryString(query);
    const canonicalRequest = buildCanonicalRequest(
        method.toUpperCase(),
        canonicalUri,
        canonicalQueryString,
        canonicalHeaders,
        signedHeadersStr,
        payloadHash,
    );

    const scope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = buildStringToSign(datetime, scope, sha256(canonicalRequest));

    const signingKey = getSigningKey(secretAccessKey, dateStamp!, region!, service!);
    const expectedSignature = hmacSHA256(signingKey, stringToSign).toString('hex');

    return expectedSignature === signature;
}

export function computeETag(data: Buffer | Uint8Array): string {
    return createHash('md5').update(data).digest('hex');
}

export function computeMultipartETag(partETags: string[], partCount: number): string {
    const binaryHashes = partETags.map((etag) => Buffer.from(etag.replace(/"/g, ''), 'hex'));
    const combined = Buffer.concat(binaryHashes);
    const hash = createHash('md5').update(combined).digest('hex');
    return `${hash}-${partCount}`;
}
