import { CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { s3, bucket } from '../src/lib/server/storage/index.ts';
import { origin } from '../src/lib/server/config.ts';
try {
  await s3().send(new HeadBucketCommand({ Bucket: bucket() }));
} catch (error) {
  if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404)
    throw error;
  await s3().send(new CreateBucketCommand({ Bucket: bucket() }));
}
await s3().send(
  new PutBucketCorsCommand({
    Bucket: bucket(),
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: [origin()],
          AllowedMethods: ['PUT', 'GET', 'HEAD'],
          AllowedHeaders: ['content-type'],
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 300,
        },
      ],
    },
  }),
);
console.log('Приватный bucket и CORS настроены.');
