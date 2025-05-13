import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;
const client = new MongoClient(uri);

let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) {
    return cachedDb;
  }
  try {
    await client.connect();
    const db = client.db(dbName);
    cachedDb = db;
    console.log("Connected to MongoDB for admin/users");
    return db;
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    await client.close(); 
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  console.log("Attempting to fetch all users for admin dashboard");

  try {
    const db = await connectToDatabase();
    const collection = db.collection('user_verifications');

    // Projection to exclude passwordHash and include other necessary fields
    const projection = { 
      passwordHash: 0, 
      // You can explicitly include other fields if needed, 
      // or leave it like this to get all fields except passwordHash
      // email: 1, 
      // idDetails: 1, 
      // status: 1 
    };

    const users = await collection.find({}, { projection }).toArray();

    if (users) {
      console.log(`Successfully fetched ${users.length} users.`);
      return res.status(200).json({ success: true, users });
    } else {
      // This case might not be reached if collection.find().toArray() returns [] for no users
      console.log("No users found.");
      return res.status(404).json({ success: false, error: 'No users found' });
    }

  } catch (error) {
    console.error("Error fetching users for admin:", error);
    return res.status(500).json({ success: false, error: 'Internal Server Error', message: error.message });
  }
} 
