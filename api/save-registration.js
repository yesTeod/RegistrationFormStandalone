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

    console.log("Saving user data (with S3 keys):", JSON.stringify(req.body));
    // Get email, password, ID details, and now S3 video keys
    const { email, password, idDetails, frontIdVideoS3Key, backIdVideoS3Key } = req.body; 

    if (!email || !password) {
      console.error("Email or password missing in request body");
      return res.status(400).json({ success: false, error: "Email and password are required" });
    }

    // Check if user already exists
    const existingUser = await collection.findOne({ email: email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        error: "User already exists", 
        code: "USER_EXISTS" 
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Prepare data for insertion (store only hashed password)
    const userData = {
      email: email,
      passwordHash: hashedPassword, // Store hash, not plain password
      status: 'pending', // Initial status before verification
      createdAt: new Date(),
      frontIdVideoS3Key: frontIdVideoS3Key || null, // Store S3 key for front ID video
      backIdVideoS3Key: backIdVideoS3Key || null    // Store S3 key for back ID video
    };

    // Add ID details if provided
    if (idDetails) {
      userData.idDetails = idDetails;
      
      // Explicitly add address as a top-level field for easier access
      if (idDetails.address && idDetails.address !== "Not found") {
        userData.address = idDetails.address;
      }
      
      // Add any other important ID details as top-level fields if needed
      if (idDetails.name && idDetails.name !== "Not found") {
        userData.name = idDetails.name;
      }
      
      if (idDetails.dateOfBirth && idDetails.dateOfBirth !== "Not found") {
        userData.dateOfBirth = idDetails.dateOfBirth;
      }
    }

    await collection.insertOne(userData);

    console.log("User data saved successfully for email:", email);
    res.status(200).json({ success: true, email: email }); // Return email for potential use
  } catch (err) {
    console.error("Error saving registration:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}
