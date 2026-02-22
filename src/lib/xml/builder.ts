import { XMLBuilder, XMLParser } from 'fast-xml-parser';

const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: true,
    suppressEmptyNode: true,
});

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
});

const S3_XMLNS = 'http://s3.amazonaws.com/doc/2006-03-01/';

interface BucketInfo {
    name: string;
    creationDate: Date;
}

interface ObjectInfo {
    key: string;
    lastModified: Date;
    etag: string;
    size: number;
    storageClass?: string;
}

interface PartInfo {
    partNumber: number;
    lastModified: Date;
    etag: string;
    size: number;
}

export const xml = {
    parse(xmlString: string): any {
        return parser.parse(xmlString);
    },

    xmlDeclaration(): string {
        return '<?xml version="1.0" encoding="UTF-8"?>';
    },

    listBucketsResponse(ownerId: string, displayName: string, buckets: BucketInfo[]): string {
        const obj = {
            ListAllMyBucketsResult: {
                '@_xmlns': S3_XMLNS,
                Owner: {
                    ID: ownerId,
                    DisplayName: displayName,
                },
                Buckets: {
                    Bucket: buckets.map((b) => ({
                        Name: b.name,
                        CreationDate: b.creationDate.toISOString(),
                    })),
                },
            },
        };
        return this.xmlDeclaration() + '\n' + builder.build(obj);
    },

    listObjectsV2Response(params: {
        name: string;
        prefix: string;
        delimiter?: string;
        maxKeys: number;
        isTruncated: boolean;
        contents: ObjectInfo[];
        commonPrefixes?: string[];
        continuationToken?: string;
        nextContinuationToken?: string;
        keyCount: number;
        encodingType?: string;
    }): string {
        const obj: any = {
            ListBucketResult: {
                '@_xmlns': S3_XMLNS,
                Name: params.name,
                Prefix: params.prefix || '',
                MaxKeys: params.maxKeys,
                IsTruncated: params.isTruncated,
                KeyCount: params.keyCount,
            },
        };

        if (params.delimiter) {
            obj.ListBucketResult.Delimiter = params.delimiter;
        }
        if (params.continuationToken) {
            obj.ListBucketResult.ContinuationToken = params.continuationToken;
        }
        if (params.nextContinuationToken) {
            obj.ListBucketResult.NextContinuationToken = params.nextContinuationToken;
        }
        if (params.encodingType) {
            obj.ListBucketResult.EncodingType = params.encodingType;
        }

        if (params.contents.length > 0) {
            obj.ListBucketResult.Contents = params.contents.map((o) => ({
                Key: o.key,
                LastModified: o.lastModified.toISOString(),
                ETag: `"${o.etag}"`,
                Size: o.size,
                StorageClass: o.storageClass || 'STANDARD',
            }));
        }

        if (params.commonPrefixes && params.commonPrefixes.length > 0) {
            obj.ListBucketResult.CommonPrefixes = params.commonPrefixes.map((p) => ({
                Prefix: p,
            }));
        }

        return this.xmlDeclaration() + '\n' + builder.build(obj);
    },

    listObjectsV1Response(params: {
        name: string;
        prefix: string;
        delimiter?: string;
        maxKeys: number;
        isTruncated: boolean;
        contents: ObjectInfo[];
        commonPrefixes?: string[];
        marker: string;
        nextMarker?: string;
    }): string {
        const obj: any = {
            ListBucketResult: {
                '@_xmlns': S3_XMLNS,
                Name: params.name,
                Prefix: params.prefix || '',
                Marker: params.marker || '',
                MaxKeys: params.maxKeys,
                IsTruncated: params.isTruncated,
            },
        };

        if (params.delimiter) {
            obj.ListBucketResult.Delimiter = params.delimiter;
        }
        if (params.nextMarker) {
            obj.ListBucketResult.NextMarker = params.nextMarker;
        }

        if (params.contents.length > 0) {
            obj.ListBucketResult.Contents = params.contents.map((o) => ({
                Key: o.key,
                LastModified: o.lastModified.toISOString(),
                ETag: `"${o.etag}"`,
                Size: o.size,
                StorageClass: o.storageClass || 'STANDARD',
            }));
        }

        if (params.commonPrefixes && params.commonPrefixes.length > 0) {
            obj.ListBucketResult.CommonPrefixes = params.commonPrefixes.map((p) => ({
                Prefix: p,
            }));
        }

        return this.xmlDeclaration() + '\n' + builder.build(obj);
    },

    initiateMultipartUploadResponse(bucket: string, key: string, uploadId: string): string {
        const obj = {
            InitiateMultipartUploadResult: {
                '@_xmlns': S3_XMLNS,
                Bucket: bucket,
                Key: key,
                UploadId: uploadId,
            },
        };
        return this.xmlDeclaration() + '\n' + builder.build(obj);
    },

    completeMultipartUploadResponse(location: string, bucket: string, key: string, etag: string): string {
        const obj = {
            CompleteMultipartUploadResult: {
                '@_xmlns': S3_XMLNS,
                Location: location,
                Bucket: bucket,
                Key: key,
                ETag: `"${etag}"`,
            },
        };
        return this.xmlDeclaration() + '\n' + builder.build(obj);
    },

    listPartsResponse(params: {
        bucket: string;
        key: string;
        uploadId: string;
        parts: PartInfo[];
        isTruncated: boolean;
        maxParts: number;
    }): string {
        const obj: any = {
            ListPartsResult: {
                '@_xmlns': S3_XMLNS,
                Bucket: params.bucket,
                Key: params.key,
                UploadId: params.uploadId,
                MaxParts: params.maxParts,
                IsTruncated: params.isTruncated,
            },
        };

        if (params.parts.length > 0) {
            obj.ListPartsResult.Part = params.parts.map((p) => ({
                PartNumber: p.partNumber,
                LastModified: p.lastModified.toISOString(),
                ETag: `"${p.etag}"`,
                Size: p.size,
            }));
        }

        return this.xmlDeclaration() + '\n' + builder.build(obj);
    },

    copyObjectResponse(etag: string, lastModified: Date): string {
        const obj = {
            CopyObjectResult: {
                '@_xmlns': S3_XMLNS,
                ETag: `"${etag}"`,
                LastModified: lastModified.toISOString(),
            },
        };
        return this.xmlDeclaration() + '\n' + builder.build(obj);
    },

    deleteObjectsResponse(deleted: { key: string }[], errors: { key: string; code: string; message: string }[]): string {
        const obj: any = {
            DeleteResult: {
                '@_xmlns': S3_XMLNS,
            },
        };

        if (deleted.length > 0) {
            obj.DeleteResult.Deleted = deleted.map((d) => ({ Key: d.key }));
        }
        if (errors.length > 0) {
            obj.DeleteResult.Error = errors.map((e) => ({
                Key: e.key,
                Code: e.code,
                Message: e.message,
            }));
        }

        return this.xmlDeclaration() + '\n' + builder.build(obj);
    },

    errorResponse(code: string, message: string, resource?: string, requestId?: string): string {
        const obj: any = {
            Error: {
                Code: code,
                Message: message,
            },
        };
        if (resource) obj.Error.Resource = resource;
        if (requestId) obj.Error.RequestId = requestId;
        return this.xmlDeclaration() + '\n' + builder.build(obj);
    },

    locationConstraintResponse(region: string): string {
        const obj = {
            CreateBucketConfiguration: {
                '@_xmlns': S3_XMLNS,
                LocationConstraint: region,
            },
        };
        return this.xmlDeclaration() + '\n' + builder.build(obj);
    },
};
