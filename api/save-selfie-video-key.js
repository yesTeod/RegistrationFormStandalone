import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;

if (!uri) {
  console.error("MONGODB_URI environment variable is not set for save-selfie-video-key.");
}
if (!dbName) {
  console.error("MONGODB_DB_NAME environment variable is not set for save-selfie-video-key.");
}

const client = new MongoClient(uri);
let dbConnectionPromise = null;

async function getDb() {
  if (!dbConnectionPromise) {
    dbConnectionPromise = client.connect().then(connectedClient => {
      console.log("[DB Connection - Selfie Key] Successfully connected to MongoDB.");
      connectedClient.on('close', () => {
        console.log("[DB Connection - Selfie Key] MongoDB connection closed.");
        dbConnectionPromise = null;
      });
      return connectedClient.db(dbName);
    }).catch(err => {
      console.error("[DB Connection - Selfie Key] Failed to connect to MongoDB:", err);
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

  console.log("[API /api/save-selfie-video-key] Received request. Body:", JSON.stringify(req.body));

  if (!uri || !dbName) {
    console.error("[API /api/save-selfie-video-key] Server configuration error: Database URI or Name not set.");
    return res.status(500).json({ success: false, error: "Server configuration error: Database URI or Name not set." });
  }

  try {
    const db = await getDb();
    const collection = db.collection("user_verifications");

    const { selfieS3Key, email } = req.body;

    if (!email) {
      console.error("[API /api/save-selfie-video-key] Email is required in request body.");
      return res.status(400).json({ success: false, error: "Email is required to save selfie video key." });
    }
    
    // selfieS3Key can be null if the video processing failed or was skipped, but we still might want to record that attempt.
    // So, we proceed even if selfieS3Key is null or undefined.

    console.log("[API /api/save-selfie-video-key] Received data for DB save/update:", { selfieS3Key, email });

    const updateData = {
      $set: {
        updatedAt: new Date(),
        // We only set status if we want to specifically track this stage. 
        // Otherwise, allow other processes to set the main status.
        // status: "selfie_key_processed" 
      },
      $setOnInsert: {
        email: email.toLowerCase(), // Ensure email is stored consistently
        createdAt: new Date()
      }
    };

    if (selfieS3Key !== undefined) { 
      updateData.$set.selfieVideoS3Key = selfieS3Key;
    } else {
      // If selfieS3Key is undefined, explicitly set it to null to indicate an attempt was made but no key provided
      updateData.$set.selfieVideoS3Key = null; 
    }

    console.log("[API /api/save-selfie-video-key] Attempting MongoDB update for email:", email, "With data:", JSON.stringify(updateData));

    const result = await collection.updateOne(
      { email: email.toLowerCase() },
      updateData,
      { upsert: true } 
    );

    console.log("[API /api/save-selfie-video-key] MongoDB updateOne result for email:", email, "Result:", JSON.stringify(result));

    if (result.acknowledged) {
      let message = "Selfie video S3 key processed.";
      if (result.upsertedCount > 0) {
        message = "New record created with selfie video S3 key information.";
      } else if (result.matchedCount > 0 && result.modifiedCount > 0) {
        message = "Existing record updated with selfie video S3 key information.";
      } else if (result.matchedCount > 0 && result.modifiedCount === 0) {
        message = "Existing record found, but no changes made to selfie video S3 key (it might be the same or was already null)."
      }

      res.status(200).json({ 
        success: true, 
        message: message,
        details: {
            upsertedId: result.upsertedId ? result.upsertedId.toString() : null,
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount
        }
      });
    } else {
      console.error("[API /api/save-selfie-video-key] MongoDB operation was not acknowledged.", result);
      throw new Error("MongoDB operation failed: Not acknowledged during selfie key save.");
    }

  } catch (error) {
    console.error("[API /api/save-selfie-video-key] Error processing request:", error.message, error.stack);
    res.status(500).json({ success: false, error: "Internal Server Error", message: error.message });
  }
} 