export const env = {
    port: parseInt(process.env.PORT || '3000'),
    host: process.env.HOST || '0.0.0.0',

    db: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 's3',
    },

    storagePath: process.env.STORAGE_PATH || './storage',

    admin: {
        username: process.env.ADMIN_USERNAME || 'admin',
        password: process.env.ADMIN_PASSWORD || 'admin123',
    },

    jwtSecret: process.env.JWT_SECRET || 'change-this-to-a-random-secret',
    s3Region: process.env.S3_REGION || 'us-east-1',
};
