import { S3Client, ListBucketsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

// Using the SECOND key (id=3) to access bucket owned by key id=1
const client = new S3Client({
    endpoint: 'http://localhost:3000',
    region: 'us-east-1',
    credentials: {
        accessKeyId: 'AK98F89BAA9C1AF24DD8',
        secretAccessKey: '', // Need to get actual secret
    },
    forcePathStyle: true,
});

async function test() {
    try {
        console.log('1. Listing all buckets with KEY #2...');
        const buckets = await client.send(new ListBucketsCommand({}));
        console.log('   Buckets:', buckets.Buckets?.map(b => b.Name));

        console.log('2. Listing objects in test-upload (owned by KEY #1) with KEY #2...');
        const list = await client.send(new ListObjectsV2Command({ Bucket: 'test-upload' }));
        console.log('   Objects:', list.Contents?.map(c => `${c.Key} (${c.Size}b)`));

        console.log('\n✅ Cross-key access works!');
    } catch (e: any) {
        console.error('❌ Error:', e.message, e.Code || e.name);
    }
}

test();
