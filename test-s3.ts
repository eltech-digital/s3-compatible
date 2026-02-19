import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

const client = new S3Client({
    endpoint: 'http://localhost:3000',
    region: 'us-east-1',
    credentials: {
        accessKeyId: 'AK1842E865411256698A',
        secretAccessKey: 'tOKKSI3HOaf7txs1fn1Ak8pMUcJ3SyTcR9-SZgZm',
    },
    forcePathStyle: true,
});

async function test() {
    try {
        // Upload
        console.log('1. Uploading hello.txt...');
        const put = await client.send(new PutObjectCommand({
            Bucket: 'test-upload',
            Key: 'hello.txt',
            Body: 'Hello World!',
            ContentType: 'text/plain',
        }));
        console.log('   Result:', put.$metadata.httpStatusCode, 'ETag:', put.ETag);

        // List
        console.log('2. Listing objects...');
        const list = await client.send(new ListObjectsV2Command({ Bucket: 'test-upload' }));
        console.log('   Objects:', list.Contents?.map(c => `${c.Key} (${c.Size}b)`));

        // Get
        console.log('3. Getting hello.txt...');
        const get = await client.send(new GetObjectCommand({ Bucket: 'test-bucket', Key: 'hello.txt' }));
        const body = await get.Body?.transformToString();
        console.log('   Content:', body);
        console.log('\n✅ All tests passed!');
    } catch (e: any) {
        console.error('❌ Error:', e.message);
        console.error('   Code:', e.Code || e.name);
        if (e.$response) {
            console.error('   Status:', e.$metadata?.httpStatusCode);
        }
    }
}

test();
