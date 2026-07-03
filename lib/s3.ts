import { S3Client, ListBucketsCommand, CreateBucketCommand, DeleteBucketCommand } from '@aws-sdk/client-s3'
import { config } from '@/lib/config'
import { isAuthError } from '@/lib/errors'
import type { Creds } from '@/lib/session-crypto'

export function makeS3Client(creds: Creds, endpoint: string): S3Client {
  return new S3Client({
    endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: creds.accessKey, secretAccessKey: creds.secretKey },
  })
}

export const internalClient = (creds: Creds) => makeS3Client(creds, config.internalEndpoint)
export const publicClient = (creds: Creds) => makeS3Client(creds, config.publicEndpoint)

/** True when MinIO accepts the credentials (authenticated), even if the user
 *  lacks permission to list buckets. Only bad key / bad signature is a failure. */
export async function validateCredentials(creds: Creds): Promise<boolean> {
  try {
    await internalClient(creds).send(new ListBucketsCommand({}))
    return true
  } catch (err) {
    if (isAuthError(err)) return false
    return true // AccessDenied etc. = valid creds, limited perms
  }
}

export async function listBuckets(creds: Creds) {
  const out = await internalClient(creds).send(new ListBucketsCommand({}))
  return (out.Buckets ?? []).map((b) => ({ name: b.Name!, creationDate: b.CreationDate }))
}

export async function createBucket(creds: Creds, name: string) {
  await internalClient(creds).send(new CreateBucketCommand({ Bucket: name }))
}

export async function deleteBucket(creds: Creds, name: string) {
  await internalClient(creds).send(new DeleteBucketCommand({ Bucket: name }))
}
