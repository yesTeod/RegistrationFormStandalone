import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME;

if (!MONGODB_URI || !MONGODB_DB_NAME) {
  console.error("MongoDB configuration is missing for approve-user API.");
  // Consider implications if these are not set during runtime for this specific API
}

// Initialize MongoDB client (reuse connection)
const mongoClient = new MongoClient(MONGODB_URI);
let dbConnectionPromise = null;

async function getDb() {
  if (!dbConnectionPromise) {
    dbConnectionPromise = mongoClient.connect().then(connectedClient => {
      console.log("[DB Connection for Approve User] Successfully connected to MongoDB.");
      connectedClient.on('close', () => {
        console.log("[DB Connection for Approve User] MongoDB connection closed.");
        dbConnectionPromise = null;
      });
      return connectedClient.db(MONGODB_DB_NAME);
    }).catch(err => {
      console.error("[DB Connection for Approve User] Failed to connect to MongoDB:", err);
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

  if (!MONGODB_URI || !MONGODB_DB_NAME) {
    return res.status(500).json({ success: false, error: "Server configuration error for database." });
  }

  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: "Email is required to approve user." });
    }

    const db = await getDb();
    const collection = db.collection("user_verifications");

    const result = await collection.updateOne(
      { email: email.toLowerCase() }, // Match email case-insensitively
      {
        $set: {
          status: "approved",
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      console.log(`[API /admin/approve-user] User not found for approval: ${email}`);
      return res.status(404).json({ success: false, error: "User not found." });
    }
    
    if (result.modifiedCount === 0 && result.matchedCount === 1) {
        console.log(`[API /admin/approve-user] User ${email} was already approved or no change needed.`);
        // Still return success as the state is effectively what was requested
        return res.status(200).json({ success: true, message: "User status is already approved or no change needed.", email: email });
    }

    console.log(`[API /admin/approve-user] User status updated to 'approved' for: ${email}`);
    return res.status(200).json({ success: true, message: "User approved successfully.", email: email });

  } catch (error) {
    console.error("[API /admin/approve-user] Error approving user:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error", message: error.message });
  }
} 