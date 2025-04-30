// Using node-fetch for API requests
import fetch from 'node-fetch';

// This is a Vercel Edge Function - better for long-running processes
export const config = {
  runtime: 'edge',
  regions: ['iad1'], // US East (N. Virginia)
};

// ID field labels in multiple languages and variations for more robust detection
const FIELD_LABELS = {
  name: [
    'name', 'full name', 'given name', 'first name', 'surname',
    'име', 'vime', 'imya', 'nombre', 'nom', 'naam', 'nama'
  ],
  fatherName: [
    'father', 'father\'s name', 'father name', 'father\'s',
    'patronymic', 'middle name', 'surname', 'family name', 'last name',
    'презиме', 'prezime', 'otchestvo', 'apellido', 'nom de famille',
    'family name', 'achternaam', 'nama keluarga'
  ],
  idNumber: [
    'id', 'id no', 'id number', 'document no', 'document number',
    'card no', 'card number', 'identity number', 'identification number',
    'national id', 'passport no', 'passport number',
    'номер', 'nomer', 'número', 'numéro', 'identificación',
    'kennung', 'nummer', 'номер паспорта'
  ],
  dateOfBirth: [
    'date of birth', 'birth date', 'born', 'dob', 'd.o.b',
    'date de naissance', 'fecha de nacimiento', 'data de nascimento',
    'geburtsdatum', 'geboortedatum', 'födelsedatum', 'дата рождения',
    'дата на раждане', 'tanggal lahir'
  ],
  placeOfBirth: [
    'place of birth', 'birth place', 'pob', 'born in', 'born at',
    'lieu de naissance', 'lugar de nacimiento', 'local de nascimento',
    'geburtsort', 'geboorteplaats', 'födelseort', 'место рождения',
    'място на раждане', 'tempat lahir'
  ],
  nationality: [
    'nationality', 'nation', 'citizen', 'citizenship',
    'nationalité', 'nacionalidad', 'nacionalidade',
    'staatsangehörigkeit', 'nationaliteit', 'nationalitet', 'гражданство',
    'гражданин', 'национальность', 'националност', 'kewarganegaraan'
  ],
  gender: [
    'gender', 'sex', 'genre', 'sexo', 'género',
    'geschlecht', 'geslacht', 'kön', 'пол', 'jenis kelamin'
  ],
  expiry: [
    'expiry', 'expire', 'expiration', 'expires on', 'exp', 'exp date', 'valid until', 'valid to',
    'date d\'expiration', 'fecha de caducidad', 'data de validade',
    'ablaufdatum', 'vervaldatum', 'utgångsdatum', 'срок действия',
    'срок на валидност', 'tanggal kadaluarsa'
  ],
  address: [
    'address', 'residence', 'residential address', 'permanent address', 'home address',
    'adresse', 'dirección', 'endereço', 'adres', 'адрес', 'адреса', 'alamat'
  ],
  issuingAuthority: [
    'issuing authority', 'issued by', 'authority', 'issuer', 'issue by',
    'autorité de délivrance', 'autoridad emisora', 'autoridade emissora',
    'ausstellende behörde', 'uitgevende instantie', 'utfärdande myndighet',
    'орган выдачи', 'орган, выдавший документ', 'издаден от', 'otoritas penerbit'
  ],
  issueDate: [
    'date of issue', 'issued on', 'issued date', 'issue date', 'date issued',
    'date de délivrance', 'fecha de emisión', 'data de emissão',
    'ausstellungsdatum', 'uitgiftedatum', 'utfärdandedatum',
    'дата выдачи', 'дата на издаване', 'tanggal penerbitan'
  ]
};

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
    
    // Call OCR.space API
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
      
      // Parse the extracted text into a structured data
      const parsedData = parseExtractedText(processedText);
      
      // Log the complete extracted details
      console.log("Full advanced ID extraction results:", JSON.stringify(parsedData, null, 2));
      
      return new Response(
        JSON.stringify(parsedData),
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

// Master parsing function to orchestrate all the extraction techniques
function parseExtractedText(text) {
  // Prepare the text in various formats for multi-format searching
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const joinedText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

  // Create an object with all the extracted data
  return {
    name: extractField(text, lines, joinedText, 'name'),
    fatherName: extractField(text, lines, joinedText, 'fatherName'),
    idNumber: extractIdNumber(text, lines, joinedText),
    expiry: extractDateField(text, lines, joinedText, 'expiry'),
    dateOfBirth: extractDateField(text, lines, joinedText, 'dateOfBirth'),
    placeOfBirth: extractField(text, lines, joinedText, 'placeOfBirth'),
    nationality: extractField(text, lines, joinedText, 'nationality'),
    gender: extractGender(text, lines, joinedText),
    address: extractMultilineField(text, lines, joinedText, 'address'),
    issuingAuthority: extractField(text, lines, joinedText, 'issuingAuthority'),
    issueDate: extractDateField(text, lines, joinedText, 'issueDate'),
    // Add Raw OCR text for debugging
    rawText: text
  };
}

// Generic field extractor that applies multiple strategies
function extractField(text, lines, joinedText, fieldType) {
  const labels = FIELD_LABELS[fieldType];
  if (!labels) return "Not found";
  
  // Results from different extraction strategies
  const results = [];

  // Strategy 1: Look for label on a line followed by value on next line
  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i].toLowerCase();
    
    // Check if current line contains any of the field labels
    const matchingLabel = labels.find(label => 
      currentLine === label.toLowerCase() || 
      currentLine.includes(label.toLowerCase() + ':') ||
      currentLine.includes(label.toLowerCase() + ' ')
    );
    
    if (matchingLabel && i + 1 < lines.length) {
      // Check if the next line is not a labeled field itself
      const nextLine = lines[i + 1];
      const isNextLineLabel = Object.values(FIELD_LABELS).flat().some(label => 
        nextLine.toLowerCase() === label.toLowerCase() || 
        nextLine.toLowerCase().startsWith(label.toLowerCase() + ':')
      );
      
      if (!isNextLineLabel) {
        results.push({
          value: nextLine,
          confidence: 0.9, // High confidence for this pattern
          method: 'next-line'
        });
      }
    }
  }

  // Strategy 2: Look for "label: value" pattern in each line
  for (const label of labels) {
    const pattern = new RegExp(`(?:^|\\s)${label}[:\\s]+([^\\n]+)`, 'i');
    const match = text.match(pattern);
    if (match && match[1]) {
      results.push({
        value: match[1].trim(),
        confidence: 0.85, // Good confidence
        method: 'same-line'
      });
    }
  }

  // Strategy 3: Look for matches in the joined text (for cases where newlines are misplaced)
  for (const label of labels) {
    const pattern = new RegExp(`${label}[:\\s]+([^.,:;]+)`, 'i');
    const match = joinedText.match(pattern);
    if (match && match[1]) {
      results.push({
        value: match[1].trim(),
        confidence: 0.7, // Lower confidence since joins can be messy
        method: 'joined-text'
      });
    }
  }

  // Additional field-specific strategies can be added here

  // If we have results, return the highest confidence result
  if (results.length > 0) {
    // Sort by confidence, highest first
    results.sort((a, b) => b.confidence - a.confidence);
    return results[0].value;
  }

  return "Not found";
}

