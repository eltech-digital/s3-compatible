import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

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

function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
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
    // URL.pathname in Bun preserves percent-encoding (e.g. %20 stays as %20)
    // We must decode first, then re-encode with AWS-compatible encoding to avoid double-encoding
    const decoded = decodeURIComponent(path);
    return uriEncode(decoded, false) || '/';
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

    const signedHeadersStr = signedHeaders.join(';');
    const canonicalUri = getCanonicalUri(path);
    const canonicalQueryString = getCanonicalQueryString(query);
    const scope = `${date}/${region}/${service}/aws4_request`;
    const signingKey = getSigningKey(secretAccessKey, date, region, service);

    // Collect payload hash candidates — intermediaries (Cloudflare, CDNs) may modify
    // x-amz-content-sha256 between client signing and server receipt.
    const receivedHash = headers['x-amz-content-sha256'] || sha256(body);
    const EMPTY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const candidates = new Set([receivedHash, 'UNSIGNED-PAYLOAD', EMPTY_HASH]);

    for (const candidateHash of candidates) {
        // Rebuild canonical headers with this payload hash candidate
        const canonicalHeaders = signedHeaders
            .map((h) => {
                const key = h.toLowerCase();
                if (key === 'x-amz-content-sha256') return `${key}:${candidateHash}`;
                return `${key}:${(headers[h] || headers[key] || '').trim()}`;
            })
            .join('\n');

        const canonicalRequest = buildCanonicalRequest(
            method.toUpperCase(), canonicalUri, canonicalQueryString,
            canonicalHeaders, signedHeadersStr, candidateHash,
        );

        const stringToSign = buildStringToSign(datetime, scope, sha256(canonicalRequest));
        const expectedSignature = hmacSHA256(signingKey, stringToSign).toString('hex');

        if (safeCompare(expectedSignature, signature)) return true;
    }

    return false;
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
    if (!signature) return false;
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

    return safeCompare(expectedSignature, signature);
}

export function verifyPresignedUrlV2(params: {
    method: string;
    path: string;
    query: Record<string, string>;
    headers: Record<string, string>;
    secretAccessKey: string;
}): boolean {
    const { method, path, query, headers, secretAccessKey } = params;

    const expires = query['Expires'];
    const signature = query['Signature'];
    if (!expires || !signature) return false;

    // Check expiry
    const expiryTime = parseInt(expires) * 1000;
    if (Date.now() > expiryTime) return false;

    // Build canonicalized AMZ headers
    const amzHeaders: [string, string][] = [];
    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase().startsWith('x-amz-')) {
            amzHeaders.push([key.toLowerCase(), value.trim()]);
        }
    }
    amzHeaders.sort((a, b) => a[0].localeCompare(b[0]));
    const canonicalizedAmzHeaders = amzHeaders.length > 0
        ? amzHeaders.map(([k, v]) => `${k}:${v}`).join('\n') + '\n'
        : '';

    // Build canonicalized resource (path + sub-resources)
    const decoded = decodeURIComponent(path);
    const subResources = ['acl', 'lifecycle', 'location', 'logging', 'notification',
        'partNumber', 'policy', 'requestPayment', 'torrent', 'uploadId',
        'uploads', 'versionId', 'versioning', 'versions', 'website',
        'delete', 'cors', 'tagging', 'restore', 'replication'];
    const queryParts: string[] = [];
    for (const key of Object.keys(query).sort()) {
        if (subResources.includes(key)) {
            queryParts.push(query[key] ? `${key}=${query[key]}` : key);
        }
    }
    const canonicalizedResource = decoded + (queryParts.length > 0 ? '?' + queryParts.join('&') : '');

    // String to sign for V2
    const contentMd5 = headers['content-md5'] || '';
    const contentType = headers['content-type'] || '';
    const stringToSign = [
        method.toUpperCase(),
        contentMd5,
        contentType,
        expires,
        canonicalizedAmzHeaders + canonicalizedResource,
    ].join('\n');

    // HMAC-SHA1
    const expectedSignature = createHmac('sha1', secretAccessKey)
        .update(stringToSign, 'utf8')
        .digest('base64');

    return safeCompare(expectedSignature, signature);
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

export function generatePresignedUrl(params: {
    method: string;
    host: string;
    path: string;
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    expiresIn: number;
}): string {
    const { method, host, path, accessKeyId, secretAccessKey, region, expiresIn } = params;
    const now = new Date();
    const datetime = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const dateStamp = datetime.slice(0, 8);
    const service = 's3';
    const credential = `${accessKeyId}/${dateStamp}/${region}/${service}/aws4_request`;
    const signedHeaders = 'host';

    const canonicalUri = uriEncode(path, false) || '/';

    const queryParams: Record<string, string> = {
        'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
        'X-Amz-Credential': credential,
        'X-Amz-Date': datetime,
        'X-Amz-Expires': String(expiresIn),
        'X-Amz-SignedHeaders': signedHeaders,
    };

    const canonicalQueryString = Object.keys(queryParams)
        .sort()
        .map((k) => `${uriEncode(k)}=${uriEncode(queryParams[k]!)}`)
        .join('&');

    const canonicalHeaders = `host:${host}`;
    const payloadHash = 'UNSIGNED-PAYLOAD';

    const canonicalRequest = buildCanonicalRequest(
        method.toUpperCase(),
        canonicalUri,
        canonicalQueryString,
        canonicalHeaders,
        signedHeaders,
        payloadHash,
    );

    const scope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = buildStringToSign(datetime, scope, sha256(canonicalRequest));

    const signingKey = getSigningKey(secretAccessKey, dateStamp, region, service);
    const signature = hmacSHA256(signingKey, stringToSign).toString('hex');

    const protocol = host.includes('localhost') ? 'http' : 'https';
    return `${protocol}://${host}${path}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}
