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

    logToScreen("Saving user data (server-side):" + JSON.stringify(req.body)); // Added for Vercel logs
    // Get email, password, ID details, and front video data
    const { email, password, idDetails, frontIdVideo } = req.body; 

    if (!email || !password) {
      logToScreen("Email or password missing in request body (server-side)", "error"); // Added for Vercel logs
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
      frontIdVideo: frontIdVideo || null // Store front ID video, defaulting to null
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

    logToScreen("User data saved successfully for email (server-side): " + email); // Added for Vercel logs
    res.status(200).json({ success: true, email: email }); // Return email for potential use
  } catch (err) {
    logToScreen("Error saving registration (server-side): " + err.message, "error"); // Added for Vercel logs
    res.status(500).json({ success: false, error: err.message });
  }
}

// Helper to log to Vercel console from API route
function logToScreen(message, type = 'log') {
  if (type === 'error') {
    console.error(`[API SAVE REGISTRATION] ${message}`);
  } else if (type === 'warn') {
    console.warn(`[API SAVE REGISTRATION] ${message}`);
  } else {
    console.log(`[API SAVE REGISTRATION] ${message}`);
  }
}
