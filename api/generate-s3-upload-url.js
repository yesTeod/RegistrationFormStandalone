import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { v4 as uuidv4 } from 'uuid';

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
const AWS_REGION = process.env.AWS_REGION;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

if (!S3_BUCKET_NAME || !AWS_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
  throw new Error("AWS S3 configuration is missing from environment variables. Required: S3_BUCKET_NAME, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY");
}

const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  try {
    const { fileType } = req.body; // e.g., 'video/mp4' or 'image/jpeg'
    
    if (!fileType) {
      return res.status(400).json({ success: false, error: "fileType is required" });
    }

    // Generate a unique file name to prevent overwrites, but keep original extension if possible
    const fileExtension = fileType.split('/')[1] || 'bin'; // Default to .bin if type is weird
    const uniqueFileName = `${uuidv4()}.${fileExtension}`;

    const params = {
      Bucket: S3_BUCKET_NAME,
      Key: uniqueFileName, // The name of the file in S3
      Conditions: [
        ["content-length-range", 0, 25 * 1024 * 1024], // Max 25MB file size (adjust as needed)
        {"Content-Type": fileType}
      ],
      Fields: {
        'Content-Type': fileType,
      },
      Expires: 600, // URL expires in 10 minutes (adjust as needed)
    };

    const { url, fields } = await createPresignedPost(s3Client, params);
    
    console.log(`Generated pre-signed POST URL for ${uniqueFileName} of type ${fileType}`);
    
    return res.status(200).json({ success: true, url, fields, key: uniqueFileName });

  } catch (error) {
    console.error("Error generating pre-signed S3 POST URL:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error", message: error.message });
  }
} 