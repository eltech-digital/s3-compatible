# S3 Compatible Backend

S3-compatible object storage backend built with **Bun**, **Elysia.JS**, and **MySQL**.

## Quick Start

```bash
# Install dependencies
bun install

# Create database
mysql -u root -e "CREATE DATABASE IF NOT EXISTS s3"

# Run database migrations
bun run db:push

# Start server
bun run dev
```

## Configuration

Copy `.env.example` to `.env` and adjust values as needed.

## S3 SDK Usage

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const client = new S3Client({
  endpoint: 'http://localhost:3000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'YOUR_ACCESS_KEY',
    secretAccessKey: 'YOUR_SECRET_KEY',
  },
  forcePathStyle: true,
});
```
