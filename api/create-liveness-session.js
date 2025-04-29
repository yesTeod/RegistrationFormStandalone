import { RekognitionClient, CreateFaceLivenessSessionCommand } from "@aws-sdk/client-rekognition";

// Ensure AWS region is configured via environment variables
const client = new RekognitionClient({ region: process.env.AWS_REGION });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Optional: Add settings like AuditImagesLimit
    const command = new CreateFaceLivenessSessionCommand({}); 
    const { SessionId } = await client.send(command);

    if (!SessionId) {
       throw new Error("Failed to create liveness session.");
    }

    console.log(`[Liveness] Created session: ${SessionId}`);
    return res.status(200).json({ sessionId: SessionId });

  } catch (err) {
    console.error('[Liveness] Error creating session:', err);
    // Provide specific error messages based on err.name if needed
    return res.status(500).json({ 
        error: 'Could not create liveness session', 
        details: err.message || 'Internal server error' 
    });
  }
} 