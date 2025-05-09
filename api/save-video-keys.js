import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;

if (!uri) {
  console.error("MONGODB_URI environment variable is not set.");
  // Optional: throw new Error to prevent startup if critical, or handle gracefully
}
if (!dbName) {
  console.error("MONGODB_DB_NAME environment variable is not set.");
  // Optional: throw new Error or handle gracefully
}

// Initialize client outside of handler to reuse connection
const client = new MongoClient(uri);
let dbConnectionPromise = null; // To cache the connection promise

async function getDb() {
  if (!dbConnectionPromise) {
    dbConnectionPromise = client.connect().then(connectedClient => {
      console.log("[DB Connection] Successfully connected to MongoDB.");
      connectedClient.on('close', () => {
        console.log("[DB Connection] MongoDB connection closed.");
        dbConnectionPromise = null; // Reset promise on close
      });
      return connectedClient.db(dbName);
    }).catch(err => {
      console.error("[DB Connection] Failed to connect to MongoDB:", err);
      dbConnectionPromise = null; // Reset promise on error
      throw err; // Re-throw to be caught by handler
    });
  }
  return dbConnectionPromise;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  console.log("[API /api/save-video-keys] Received request. Body:", JSON.stringify(req.body));

  if (!uri || !dbName) {
    console.error("[API /api/save-video-keys] Server configuration error: Database URI or Name not set.");
    return res.status(500).json({ success: false, error: "Server configuration error: Database URI or Name not set." });
  }

  try {
    const db = await getDb(); // Get or establish database connection
    const collection = db.collection("user_verifications");

    const { frontS3Key, backS3Key, email } = req.body;

    if (!email) {
      console.error("[API /api/save-video-keys] Email is required in request body.");
      return res.status(400).json({ success: false, error: "Email is required to save/update video keys." });
    }

    console.log("[API /api/save-video-keys] Received data for DB save/update:", { frontS3Key, backS3Key, email });

    const updateData = {
      $set: {
        email: email, // Ensure email is set, especially on upsert
        updatedAt: new Date(),
        status: "keys_added_via_test_flow" // Status indicating how these keys were added/updated
      },
      $setOnInsert: { // Fields to set only if a new document is created (upserted)
        createdAt: new Date()
      }
    };

    if (frontS3Key !== undefined) { // Allow explicitly setting to null if needed, otherwise only update if provided
      updateData.$set.frontIdVideoS3Key = frontS3Key;
    }
    if (backS3Key !== undefined) {
      updateData.$set.backIdVideoS3Key = backS3Key;
    }

    console.log("[API /api/save-video-keys] Attempting MongoDB update for email:", email, "With data:", JSON.stringify(updateData));

    const result = await collection.updateOne(
      { email: email.toLowerCase() }, // Match email case-insensitively for robustness
      updateData,
      { upsert: true } 
    );

    console.log("[API /api/save-video-keys] MongoDB updateOne result for email:", email, "Result:", JSON.stringify(result));

    if (result.acknowledged) {
      let message = "Video S3 keys processed.";
      if (result.upsertedCount > 0) {
        message = "New record created with video S3 keys.";
      } else if (result.matchedCount > 0 && result.modifiedCount > 0) {
        message = "Existing record updated with video S3 keys.";
      } else if (result.matchedCount > 0 && result.modifiedCount === 0) {
        message = "Existing record found, but no changes made to video S3 keys (they might be the same)."
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
      console.error("[API /api/save-video-keys] MongoDB operation was not acknowledged.", result);
      throw new Error("MongoDB operation failed: Not acknowledged.");
    }

  } catch (error) {
    console.error("[API /api/save-video-keys] Error processing request:", error.message, error.stack);
    res.status(500).json({ success: false, error: "Internal Server Error", message: error.message });
  }
  // Note: client.close() is not called here because we are reusing the connection
  // It will be closed if the server process ends or on an explicit close event from the driver.
} 
