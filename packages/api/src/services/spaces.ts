import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../lib/env";

// DO Spaces is S3-compatible. The AWS SDK requires a `region` value but
// DigitalOcean ignores it — the actual region (ams3) is determined solely
// by the endpoint URL: https://ams3.digitaloceanspaces.com
export const s3 = new S3Client({
  endpoint: env.DO_SPACES_ENDPOINT, // https://ams3.digitaloceanspaces.com
  region: "us-east-1",              // SDK placeholder — DO Spaces ignores this
  credentials: {
    accessKeyId: env.DO_SPACES_KEY,
    secretAccessKey: env.DO_SPACES_SECRET,
  },
  forcePathStyle: false,
});

export async function getEvidencePresignedUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.DO_SPACES_BUCKET,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn: 86400 });
}