// Special processing for ID numbers that often have specific formats
function extractIdNumber(text, lines, joinedText) {
  // First try standard field extraction
  const standardResult = extractField(text, lines, joinedText, 'idNumber');
  if (standardResult !== "Not found") {
    return standardResult;
  }
  
  // Look for common ID number patterns
  const idPatterns = [
    // Alphanumeric sequences that look like ID numbers
    /\b([A-Z0-9]{6,15})\b/g,
    // ID number with specific formatting
    /\b(\d{2,4}[-\s]\d{2,4}[-\s]\d{2,4})\b/g,
    // Passport-like numbers
    /\b([A-Z]{1,2}\d{6,9})\b/g
  ];
  
  // Collect all possible matches
  let allMatches = [];
  for (const pattern of idPatterns) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      // Score the match - it's better if it's not part of a date
      const isDate = /^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(match[1]);
      if (!isDate) {
        allMatches.push({
          value: match[1],
          // Higher score for formats with letters and numbers mixed
          score: /[A-Z].*\d|\d.*[A-Z]/.test(match[1]) ? 5 : 3
        });
      }
    }
  }
  
  // If any line has "ID" by itself, check next line for potential ID number
  for (let i = 0; i < lines.length; i++) {
    if (/^id(?:entity)?$/i.test(lines[i]) && i + 1 < lines.length) {
      const potentialId = lines[i + 1].trim();
      // If it looks like a good ID format
      if (/^[A-Z0-9\-\/]{6,}$/.test(potentialId)) {
        allMatches.push({
          value: potentialId,
          score: 8 // Higher score as explicitly labeled
        });
      }
    }
  }
  
  // Sort by score and return best match
  if (allMatches.length > 0) {
    allMatches.sort((a, b) => b.score - a.score);
    return allMatches[0].value;
  }
  
  return "Not found";
}

