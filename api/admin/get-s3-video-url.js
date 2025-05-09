import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
const AWS_REGION = process.env.AWS_REGION;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

if (!S3_BUCKET_NAME || !AWS_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
  console.error("Critical AWS S3 configuration is missing for get-s3-video-url.");
  // Depending on your error handling strategy, you might throw an error here
  // or ensure the handler returns a proper error response if these are not set.
}

const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  if (!S3_BUCKET_NAME) { // Check again in handler in case of module load issues
    return res.status(500).json({ success: false, error: "S3 bucket name not configured on server." });
  }

  try {
    const { s3Key } = req.query; // Expecting ?s3Key=your-object-key.webm

    if (!s3Key) {
      return res.status(400).json({ success: false, error: "s3Key query parameter is required" });
    }

    const command = new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: s3Key,
    });

    // Generate a pre-signed URL, valid for a limited time (e.g., 1 hour)
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    console.log(`[API /admin/get-s3-video-url] Generated pre-signed GET URL for key: ${s3Key}`);
    return res.status(200).json({ success: true, url: signedUrl });

  } catch (error) {
    console.error("[API /admin/get-s3-video-url] Error generating pre-signed S3 GET URL:", error);
    // Provide a more specific error message if possible
    if (error.name === 'NoSuchKey') {
        return res.status(404).json({ success: false, error: "Video file not found in S3 bucket.", message: error.message });
    }
    return res.status(500).json({ success: false, error: "Internal Server Error", message: error.message });
  }
} 