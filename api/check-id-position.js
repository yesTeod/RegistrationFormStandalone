import { RekognitionClient, DetectTextCommand } from "@aws-sdk/client-rekognition";

// Configure AWS Rekognition Client
// AWS_REGION 
// AWS_ACCESS_KEY_ID
// AWS_SECRET_ACCESS_KEY

const rekognitionClient = new RekognitionClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Helper function to calculate overall bounding box from text detections
function calculateOverallBoundingBox(textDetections) {
  if (!textDetections || textDetections.length === 0) {
    return null;
  }

  let minLeft = 1.0;
  let minTop = 1.0;
  let maxRight = 0.0;
  let maxBottom = 0.0;
  let validBoxesFound = false;

  textDetections.forEach(detection => {
    if (detection.Type === "LINE" || (detection.Type === "WORD" && detection.Geometry.BoundingBox.Width > 0.05 && detection.Geometry.BoundingBox.Height > 0.02)) {
      const box = detection.Geometry.BoundingBox;
      minLeft = Math.min(minLeft, box.Left);
      minTop = Math.min(minTop, box.Top);
      maxRight = Math.max(maxRight, box.Left + box.Width);
      maxBottom = Math.max(maxBottom, box.Top + box.Height);
      validBoxesFound = true;
    }
  });

  if (!validBoxesFound) {
    return null;
  }

  const width = maxRight - minLeft;
  const height = maxBottom - minTop;
  const centerX = minLeft + width / 2;
  const centerY = minTop + height / 2;

  return { left: minLeft, top: minTop, width, height, centerX, centerY };
}


export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { image: imageDataUrl } = req.body;

    if (!imageDataUrl) {
      return res.status(400).json({ success: false, status: "ERROR", message: "Missing image data." });
    }

    const base64DataMatch = imageDataUrl.match(/^data:image\/jpeg;base64,(.+)$/);
    if (!base64DataMatch || !base64DataMatch[1]) {
      const parts = imageDataUrl.split(',');
      if (parts.length < 2 || !parts[1]) {
        return res.status(400).json({ success: false, status: "ERROR", message: "Invalid image data URL format." });
      }
    }
    const base64Data = base64DataMatch ? base64DataMatch[1] : imageDataUrl.split(',')[1];


    const imageBytes = Buffer.from(base64Data, 'base64');

    const params = {
      Image: {
        Bytes: imageBytes,
      },
    };

    const command = new DetectTextCommand(params);
    const rekognitionResponse = await rekognitionClient.send(command);
    const textDetections = rekognitionResponse.TextDetections;

    if (!textDetections || textDetections.length === 0) {
      return res.status(200).json({
        success: true,
        status: "NOT_DETECTED",
        message: "No ID text detected. Please ensure the ID is clear, well-lit, and fills the frame.",
      });
    }

    // Require a few lines of text to consider it a potential ID
    const lines = textDetections.filter(td => td.Type === "LINE");
    if (lines.length < 2) { 
        return res.status(200).json({
            success: true,
            status: "NOT_DETECTED",
            message: "Not enough text detected. Is the ID card clear and readable?",
        });
    }

    const overallBox = calculateOverallBoundingBox(lines); 

    if (!overallBox || overallBox.width <= 0 || overallBox.height <= 0) {
        return res.status(200).json({
            success: true,
            status: "NOT_DETECTED",
            message: "Could not determine ID position from detected text. Try again.",
        });
    }

    // Define criteria for good position 
    // These thresholds expect the ID to be the dominant object in the frame.
    const minWidthThreshold = 0.50; // ID should cover at least 50% of the image width
    const minHeightThreshold = 0.40; // ID should cover at least 40% of the image height
    const centerXTolerance = 0.20;  // Center X of ID should be within +/- 20% of image center (0.5)
    const centerYTolerance = 0.20;  // Center Y of ID should be within +/- 20% of image center (0.5)

    const isWellPositioned =
      overallBox.width >= minWidthThreshold &&
      overallBox.height >= minHeightThreshold &&
      Math.abs(overallBox.centerX - 0.5) <= centerXTolerance &&
      Math.abs(overallBox.centerY - 0.5) <= centerYTolerance;

    if (isWellPositioned) {
      return res.status(200).json({
        success: true,
        status: "DETECTED_GOOD_POSITION",
        message: "ID position looks good!",
      });
    } else {
      let message = "ID detected, but needs adjustment. ";
      if (overallBox.width < minWidthThreshold || overallBox.height < minHeightThreshold) {
        message += "Ensure the entire ID is visible and closer to the camera. ";
      }
      if (Math.abs(overallBox.centerX - 0.5) > centerXTolerance || Math.abs(overallBox.centerY - 0.5) > centerYTolerance) {
        message += "Please center the ID within the frame. ";
      }
      return res.status(200).json({
        success: true,
        status: "DETECTED_BAD_POSITION",
        message: message.trim(),
      });
    }

  } catch (error) {
    console.error("Error in /api/check-id-position:", error);
    let userMessage = "An error occurred while checking ID position.";
    if (error.name === 'InvalidParameterException') {
        userMessage = "The image sent for ID check appears to be invalid. Please try capturing again."
    } else if (error.name === 'AccessDeniedException') {
        userMessage = "Cannot access ID verification service. Please contact support." // More user-friendly for this case
    } else if (error.name === 'ProvisionedThroughputExceededException') {
        userMessage = "Verification service is busy, please try again in a moment."
    } else if (error.name === 'ThrottlingException') {
        userMessage = "Too many requests, please try again shortly."
    }
    
    return res.status(500).json({ 
        success: false, 
        status: "ERROR", 
        message: userMessage,
        // errorDetails: process.env.NODE_ENV === 'development' ? error.name : undefined 
    });
  }

} 
