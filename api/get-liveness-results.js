import { RekognitionClient, GetFaceLivenessSessionResultsCommand } from "@aws-sdk/client-rekognition";

const client = new RekognitionClient({ region: process.env.AWS_REGION });

export default async function handler(req, res) {
  // Use GET method to fetch results by SessionId passed in query param
  if (req.method !== 'GET') { 
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { sessionId } = req.query; // Get sessionId from query parameters

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId query parameter is required' });
  }

  try {
    console.log(`[Liveness] Getting results for session: ${sessionId}`);
    const command = new GetFaceLivenessSessionResultsCommand({ SessionId: sessionId });
    const response = await client.send(command);

    // Check if the session is still processing or failed early
    if (response.Status === 'IN_PROGRESS') {
        console.log(`[Liveness] Session ${sessionId} still in progress.`);
        // Return a specific status or message indicating it's not ready
        // The frontend component might handle polling internally, 
        // but this API can return the current state.
        return res.status(202).json({ 
            status: response.Status, 
            message: 'Liveness check is still in progress.' 
        }); 
    }

    // If status is FAILED or SUCCEEDED, return the full response
    console.log(`[Liveness] Session ${sessionId} result: ${response.Status}, Confidence: ${response.Confidence}`);
    
    // Rekognition returns the reference image bytes directly (not base64 encoded in the SDK response object typicaly)
    // We need to encode it to base64 to send it via JSON and use in verify-face easily.
    let referenceImageBase64 = null;
    if (response.ReferenceImage && response.ReferenceImage.Bytes) {
        referenceImageBase64 = Buffer.from(response.ReferenceImage.Bytes).toString('base64');
    }

    return res.status(200).json({
        sessionId: response.SessionId,
        status: response.Status, // SUCCEEDED, FAILED, IN_PROGRESS
        confidence: response.Confidence,
        // Include other fields like AuditImages if needed
        referenceImageBase64: referenceImageBase64, // Send base64 encoded image
        // BoundingBox: response.ReferenceImage?.BoundingBox // Optionally include bounding box
    });

  } catch (err) {
    console.error(`[Liveness] Error getting results for session ${sessionId}:`, err);
    // Handle specific errors like SessionNotFoundException
    if (err.name === 'SessionNotFoundException') {
         return res.status(404).json({ error: 'Liveness session not found', details: err.message });
    }
    return res.status(500).json({ 
        error: 'Could not get liveness session results', 
        details: err.message || 'Internal server error' 
    });
  }
} 