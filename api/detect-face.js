import { RekognitionClient, DetectFacesCommand } from "@aws-sdk/client-rekognition";

const client = new RekognitionClient({ region: process.env.AWS_REGION });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Image data is required' });
    }

    // Decode Data URL
    const [, base] = image.split(',');
    const buffer = Buffer.from(base, 'base64');

    // Call Rekognition DetectFaces with ALL attributes to get smile and eye info
    const command = new DetectFacesCommand({ 
      Image: { Bytes: buffer }, 
      Attributes: ["ALL"]  // Changed from DEFAULT to ALL to get detailed facial attributes
    });
    const response = await client.send(command);
    const faceDetected = Array.isArray(response.FaceDetails) && response.FaceDetails.length > 0;
    
    // Extract blinking, smiling and pose information if a face is detected
    let isBlinking = false;
    let isSmiling = false;
    let headPose = { roll: 0, yaw: 0, pitch: 0 };
    let boundingBox = null;
    
    if (faceDetected && response.FaceDetails[0]) {
      const faceDetails = response.FaceDetails[0];
      
      // Check for blinking - if either eye is closed with high confidence
      const leftEyeClosed = faceDetails.EyesOpen && faceDetails.EyesOpen.Value === false && faceDetails.EyesOpen.Confidence > 80;
      const rightEyeClosed = faceDetails.EyesOpen && faceDetails.EyesOpen.Value === false && faceDetails.EyesOpen.Confidence > 80;
      isBlinking = leftEyeClosed || rightEyeClosed;
      
      isSmiling = faceDetails.Smile && faceDetails.Smile.Value === true && faceDetails.Smile.Confidence > 80;
      
      if (faceDetails.Pose) {
        headPose = {
          roll: faceDetails.Pose.Roll,  // Tilt (left/right)
          yaw: faceDetails.Pose.Yaw,    // Turn (left/right)
          pitch: faceDetails.Pose.Pitch // Up/down
        };
      }
      
      // Get face bounding box for UI positioning
      if (faceDetails.BoundingBox) {
        boundingBox = faceDetails.BoundingBox;
      }
    }

    return res.status(200).json({ 
      faceDetected,
      isBlinking,
      isSmiling,
      headPose,
      boundingBox
    });
  } catch (err) {
    console.error('detect-face error:', err);
    return res.status(500).json({ error: 'Face detection failed', details: err.message });
  }
}

