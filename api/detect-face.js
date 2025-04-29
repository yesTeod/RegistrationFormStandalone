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

    const MIN_FACE_CONFIDENCE = 90; // Minimum confidence threshold (0-100)

    let faceDetected = false;
    let pose = null;
    let error = null;
    let confidence = null; // Optional: log confidence

    if (Array.isArray(response.FaceDetails) && response.FaceDetails.length > 0) {
        const primaryFace = response.FaceDetails[0];
        confidence = primaryFace.Confidence; // Store confidence

        // Check if confidence meets the threshold
        if (confidence >= MIN_FACE_CONFIDENCE) {
            faceDetected = true;
            // Extract Pose only if confidence is sufficient
            if (primaryFace.Pose) {
                pose = primaryFace.Pose; // Contains Yaw, Pitch, Roll
            } else {
                console.warn(`Face detected with sufficient confidence (${confidence}%), but Pose data is missing.`);
                error = "Pose data not available despite good detection"; 
            }
        } else {
            // Confidence too low, treat as no detection for our purposes
            console.log(`Face detected but confidence (${confidence}%) below threshold (${MIN_FACE_CONFIDENCE}%).`);
            faceDetected = false; 
            // error = "Face detected with low confidence"; // Optionally set specific error
        }
    } else {
        // No face details returned by Rekognition
        error = "No face detected";
    }

    // Return the detection status and pose data
    return res.status(200).json({ faceDetected, pose, confidence, error }); // Include confidence for potential debugging

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
