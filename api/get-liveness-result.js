import { RekognitionClient, GetFaceLivenessSessionResultsCommand } from "@aws-sdk/client-rekognition";

// Initialize the Rekognition Client (ensure region and credentials are configured)
const client = new RekognitionClient({ region: process.env.AWS_REGION || "us-east-1" });

export default async function handler(req, res) {
  // Use GET and expect sessionId as a query parameter
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { sessionId } = req.query;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId query parameter is required' });
  }

  try {
    const command = new GetFaceLivenessSessionResultsCommand({ SessionId: sessionId });

    console.log(`Attempting to get liveness results for session: ${sessionId}`);
    const response = await client.send(command);

    // Process the response
    const { Status, Confidence, IsLive } = response;

    // Note: Status could be SUCCEEDED, FAILED, IN_PROGRESS, EXPIRED
    console.log(`Liveness result status: ${Status}, IsLive: ${IsLive}, Confidence: ${Confidence}`);

    // You might want to check the Status before confirming liveness
    if (Status === 'SUCCEEDED') {
        return res.status(200).json({
            isLive: IsLive ?? false, // Return false if IsLive is undefined for safety
            confidence: Confidence,
            status: Status,
            // Optionally include ReferenceImage S3 path if configured and needed
            // referenceImage: response.ReferenceImage ? { Bucket: response.ReferenceImage.S3Object.Bucket, Key: response.ReferenceImage.S3Object.Name } : null
        });
    } else if (Status === 'IN_PROGRESS') {
        // This shouldn't normally happen if called after onAnalysisComplete, but handle it.
         console.warn(`Liveness session ${sessionId} is still in progress.`);
         return res.status(202).json({ error: 'Liveness check still in progress', status: Status }); // 202 Accepted
    } else {
         // Handle FAILED, EXPIRED statuses
         console.error(`Liveness session ${sessionId} failed or expired. Status: ${Status}`);
         return res.status(400).json({ 
             error: `Liveness check ${Status.toLowerCase()}`, 
             isLive: false, // Assume not live if session didn't succeed
             status: Status 
         });
    }

  } catch (err) {
    console.error(`Error getting liveness results for session ${sessionId}:`, err);
    let errorMessage = 'Failed to get liveness results';
    let statusCode = 500;

    if (err.name === 'AccessDeniedException') {
      errorMessage = 'Access denied. Check IAM permissions for GetFaceLivenessSessionResults.';
      statusCode = 403;
    } else if (err.name === 'InternalServerError') {
      errorMessage = 'Internal server error from Rekognition.';
    } else if (err.name === 'InvalidParameterException') {
      errorMessage = 'Invalid parameters provided (likely invalid SessionId).';
      statusCode = 400;
    } else if (err.name === 'SessionNotFoundException') {
        errorMessage = 'Liveness session not found.';
        statusCode = 404;
    } else if (err.name === 'ThrottlingException') {
        errorMessage = 'Request throttled. Please try again later.';
        statusCode = 429;
    }

    return res.status(statusCode).json({ error: errorMessage, details: err.message });
  }
} 