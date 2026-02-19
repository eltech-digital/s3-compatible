import { xml } from './xml/builder';

export interface S3Error {
    statusCode: number;
    code: string;
    message: string;
}

export const S3Errors = {
    NoSuchBucket: (bucket: string): S3Error => ({
        statusCode: 404,
        code: 'NoSuchBucket',
        message: `The specified bucket does not exist: ${bucket}`,
    }),

    NoSuchKey: (key: string): S3Error => ({
        statusCode: 404,
        code: 'NoSuchKey',
        message: `The specified key does not exist: ${key}`,
    }),

    BucketAlreadyExists: (bucket: string): S3Error => ({
        statusCode: 409,
        code: 'BucketAlreadyExists',
        message: `The requested bucket name is not available: ${bucket}`,
    }),

    BucketNotEmpty: (bucket: string): S3Error => ({
        statusCode: 409,
        code: 'BucketNotEmpty',
        message: `The bucket you tried to delete is not empty: ${bucket}`,
    }),

    InvalidBucketName: (bucket: string): S3Error => ({
        statusCode: 400,
        code: 'InvalidBucketName',
        message: `The specified bucket is not valid: ${bucket}`,
    }),

    NoSuchUpload: (uploadId: string): S3Error => ({
        statusCode: 404,
        code: 'NoSuchUpload',
        message: `The specified upload does not exist: ${uploadId}`,
    }),

    InvalidPartOrder: (): S3Error => ({
        statusCode: 400,
        code: 'InvalidPartOrder',
        message: 'The list of parts was not in ascending order.',
    }),

    AccessDenied: (): S3Error => ({
        statusCode: 403,
        code: 'AccessDenied',
        message: 'Access Denied',
    }),

    SignatureDoesNotMatch: (): S3Error => ({
        statusCode: 403,
        code: 'SignatureDoesNotMatch',
        message: 'The request signature we calculated does not match the signature you provided.',
    }),

    MissingSecurityHeader: (): S3Error => ({
        statusCode: 400,
        code: 'MissingSecurityHeader',
        message: 'Your request was missing a required header.',
    }),

    InvalidArgument: (msg: string): S3Error => ({
        statusCode: 400,
        code: 'InvalidArgument',
        message: msg,
    }),

    InternalError: (msg?: string): S3Error => ({
        statusCode: 500,
        code: 'InternalError',
        message: msg || 'We encountered an internal error. Please try again.',
    }),

    InvalidRange: (): S3Error => ({
        statusCode: 416,
        code: 'InvalidRange',
        message: 'The requested range is not satisfiable.',
    }),

    EntityTooLarge: (): S3Error => ({
        statusCode: 400,
        code: 'EntityTooLarge',
        message: 'Your proposed upload exceeds the maximum allowed object size.',
    }),

    MethodNotAllowed: (method: string): S3Error => ({
        statusCode: 405,
        code: 'MethodNotAllowed',
        message: `The specified method is not allowed against this resource: ${method}`,
    }),
} as const;

export function s3ErrorResponse(error: S3Error, resource?: string): Response {
    const body = xml.errorResponse(error.code, error.message, resource);
    return new Response(body, {
        status: error.statusCode,
        headers: { 'Content-Type': 'application/xml' },
    });
}
