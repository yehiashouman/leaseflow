import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  GetBucketPolicyCommand,
  GetBucketAclCommand,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { fileConfig } from './file-policy.js';

export interface PrivateStorage {
  verify(): Promise<void>;
  put(key: string, bytes: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
}
const client = new S3Client({
  endpoint: fileConfig.S3_ENDPOINT,
  region: fileConfig.S3_REGION,
  forcePathStyle: fileConfig.S3_FORCE_PATH_STYLE === 'true',
  credentials:
    fileConfig.S3_ACCESS_KEY && fileConfig.S3_SECRET_KEY
      ? { accessKeyId: fileConfig.S3_ACCESS_KEY, secretAccessKey: fileConfig.S3_SECRET_KEY }
      : undefined,
  requestHandler: { requestTimeout: 15000, connectionTimeout: 3000 },
  maxAttempts: 2,
});
export const privateStorage: PrivateStorage = {
  async verify() {
    const Bucket = fileConfig.S3_BUCKET;
    try {
      await client.send(new HeadBucketCommand({ Bucket }));
    } catch (cause) {
      if ((cause as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404)
        throw cause;
      await client.send(
        new CreateBucketCommand({
          Bucket,
          ...(fileConfig.S3_REGION !== 'us-east-1'
            ? {
                CreateBucketConfiguration: {
                  LocationConstraint: fileConfig.S3_REGION as 'eu-west-1',
                },
              }
            : {}),
        }),
      );
    }
    // A dedicated bucket with no resource policy or public ACL is required.
    try {
      const policy = await client.send(new GetBucketPolicyCommand({ Bucket }));
      if (policy.Policy)
        throw new Error('Storage bucket policies require explicit deployment review');
    } catch (cause) {
      if ((cause as { name: string }).name !== 'NoSuchBucketPolicy') throw cause;
    }
    // MinIO exposes a dummy ACL response; its bucket policy controls anonymous access.
    if (fileConfig.S3_PROVIDER === 'minio') return;
    const acl = await client.send(new GetBucketAclCommand({ Bucket }));
    if (
      !acl.Owner?.ID ||
      !acl.Grants?.length ||
      acl.Grants.some(
        (grant) =>
          grant.Grantee?.Type !== 'CanonicalUser' ||
          grant.Grantee.ID !== acl.Owner?.ID ||
          grant.Permission !== 'FULL_CONTROL',
      )
    )
      throw new Error('Private bucket ACL is required');
  },
  async put(key, bytes, mimeType) {
    await client.send(
      new PutObjectCommand({
        Bucket: fileConfig.S3_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: mimeType,
        IfNoneMatch: '*',
        CacheControl: 'no-store',
      }),
    );
  },
  async get(key) {
    const row = await client.send(new GetObjectCommand({ Bucket: fileConfig.S3_BUCKET, Key: key }));
    if (!row.Body || (row.ContentLength ?? Infinity) > fileConfig.FILE_MAX_BYTES * 3)
      throw new Error('Stored object exceeds file limit');
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of row.Body as AsyncIterable<Uint8Array>) {
      size += chunk.byteLength;
      if (size > fileConfig.FILE_MAX_BYTES * 3) throw new Error('Stored object exceeds file limit');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  },
};
