import { mkdir, writeFile, readFile, unlink, stat, readdir, rename, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createReadStream, existsSync } from 'node:fs';
import { env } from '../../config/env';

const basePath = env.storagePath;

async function ensureDir(dirPath: string): Promise<void> {
    await mkdir(dirPath, { recursive: true });
}

function getObjectPath(bucket: string, key: string): string {
    return join(basePath, bucket, key);
}

function getBucketPath(bucket: string): string {
    return join(basePath, bucket);
}

function getMultipartPath(uploadId: string, partNumber: number): string {
    return join(basePath, '.multipart', uploadId, `part-${partNumber}`);
}

export const storage = {
    async createBucket(bucket: string): Promise<void> {
        await ensureDir(getBucketPath(bucket));
    },

    async deleteBucket(bucket: string): Promise<void> {
        const bucketPath = getBucketPath(bucket);
        if (existsSync(bucketPath)) {
            await rm(bucketPath, { recursive: true, force: true });
        }
    },

    async writeObject(bucket: string, key: string, data: Buffer | Uint8Array): Promise<{ size: number; storagePath: string }> {
        const filePath = getObjectPath(bucket, key);

        // If key ends with '/', this is a folder marker — create directory instead of file
        if (key.endsWith('/')) {
            await ensureDir(filePath);
            return { size: 0, storagePath: filePath };
        }

        // Before creating parent directories, check if any path segment exists as a file
        // (this happens when a folder marker was previously created as a zero-byte file)
        const parentDir = dirname(filePath);
        const bucketRoot = getBucketPath(bucket);
        const relPath = parentDir.slice(bucketRoot.length);
        const segments = relPath.split(/[\\/]/).filter(Boolean);
        let currentPath = bucketRoot;
        for (const seg of segments) {
            currentPath = join(currentPath, seg);
            if (existsSync(currentPath)) {
                const s = await stat(currentPath);
                if (s.isFile()) {
                    // Remove the file so we can create a directory in its place
                    await unlink(currentPath);
                }
            }
        }

        await ensureDir(parentDir);
        await writeFile(filePath, data);
        return { size: data.length, storagePath: filePath };
    },

    async readObject(bucket: string, key: string, range?: { start: number; end: number }): Promise<{ stream: ReadableStream; size: number }> {
        const filePath = getObjectPath(bucket, key);
        const fileStat = await stat(filePath);

        if (range) {
            const nodeStream = createReadStream(filePath, { start: range.start, end: range.end });
            const stream = new ReadableStream({
                start(controller) {
                    nodeStream.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
                    nodeStream.on('end', () => controller.close());
                    nodeStream.on('error', (err) => controller.error(err));
                },
                cancel() {
                    nodeStream.destroy();
                },
            });
            return { stream, size: range.end - range.start + 1 };
        }

        const data = await readFile(filePath);
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(new Uint8Array(data));
                controller.close();
            },
        });
        return { stream, size: fileStat.size };
    },

    async readObjectAsBuffer(bucket: string, key: string): Promise<Buffer> {
        const filePath = getObjectPath(bucket, key);
        return readFile(filePath);
    },

    async deleteObject(bucket: string, key: string): Promise<void> {
        const filePath = getObjectPath(bucket, key);
        if (existsSync(filePath)) {
            await unlink(filePath);
        }
    },

    async copyObject(srcBucket: string, srcKey: string, dstBucket: string, dstKey: string): Promise<void> {
        const srcPath = getObjectPath(srcBucket, srcKey);
        const dstPath = getObjectPath(dstBucket, dstKey);
        await ensureDir(dirname(dstPath));
        const data = await readFile(srcPath);
        await writeFile(dstPath, data);
    },

    async statObject(bucket: string, key: string): Promise<{ size: number; mtime: Date } | null> {
        const filePath = getObjectPath(bucket, key);
        if (!existsSync(filePath)) return null;
        const s = await stat(filePath);
        return { size: s.size, mtime: s.mtime };
    },

    async bucketExists(bucket: string): Promise<boolean> {
        return existsSync(getBucketPath(bucket));
    },

    /** Multipart helpers */
    async writeMultipartPart(uploadId: string, partNumber: number, data: Buffer | Uint8Array): Promise<string> {
        const partPath = getMultipartPath(uploadId, partNumber);
        await ensureDir(dirname(partPath));
        await writeFile(partPath, data);
        return partPath;
    },

    async assembleMultipartUpload(uploadId: string, parts: { partNumber: number; storagePath: string }[], bucket: string, key: string): Promise<{ size: number; storagePath: string }> {
        const finalPath = getObjectPath(bucket, key);
        await ensureDir(dirname(finalPath));

        const sortedParts = parts.sort((a, b) => a.partNumber - b.partNumber);
        const chunks: Buffer[] = [];
        let totalSize = 0;

        for (const part of sortedParts) {
            const data = await readFile(part.storagePath);
            chunks.push(data);
            totalSize += data.length;
        }

        await writeFile(finalPath, Buffer.concat(chunks));

        // Cleanup multipart temp files
        const multipartDir = join(basePath, '.multipart', uploadId);
        if (existsSync(multipartDir)) {
            await rm(multipartDir, { recursive: true, force: true });
        }

        return { size: totalSize, storagePath: finalPath };
    },

    async cleanupMultipart(uploadId: string): Promise<void> {
        const multipartDir = join(basePath, '.multipart', uploadId);
        if (existsSync(multipartDir)) {
            await rm(multipartDir, { recursive: true, force: true });
        }
    },

    /** Get total storage usage in bytes */
    async getTotalStorageUsed(): Promise<number> {
        if (!existsSync(basePath)) return 0;
        return getDirSize(basePath);
    },
};

async function getDirSize(dirPath: string): Promise<number> {
    let totalSize = 0;
    try {
        const entries = await readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === '.multipart') continue;
            const fullPath = join(dirPath, entry.name);
            if (entry.isDirectory()) {
                totalSize += await getDirSize(fullPath);
            } else {
                const s = await stat(fullPath);
                totalSize += s.size;
            }
        }
    } catch {
        // ignore errors
    }
    return totalSize;
}
