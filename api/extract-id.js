// This is a Vercel Edge Function - better for long-running processes
export const config = {
  runtime: 'edge',
  regions: ['iad1'], // US East (N. Virginia)
};

// Common ID field labels and their variations
const FIELD_PATTERNS = {
  name: [
    /(?:^|\W)(?:name|full name|given name|first name)(?:\s*|:)/i,
    /(?:^|\W)surname(?:\s*|:)/i,
    /(?:^|\W)last name(?:\s*|:)/i
  ],
  fatherName: [
    /(?:^|\W)(?:father'?s? name|father|father'?s?)(?:\s*|:)/i,
    /(?:^|\W)(?:parent|parents)(?:\s*|:)/i
  ],
  idNumber: [
    /(?:^|\W)(?:id(?:entification)?|document|passport|card)\s+(?:number|no|#|code)(?:\s*|:)/i,
    /(?:^|\W)(?:number|no|#)(?:\s*|:)/i,
    /(?:^|\W)(?:id|document)(?:\s*|:)/i
  ],
  expiry: [
    /(?:^|\W)(?:expir(?:y|ation|es)|valid thro?u?|date of expiry)(?:\s*|:)/i,
    /(?:^|\W)(?:valid until|exp|expiry date)(?:\s*|:)/i
  ],
  dateOfBirth: [
    /(?:^|\W)(?:date of birth|birth date|birth|born|dob|d\.o\.b\.)(?:\s*|:)/i,
    /(?:^|\W)(?:born on|birthdate)(?:\s*|:)/i
  ],
  placeOfBirth: [
    /(?:^|\W)(?:place of birth|birth place|pob)(?:\s*|:)/i,
    /(?:^|\W)(?:born in|born at)(?:\s*|:)/i
  ],
  nationality: [
    /(?:^|\W)(?:nationality|citizen(?:ship)?)(?:\s*|:)/i,
    /(?:^|\W)(?:nation|country)(?:\s*|:)/i
  ],
  gender: [
    /(?:^|\W)(?:gender|sex)(?:\s*|:)/i
  ],
  address: [
    /(?:^|\W)(?:address|residence|(?:permanent|residential) address)(?:\s*|:)/i
  ],
  issuingAuthority: [
    /(?:^|\W)(?:issuing authority|issued by|authority|issuer)(?:\s*|:)/i,
    /(?:^|\W)(?:issued at|issued from)(?:\s*|:)/i
  ],
  issueDate: [
    /(?:^|\W)(?:date of issue|issue date|issued on|issued|issue)(?:\s*|:)/i
  ]
};

// Common date formats for validation
const DATE_PATTERNS = [
  /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/,
  /\b\d{2,4}[\/-]\d{1,2}[\/-]\d{1,2}\b/,
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2},? \d{2,4}\b/i, 
  /\b\d{1,2} (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{2,4}\b/i
];

// ID number patterns (vary by country)
const ID_NUMBER_PATTERNS = [
  /\b[A-Z]{1,3}\d{5,10}\b/,
  /\b\d{5,12}\b/,
  /\b[A-Z0-9]{6,12}\b/,
  /\b[A-Z]{1,3}[-\s]?\d{5,9}\b/
];

/**
 * Extract ID details using a structured approach
 */
function extractStructuredIdDetails(text) {
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
  
  // Normalize line breaks and split into clean lines
  const normalizedText = text.replace(/\r\n/g, '\n');
  const lines = normalizedText.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  // Create a single string for pattern matching
  const singleLineText = lines.join(' ');
  
  // First, try to extract using label patterns
  // This works by finding lines that contain field labels
  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i].toLowerCase();
    
    // For each field, check if current line contains its label
    Object.entries(FIELD_PATTERNS).forEach(([field, patterns]) => {
      // Skip if we already found this field
      if (result[field] !== "Not found") return;
      
      // Check if any pattern matches the current line
      const matchesLabel = patterns.some(pattern => pattern.test(currentLine));
      
      if (matchesLabel) {
        // If the label is alone on the line, check the next line for the value
        if (currentLine.length < 30 && i + 1 < lines.length) {
          result[field] = lines[i + 1].trim();
        } else {
          // Otherwise extract the value from the current line
          const valueMatch = currentLine.match(/(?::|^|(?:\W))[a-z\s]+(?::|^|\s+)(.*)/i);
          if (valueMatch && valueMatch[1]) {
            result[field] = valueMatch[1].trim();
          }
        }
      }
    });
  }
  
  // Extract ID number using specific patterns if not found via labels
  if (result.idNumber === "Not found") {
    for (const pattern of ID_NUMBER_PATTERNS) {
      const match = singleLineText.match(pattern);
      if (match) {
        // Validate it's not a date (to avoid confusion)
        const idCandidate = match[0];
        const isDate = DATE_PATTERNS.some(datePattern => datePattern.test(idCandidate));
        if (!isDate) {
          result.idNumber = idCandidate;
          break;
        }
      }
    }
  }
  
  // Extract dates if not found via labels
  const allDates = [];
  for (const pattern of DATE_PATTERNS) {
    const matches = singleLineText.match(new RegExp(pattern, 'g')) || [];
    matches.forEach(match => allDates.push(match));
  }
  
  // Assign dates based on context if they weren't found by labels
  if (allDates.length > 0) {
    // If expiry not found, use the latest date (assuming it's expiration)
    if (result.expiry === "Not found" && allDates.length >= 1) {
      // Sort dates by year (assuming DD/MM/YYYY format)
      const sortedDates = [...allDates].sort((a, b) => {
        const yearA = a.match(/\d{4}/) ? parseInt(a.match(/\d{4}/)[0]) : 
                    a.match(/\d{2}$/) ? parseInt(a.match(/\d{2}$/)[0]) + 2000 : 0;
        const yearB = b.match(/\d{4}/) ? parseInt(b.match(/\d{4}/)[0]) : 
                    b.match(/\d{2}$/) ? parseInt(b.match(/\d{2}$/)[0]) + 2000 : 0;
        return yearB - yearA; // Latest first
      });
      result.expiry = sortedDates[0];
    }
    
    // If DOB not found and we have more than one date, use earliest date
    if (result.dateOfBirth === "Not found" && allDates.length >= 2) {
      // Sort dates by year (assuming DD/MM/YYYY format)
      const sortedDates = [...allDates].sort((a, b) => {
        const yearA = a.match(/\d{4}/) ? parseInt(a.match(/\d{4}/)[0]) : 
                    a.match(/\d{2}$/) ? parseInt(a.match(/\d{2}$/)[0]) + 2000 : 0;
        const yearB = b.match(/\d{4}/) ? parseInt(b.match(/\d{4}/)[0]) : 
                    b.match(/\d{2}$/) ? parseInt(b.match(/\d{2}$/)[0]) + 2000 : 0;
        return yearA - yearB; // Earliest first
      });
      result.dateOfBirth = sortedDates[0];
    }
    
    // If issue date not found and we have more than two dates, use the middle one
    if (result.issueDate === "Not found" && allDates.length >= 3) {
      result.issueDate = allDates.filter(d => 
        d !== result.expiry && d !== result.dateOfBirth
      )[0] || "Not found";
    }
  }
  
  // Extract gender if not found
  if (result.gender === "Not found") {
    const genderMatch = singleLineText.match(/\b(male|female|m\b|f\b)\b/i);
    if (genderMatch) {
      const gender = genderMatch[1].toLowerCase();
      if (gender === 'm' || gender.includes('male')) {
        result.gender = 'Male';
      } else if (gender === 'f' || gender.includes('female')) {
        result.gender = 'Female';
      }
    }
  }
  
  // Extract name more robustly if not found via labels
  if (result.name === "Not found") {
    // Look for common name patterns
    // 1. "Name: John Doe"
    const nameColonMatch = singleLineText.match(/name:?\s+([A-Za-z\s]+)(?:\s|$)/i);
    if (nameColonMatch && nameColonMatch[1]) {
      result.name = nameColonMatch[1].trim();
    } else {
      // 2. Look for lines that might be names (proper case words) near the top of the ID
      const nameCandidates = lines.slice(0, Math.min(5, lines.length))
        .filter(line => 
          /^[A-Z][a-z]+(\s+[A-Z][a-z]+)+$/.test(line) && 
          !line.toLowerCase().includes('card') &&
          !line.toLowerCase().includes('id')
        );
      
      if (nameCandidates.length > 0) {
        result.name = nameCandidates[0];
      }
    }
  }
  
  // Clean up extracted values
  Object.keys(result).forEach(key => {
    if (result[key] !== "Not found") {
      // Remove any label text that got included in the value
      result[key] = result[key]
        .replace(/^(name|id|number|expiry|issued|gender|nationality|address|dob|birth|father)[\s:]+/i, '')
        .trim();
      
      // Remove trailing punctuation
      result[key] = result[key].replace(/[.,;:]+$/, '').trim();
    }
  });
  
  return result;
}

