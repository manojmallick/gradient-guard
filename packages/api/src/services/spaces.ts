import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../lib/env";

// DO Spaces is S3-compatible. Lazy-initialized so the service starts even
// when Spaces credentials are not yet configured.
let _s3: S3Client | null = null;

function getS3Client(): S3Client {
  if (_s3) return _s3;
  if (!env.DO_SPACES_ENDPOINT || !env.DO_SPACES_KEY || !env.DO_SPACES_SECRET) {
    throw new Error("DO Spaces credentials not configured");
  }
  _s3 = new S3Client({
    endpoint: env.DO_SPACES_ENDPOINT,
    region: "us-east-1", // SDK placeholder — DO Spaces ignores this
    credentials: {
      accessKeyId: env.DO_SPACES_KEY,
      secretAccessKey: env.DO_SPACES_SECRET,
    },
    forcePathStyle: false,
  });
  return _s3;
}

export async function getEvidencePresignedUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.DO_SPACES_BUCKET ?? "",
    Key: key,
  });
  return getSignedUrl(getS3Client(), command, { expiresIn: 86400 });
}
