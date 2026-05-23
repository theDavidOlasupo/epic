import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (_client) return _client;

  const endpoint = process.env['R2_ENDPOINT'];
  const accessKeyId = process.env['R2_ACCESS_KEY_ID'];
  const secretAccessKey = process.env['R2_SECRET_ACCESS_KEY'];

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 credentials not configured (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)');
  }

  _client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  return _client;
}

const BUCKET = () => process.env['R2_BUCKET_NAME'] ?? 'alpaca';
const PUBLIC_URL = () => process.env['R2_PUBLIC_URL'] ?? '';

/**
 * Generate a pre-signed PUT URL for uploading a file to R2.
 * Expires in 15 minutes.
 */
export async function getUploadUrl(key: string, contentType: string): Promise<string> {
  const client = getClient();
  const command = new PutObjectCommand({
    Bucket: BUCKET(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(client, command, { expiresIn: 900 });
}

/**
 * Get the public read URL for a stored object key.
 */
export function getPublicUrl(key: string): string {
  const base = PUBLIC_URL();
  if (!base) return key; // fallback: return key as-is
  return `${base}/${key}`;
}