// Special extraction for date fields with format validation
function extractDateField(text, lines, joinedText, fieldType) {
  // First try standard field extraction
  const standardResult = extractField(text, lines, joinedText, fieldType);
  
  // Check if result is a well-formed date
  if (standardResult !== "Not found") {
    // If it's already a date format, return it
    if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(standardResult)) {
      return standardResult;
    }
    
    // Try to extract date from the standard result
    const dateMatch = standardResult.match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/);
    if (dateMatch) {
      return dateMatch[0];
    }
  }
  
  // Collect all dates from text
  const allDates = [...text.matchAll(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/g)].map(m => m[0]);
  
  if (allDates.length === 0) {
    return "Not found";
  }
  
  // For expiry date, prefer the latest date
  if (fieldType === 'expiry' && allDates.length > 0) {
    // Try to parse dates and find the latest
    const parsedDates = allDates.map(date => {
      const parts = date.split(/[\/-]/);
      // Assuming day/month/year or month/day/year format
      if (parts.length === 3) {
        // Convert 2-digit years to 4-digit (assuming 21st century for simplicity)
        const year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
        // Try both date formats
        const dateAttempt1 = new Date(`${parts[1]}/${parts[0]}/${year}`); // day/month/year
        const dateAttempt2 = new Date(`${parts[0]}/${parts[1]}/${year}`); // month/day/year
        
        // Use the valid date
        if (!isNaN(dateAttempt1.getTime())) return { date: dateAttempt1, original: date };
        if (!isNaN(dateAttempt2.getTime())) return { date: dateAttempt2, original: date };
      }
      return { date: new Date(0), original: date }; // Invalid date
    });
    
    // Sort by date
    parsedDates.sort((a, b) => b.date.getTime() - a.date.getTime());
    
    // Return the latest date
    if (parsedDates.length > 0 && parsedDates[0].date.getTime() > 0) {
      return parsedDates[0].original;
    }
    
    // If parsing fails, just return the last date in the list
    return allDates[allDates.length - 1];
  }
  
  // For DOB, prefer an earlier date
  if (fieldType === 'dateOfBirth' && allDates.length > 0) {
    // For simplicity, just use the first date if there are multiple
    // A more sophisticated approach would check if the date makes sense for a birthdate
    return allDates[0];
  }
  
  // For issue date, if there are exactly 3 dates, it's often the middle one
  // (DOB, issue date, expiry date sequence is common)
  if (fieldType === 'issueDate' && allDates.length === 3) {
    return allDates[1];
  }
  
  // Last resort, return first date (with low confidence)
  return "Not found";
}

// Special extraction for gender with limited valid values
function extractGender(text, lines, joinedText) {
  // First try standard field extraction
  const standardResult = extractField(text, lines, joinedText, 'gender');
  
  if (standardResult !== "Not found") {
    // Normalize gender values
    const normalizedGender = standardResult.toLowerCase().trim();
    if (normalizedGender === 'm' || normalizedGender.includes('male')) {
      return 'Male';
    } else if (normalizedGender === 'f' || normalizedGender.includes('female')) {
      return 'Female';
    }
  }
  
  // Look for standalone M or F
  const genderMarker = /\b([MF])\b/g;
  const genderMatches = [...text.matchAll(genderMarker)];
  
  if (genderMatches.length > 0) {
    return genderMatches[0][1] === 'M' ? 'Male' : 'Female';
  }
  
  // Look for M/F, Sex: M, etc.
  const genderPattern = /(?:sex|gender)[:\s]*([MF])/i;
  const match = text.match(genderPattern);
  if (match && match[1]) {
    return match[1] === 'M' ? 'Male' : 'Female';
  }
  
  return "Not found";
}

// Special handling for fields that might span multiple lines like address
function extractMultilineField(text, lines, joinedText, fieldType) {
  // First try standard extraction
  const standardResult = extractField(text, lines, joinedText, fieldType);
  if (standardResult !== "Not found") {
    return standardResult;
  }
  
  // Special case for address
  if (fieldType === 'address') {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().match(/(?:^|[^\w])(?:address|residence)(?:[^\w]|$)/i)) {
        // Found address label, collect the next 1-3 lines as the address
        let addressLines = [];
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          // Stop if we hit another field label
          if (Object.values(FIELD_LABELS).flat().some(label => 
            lines[j].toLowerCase() === label.toLowerCase() ||
            lines[j].toLowerCase().startsWith(label.toLowerCase() + ':')
          )) {
            break;
          }
          addressLines.push(lines[j]);
        }
        
        if (addressLines.length > 0) {
          return addressLines.join(', ');
        }
      }
    }
    
    // Try to find address-like text (contains street/ave/rd/etc. or postal codes)
    for (const line of lines) {
      if (
        /\b(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|way|place|pl|court|ct)\b/i.test(line) ||
        /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(line) || // US ZIP code
        /\b[A-Z]\d[A-Z]\s*\d[A-Z]\d\b/i.test(line)      // Canadian postal code
      ) {
        return line;
      }
    }
  }
  
  return "Not found";
} 