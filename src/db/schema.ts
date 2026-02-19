import {
    mysqlTable,
    varchar,
    int,
    bigint,
    text,
    boolean,
    timestamp,
    index,
    uniqueIndex,
} from 'drizzle-orm/mysql-core';

export const accessKeys = mysqlTable('access_keys', {
    id: int('id').primaryKey().autoincrement(),
    accessKeyId: varchar('access_key_id', { length: 64 }).notNull().unique(),
    secretAccessKey: varchar('secret_access_key', { length: 128 }).notNull(),
    displayName: varchar('display_name', { length: 255 }).notNull().default('default'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, (table) => [
    uniqueIndex('idx_access_key_id').on(table.accessKeyId),
]);

export const buckets = mysqlTable('buckets', {
    id: int('id').primaryKey().autoincrement(),
    name: varchar('name', { length: 63 }).notNull().unique(),
    ownerId: int('owner_id').notNull().references(() => accessKeys.id),
    region: varchar('region', { length: 32 }).notNull().default('us-east-1'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
    uniqueIndex('idx_bucket_name').on(table.name),
]);

export const objects = mysqlTable('objects', {
    id: int('id').primaryKey().autoincrement(),
    bucketId: int('bucket_id').notNull().references(() => buckets.id, { onDelete: 'cascade' }),
    key: varchar('object_key', { length: 512 }).notNull(),
    size: bigint('size', { mode: 'number' }).notNull().default(0),
    etag: varchar('etag', { length: 128 }).notNull(),
    contentType: varchar('content_type', { length: 255 }).notNull().default('application/octet-stream'),
    storagePath: varchar('storage_path', { length: 1024 }).notNull(),
    metadata: text('metadata'),
    isDeleteMarker: boolean('is_delete_marker').notNull().default(false),
    lastModified: timestamp('last_modified').notNull().defaultNow().onUpdateNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
    index('idx_bucket_id').on(table.bucketId),
]);

export const multipartUploads = mysqlTable('multipart_uploads', {
    id: int('id').primaryKey().autoincrement(),
    uploadId: varchar('upload_id', { length: 128 }).notNull().unique(),
    bucketId: int('bucket_id').notNull().references(() => buckets.id, { onDelete: 'cascade' }),
    key: varchar('object_key', { length: 512 }).notNull(),
    contentType: varchar('content_type', { length: 255 }).notNull().default('application/octet-stream'),
    metadata: text('metadata'),
    initiatedAt: timestamp('initiated_at').notNull().defaultNow(),
}, (table) => [
    uniqueIndex('idx_upload_id').on(table.uploadId),
]);

export const multipartParts = mysqlTable('multipart_parts', {
    id: int('id').primaryKey().autoincrement(),
    uploadId: varchar('upload_id', { length: 128 }).notNull().references(() => multipartUploads.uploadId, { onDelete: 'cascade' }),
    partNumber: int('part_number').notNull(),
    size: bigint('size', { mode: 'number' }).notNull().default(0),
    etag: varchar('etag', { length: 128 }).notNull(),
    storagePath: varchar('storage_path', { length: 1024 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
    index('idx_upload_part').on(table.uploadId, table.partNumber),
]);

export const adminSessions = mysqlTable('admin_sessions', {
    id: int('id').primaryKey().autoincrement(),
    token: varchar('token', { length: 512 }).notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
});
