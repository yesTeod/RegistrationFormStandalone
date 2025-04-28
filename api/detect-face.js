import { RekognitionClient, DetectFacesCommand } from "@aws-sdk/client-rekognition";

const client = new RekognitionClient({ region: process.env.AWS_REGION });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed', faceDetected: false, pose: null });
  }

  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Image data is required', faceDetected: false, pose: null });
    }

    // Decode Data URL
    const [, base] = image.split(',');
    if (!base) {
       // Handle case where split fails or doesn't produce expected parts
       return res.status(400).json({ error: 'Invalid image data format', faceDetected: false, pose: null });
    }
    const buffer = Buffer.from(base, 'base64');

    // Call Rekognition DetectFaces requesting ALL attributes
    const command = new DetectFacesCommand({ 
      Image: { Bytes: buffer }, 
      Attributes: ["ALL"] // Request all attributes to get Pose
    });
    
    const response = await client.send(command);

    const faceDetected = Array.isArray(response.FaceDetails) && response.FaceDetails.length > 0;
    let pose = null;
    let error = null;

    if (faceDetected) {
      // Extract Pose from the first detected face if available
      if (response.FaceDetails[0].Pose) {
        pose = response.FaceDetails[0].Pose; // Contains Yaw, Pitch, Roll
      } else {
         console.warn("Face detected but Pose data is missing in Rekognition response.");
         // Optionally set an error or just return null pose
         error = "Pose data not available"; 
      }
    } else {
        // Optionally set an error if no face is detected
        // error = "No face detected"; // Or handle this specifically on the frontend
    }

    // Return the detection status and pose data
    return res.status(200).json({ faceDetected, pose, error });

  } catch (err) {
    console.error('detect-face error:', err);
    // Provide more specific error feedback if possible
    let errorMessage = 'Face detection failed';
    if (err.name === 'InvalidParameterException') {
        errorMessage = 'Invalid image data or parameters for face detection.';
        return res.status(400).json({ error: errorMessage, details: err.message, faceDetected: false, pose: null });
    } else if (err.name === 'ImageTooLargeException') {
         errorMessage = 'Image size is too large for detection.';
         return res.status(413).json({ error: errorMessage, details: err.message, faceDetected: false, pose: null }); // 413 Payload Too Large
    }
    // Generic server error for other cases
    return res.status(500).json({ error: errorMessage, details: err.message, faceDetected: false, pose: null });
  }
}
