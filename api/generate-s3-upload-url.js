import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { v4 as uuidv4 } from 'uuid';
import { MongoClient } from "mongodb";

// S3 Config
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
const AWS_REGION = process.env.AWS_REGION;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

// MongoDB Config
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME;

if (!S3_BUCKET_NAME || !AWS_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
  throw new Error("AWS S3 configuration is missing. Required: S3_BUCKET_NAME, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY");
}
if (!MONGODB_URI || !MONGODB_DB_NAME) {
  throw new Error("MongoDB configuration is missing. Required: MONGODB_URI, MONGODB_DB_NAME");
}

const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

// Initialize MongoDB client (reuse connection)
const mongoClient = new MongoClient(MONGODB_URI);
let dbConnectionPromise = null;

async function getDb() {
  if (!dbConnectionPromise) {
    dbConnectionPromise = mongoClient.connect().then(connectedClient => {
      console.log("[DB Connection for S3 URL Gen] Successfully connected to MongoDB.");
      connectedClient.on('close', () => {
        console.log("[DB Connection for S3 URL Gen] MongoDB connection closed.");
        dbConnectionPromise = null; 
      });
      return connectedClient.db(MONGODB_DB_NAME);
    }).catch(err => {
      console.error("[DB Connection for S3 URL Gen] Failed to connect to MongoDB:", err);
      dbConnectionPromise = null; 
      throw err; 
    });
  }
  return dbConnectionPromise;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  try {
    const { fileType, email, idSide } = req.body; 
    
    if (!fileType || !email || !idSide) {
      return res.status(400).json({ success: false, error: "fileType, email, and idSide are required" });
    }
    if (idSide !== 'front' && idSide !== 'back' && idSide !== 'selfie') {
      return res.status(400).json({ success: false, error: "idSide must be 'front' or 'back' or 'selfie'" });
    }

    const fileExtension = fileType.split('/')[1] || 'bin'; 
    const uniqueFileName = `${uuidv4()}.${fileExtension}`; // This is the S3 object key

    try {
      const db = await getDb();
      const collection = db.collection("user_verifications");
      
      const updateQuery = { $set: { updatedAt: new Date() } };
      if (idSide === 'front') {
        updateQuery.$set.frontIdVideoS3Key = uniqueFileName;
      } else if ( idSide === 'back') {
        updateQuery.$set.backIdVideoS3Key = uniqueFileName;
      } else if ( idSide === 'selfie') {
        updateQuery.$set.selfieVideoS3Key = uniqueFileName;
      }

      const result = await collection.updateOne(
        { email: email.toLowerCase() },
        { 
          ...updateQuery,
          $setOnInsert: {
            email: email.toLowerCase(),
            createdAt: new Date()            
          }
        },
        { upsert: true }
      );
      console.log(`[S3 URL Gen API] MongoDB updated for email ${email}, side ${idSide}. Result: ${JSON.stringify(result)}`);

    } catch (dbError) {
      console.error(`[S3 URL Gen API] MongoDB error for email ${email}, side ${idSide}:`, dbError);
      // TBD if this should be a fatal error for the pre-signed URL generation.
      // return res.status(500).json({ success: false, error: "Database operation failed during S3 key registration", message: dbError.message });
    }

    // Generate Pre-signed POST URL for S3
    const s3Params = {
      Bucket: S3_BUCKET_NAME,
      Key: uniqueFileName, 
      Conditions: [
        ["content-length-range", 0, 25 * 1024 * 1024], 
        {"Content-Type": fileType}
      ],
      Fields: {
        'Content-Type': fileType,
      },
      Expires: 600, 
    };

    const { url, fields } = await createPresignedPost(s3Client, s3Params);
    
    console.log(`[S3 URL Gen API] Generated pre-signed POST URL for ${uniqueFileName} (email ${email}, side ${idSide})`);
    
    return res.status(200).json({ success: true, url, fields, key: uniqueFileName });

  } catch (error) {
    console.error("[S3 URL Gen API] Error processing request:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error", message: error.message });
  }
} 