export default async function handler(request) {
  // Only accept POST requests
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Parse the request body
    const data = await request.json();
    const { image, englishOnly = false } = data;

    if (!image) {
      return new Response(
        JSON.stringify({ error: "Image data is required" }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Keep the original data URI format if it exists, or add it if it doesn't
    const base64Image = image.startsWith('data:image/') 
      ? image 
      : `data:image/jpeg;base64,${image}`;
    
    // Call OCR.space API using the native fetch (no node-fetch needed in Edge Functions)
    const formData = {
      base64Image: base64Image,
      apikey: process.env.OCR_SPACE_API_KEY || 'helloworld',
      language: 'eng', // Always use English for OCR
      isOverlayRequired: false,
      scale: true,
      OCREngine: 2, // More accurate engine
      detectOrientation: true, // Auto-detect image orientation
      filetype: 'jpg'  // Use lowercase 'jpg'
    };

    console.log('Sending request to OCR.space...');
    
    const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(formData).toString()
    });
    
    if (!ocrResponse.ok) {
      throw new Error(`OCR API responded with status: ${ocrResponse.status}`);
    }

    const ocrResult = await ocrResponse.json();
    console.log('OCR Response:', JSON.stringify(ocrResult, null, 2));
    
    if (!ocrResult.IsErroredOnProcessing && ocrResult.ParsedResults && ocrResult.ParsedResults.length > 0) {
      const extractedText = ocrResult.ParsedResults[0].ParsedText;
      console.log("OCR Extracted Text:", extractedText);
      
      // Filter the text to English-only characters if requested
      const processedText = englishOnly ? 
        extractedText.replace(/[^\x00-\x7F]/g, ' ').replace(/\s+/g, ' ').trim() : 
        extractedText;
      
      console.log("Processed Text (englishOnly=" + englishOnly + "):", processedText);
      
      // Use our structured approach for more accurate extraction
      const idDetails = extractStructuredIdDetails(processedText);
      
      // Log the complete extracted details
      console.log("Full ID extraction results:", JSON.stringify(idDetails, null, 2));
      
      return new Response(
        JSON.stringify(idDetails),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } else {
      const errorMessage = ocrResult.ErrorMessage || ocrResult.ErrorDetails || "Unknown OCR processing error";
      console.error("OCR Processing Error:", errorMessage);
      return new Response(
        JSON.stringify({ 
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
          issueDate: "Not found",
          debug: { 
            isErrored: ocrResult.IsErroredOnProcessing,
            hasResults: Boolean(ocrResult.ParsedResults),
            resultCount: ocrResult.ParsedResults?.length || 0
          }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return new Response(
      JSON.stringify({ 
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
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
