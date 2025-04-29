import { RekognitionClient, CreateFaceLivenessSessionCommand } from "@aws-sdk/client-rekognition";

// Initialize the Rekognition Client
// Ensure your AWS region and credentials are configured correctly
// For Vercel/Netlify, set environment variables (AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
const client = new RekognitionClient({ region: process.env.AWS_REGION || "us-east-1" });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Optional: Add settings like AuditImagesLimit, OutputConfig (for S3 storage) if needed
    const command = new CreateFaceLivenessSessionCommand({}); 
    
    const resolvedRegion = await client.config.region();
    console.log(`[DEBUG] Rekognition client configured for region: ${resolvedRegion}`);

    console.log("Attempting to create liveness session...");
    const response = await client.send(command);
    
    if (response.SessionId) {
        console.log("Liveness session created successfully:", response.SessionId);
      return res.status(200).json({ sessionId: response.SessionId });
    } else {
        console.error("Failed to create liveness session, no SessionId in response:", response);
        return res.status(500).json({ error: 'Failed to create liveness session' });
    }

  } catch (err) {
    console.error('Error creating liveness session:', err);
    // Provide more specific error feedback if possible
    let errorMessage = 'Failed to create liveness session';
    let statusCode = 500;

    if (err.name === 'AccessDeniedException') {
      errorMessage = 'Access denied. Check IAM permissions for CreateFaceLivenessSession.';
      statusCode = 403;
    } else if (err.name === 'InternalServerError') {
      errorMessage = 'Internal server error from Rekognition.';
      statusCode = 500;
    } else if (err.name === 'InvalidParameterException') {
      errorMessage = 'Invalid parameters provided for session creation.';
       statusCode = 400;
    } else if (err.name === 'ThrottlingException') {
        errorMessage = 'Request throttled. Please try again later.';
        statusCode = 429;
    }
    
    return res.status(statusCode).json({ error: errorMessage, details: err.message });
  }
} 
