import { MongoClient } from "mongodb";
import bcrypt from 'bcrypt';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;
const client = new MongoClient(uri);
const saltRounds = 10; // Cost factor for hashing

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    console.log("Connecting to MongoDB for save-registration...");
    await client.connect();
    
    // Use environment variable for database name
    const db = client.db(dbName);
    const collection = db.collection("user_verifications");

    // Get email, password, and ID details. S3 video keys are no longer sent here.
    const { email, password, idDetails, ipAddress } = req.body; 

    if (!email || !password) {
      console.error("Email or password missing in request body for save-registration");
      return res.status(400).json({ success: false, error: "Email and password are required" });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Prepare data for update or insertion
    const updateData = {
      $set: {
        passwordHash: hashedPassword,
        status: 'details_submitted', // Or 'pending_final_verification', etc.
        updatedAt: new Date(),
      },
      $setOnInsert: {
        email: email.toLowerCase(), // Ensure email is stored consistently
        createdAt: new Date(),
        ipAddress: ipAddress // Store IP address on insert
        // S3 keys (frontIdVideoS3Key, backIdVideoS3Key) are now solely handled by /api/save-video-keys
        // frontIdVideoS3Key: null, // Removed
        // backIdVideoS3Key: null   // Removed
      }
    };

    // Add IP address to $set if it exists, to update it if user re-registers or logs in
    if (ipAddress) {
      updateData.$set.ipAddress = ipAddress;
    }

    // Add ID details if provided
    if (idDetails) {
      updateData.$set.idDetails = idDetails; // Save the raw idDetails object from extraction
      
      // For top-level convenience fields, use the new structure
      if (idDetails.fullName && idDetails.fullName !== "Not found") {
        updateData.$set.name = idDetails.fullName; // Store fullName under a general 'name' field
      }
      // fatherName is part of idDetails object, not usually a top-level convenience field unless specifically needed

      if (idDetails.dateOfBirth && idDetails.dateOfBirth !== "Not found") {
        updateData.$set.dateOfBirth = idDetails.dateOfBirth;
      }
      // Add personalNumber if available
      if (idDetails.personalNumber && idDetails.personalNumber !== "Not found") {
        updateData.$set.personalNumber = idDetails.personalNumber;
      }
      // Remove address as it's no longer provided by extract-id.js
      // if (idDetails.address && idDetails.address !== "Not found") {
      //   updateData.$set.address = idDetails.address;
      // }
      // Add any other important ID details from idDetails to $set if needed
    }

    // Perform an upsert operation: update if exists, insert if not
    // The email in $setOnInsert ensures it's set if a new document is created.
    // If updating, the email in the filter matches the existing document.
    const result = await collection.updateOne(
      { email: email.toLowerCase() }, // Match email case-insensitively
      updateData,
      { upsert: true }
    );

    console.log("User data (details and password) upserted successfully for email:", email, "Result:", result);
    
    if (result.acknowledged) {
        res.status(200).json({ 
            success: true, 
            email: email, 
            operation: result.upsertedId ? 'inserted' : (result.matchedCount > 0 && result.modifiedCount > 0 ? 'updated' : 'no_change')
        });
    } else {
        console.error("Save registration MongoDB operation was not acknowledged.", result);
        throw new Error("MongoDB operation failed: Not acknowledged during save registration.");
    }

  } catch (err) {
    console.error("Error saving registration:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}
