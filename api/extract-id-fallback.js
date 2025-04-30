// Simple ID field extraction patterns
const FIELD_PATTERNS = {
  name: /(?:^|\W)(?:name|full name|given name)\s*:\s*([^\n]+)/i,
  fatherName: /(?:^|\W)(?:father'?s? name|father)\s*:\s*([^\n]+)/i,
  idNumber: /(?:^|\W)(?:id|document|card)\s+(?:number|no|#)\s*:\s*([^\n]+)/i,
  expiry: /(?:^|\W)(?:expiry|expiration|valid until)\s*:\s*([^\n]+)/i,
  dateOfBirth: /(?:^|\W)(?:date of birth|birth date|dob)\s*:\s*([^\n]+)/i,
  placeOfBirth: /(?:^|\W)(?:place of birth|birth place)\s*:\s*([^\n]+)/i,
  nationality: /(?:^|\W)(?:nationality|citizenship)\s*:\s*([^\n]+)/i,
  gender: /(?:^|\W)(?:gender|sex)\s*:\s*([^\n]+)/i,
  address: /(?:^|\W)(?:address|residence)\s*:\s*([^\n]+)/i,
  issuingAuthority: /(?:^|\W)(?:issuing authority|issued by)\s*:\s*([^\n]+)/i,
  issueDate: /(?:^|\W)(?:date of issue|issue date)\s*:\s*([^\n]+)/i
};

/**
 * Simplified extraction for the fallback version
 */
function extractIdDetailsSimple(text) {
  // Initialize results with default values
  const result = {
    name: "Not found",
    fatherName: "Not found",
    idNumber: "Not found",
    expiry: "Not found",
    dateOfBirth: "Not found",
    placeOfBirth: "Not found",
    nationality: "Not found",
    gender: "Not found",
    address: "Not found",
    issuingAuthority: "Not found",
    issueDate: "Not found"
  };
  
  // Extract information using pattern matching
  Object.keys(FIELD_PATTERNS).forEach(field => {
    const match = text.match(FIELD_PATTERNS[field]);
    if (match && match[1]) {
      result[field] = match[1].trim();
    }
  });
  
  // Look for dates if we didn't find them yet
  if (result.dateOfBirth === "Not found" || result.expiry === "Not found" || result.issueDate === "Not found") {
    const dateMatches = text.match(/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/g) || [];
    if (dateMatches.length >= 1 && result.expiry === "Not found") {
      result.expiry = dateMatches[dateMatches.length - 1]; // Last date is likely expiry
    }
    if (dateMatches.length >= 2 && result.dateOfBirth === "Not found") {
      result.dateOfBirth = dateMatches[0]; // First date is likely DOB
    }
  }
  
  // Look for ID numbers if not found using patterns
  if (result.idNumber === "Not found") {
    const idMatch = text.match(/\b[A-Z0-9]{6,12}\b/);
    if (idMatch) {
      result.idNumber = idMatch[0];
    }
  }
  
  return result;
}

/**
 * Simplified OCR extraction fallback API for non-Edge environments
 */
export default async function handler(req, res) {
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse the request body
    const { image, englishOnly = false } = req.body;

    if (!image) {
      return res.status(400).json({ error: "Image data is required" });
    }

    // Keep the original data URI format if it exists, or add it if it doesn't
    const base64Image = image.startsWith('data:image/') 
      ? image 
      : `data:image/jpeg;base64,${image}`;
    
    // Call OCR.space API
    const formData = new URLSearchParams();
    formData.append('base64Image', base64Image);
    formData.append('apikey', process.env.OCR_SPACE_API_KEY || 'helloworld');
    formData.append('language', 'eng');
    formData.append('isOverlayRequired', 'false');
    formData.append('scale', 'true');
    formData.append('OCREngine', '2');
    formData.append('detectOrientation', 'true');
    formData.append('filetype', 'jpg');

    console.log('Sending request to OCR.space (fallback)...');
    
    const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData
    });
    
    if (!ocrResponse.ok) {
      throw new Error(`OCR API responded with status: ${ocrResponse.status}`);
    }

    const ocrResult = await ocrResponse.json();
    
    if (!ocrResult.IsErroredOnProcessing && ocrResult.ParsedResults && ocrResult.ParsedResults.length > 0) {
      const extractedText = ocrResult.ParsedResults[0].ParsedText;
      
      // Filter the text to English-only characters if requested
      const processedText = englishOnly ? 
        extractedText.replace(/[^\x00-\x7F]/g, ' ').replace(/\s+/g, ' ').trim() : 
        extractedText;
      
      // Extract ID details using our simplified approach
      const idDetails = extractIdDetailsSimple(processedText);
      
      return res.status(200).json(idDetails);
    } else {
      const errorMessage = ocrResult.ErrorMessage || ocrResult.ErrorDetails || "Unknown OCR processing error";
      console.error("OCR Processing Error:", errorMessage);
      return res.status(200).json({ 
        error: errorMessage, 
        name: "Not found", 
        fatherName: "Not found",
        idNumber: "Not found", 
        expiry: "Not found",
        dateOfBirth: "Not found",
        placeOfBirth: "Not found",
        nationality: "Not found",
        gender: "Not found",
        address: "Not found",
        issuingAuthority: "Not found",
        issueDate: "Not found"
      });
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return res.status(200).json({ 
      error: error.message || "Processing error", 
      name: "Not found", 
      fatherName: "Not found",
      idNumber: "Not found", 
      expiry: "Not found",
      dateOfBirth: "Not found",
      placeOfBirth: "Not found",
      nationality: "Not found",
      gender: "Not found",
      address: "Not found",
      issuingAuthority: "Not found",
      issueDate: "Not found"
    });
  }
} 