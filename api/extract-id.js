// Using AWS SDK for Textract
import { TextractClient, AnalyzeDocumentCommand } from "@aws-sdk/client-textract";

// This is a Vercel Edge Function - better for long-running processes
export const config = {
  runtime: 'edge',
  regions: ['iad1'], // US East (N. Virginia)
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

    // Extract base64 data from the data URI
    let base64Image = image;
    if (image.startsWith('data:image/')) {
      const base64Data = image.split(',')[1];
      base64Image = base64Data;
    }

    // Convert base64 to binary
    const binaryImage = Buffer.from(base64Image, 'base64');
    
    // Configure AWS client
    const textractClient = new TextractClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    });

    // Prepare Textract request
    const params = {
      Document: {
        Bytes: binaryImage
      },
      FeatureTypes: ['FORMS', 'TABLES']
    };

    console.log('Sending request to AWS Textract...');
    
    // Call Textract service
    const command = new AnalyzeDocumentCommand(params);
    const textractResponse = await textractClient.send(command);
    
    console.log('Textract Response Received');
    
    if (textractResponse.Blocks) {
      // Extract the full text from Textract response
      const extractedText = extractTextFromBlocks(textractResponse.Blocks);
      console.log("Textract Extracted Text:", extractedText);
      
      // Filter the text to English-only characters if requested
      const processedText = englishOnly ?
        extractedText.replace(/[^a-zA-Z0-9\s\-/.,]/g, ' ').replace(/\s+/g, ' ').trim() : // Keep only basic Latin, numbers, space, -, /, ., ,
        extractedText;
      
      console.log("Processed Text (englishOnly=" + englishOnly + "):", processedText);
      
      // Extract form fields directly from Textract response
      const formFields = extractFormFields(textractResponse.Blocks);
      console.log("Extracted Form Fields:", formFields);
      
      // Extract key-value pairs for name parts
      const extractedNameDetailsFromText = extractNameFromText(processedText); // returns { givenName, surname, fatherName }

      // --- Determine Given Name, Surname, and Father's Name ---
      // Prioritize specific fields from Textract FORMS
      let givenName = findValueByKey(formFields, ["given name", "first name"]);
      let surname = findValueByKey(formFields, ["surname", "last name", "family name"]);
      let fatherName = findValueByKey(formFields, ["father's name"]);

      // If a general "name" field from forms is present and specific "given name" is not,
      // use the general "name" field. Also, if this general "name" seems to include the surname,
      // try to extract just the given name part.
      const generalNameFromForms = findValueByKey(formFields, ["name"]);
      if (!givenName && generalNameFromForms) {
        givenName = generalNameFromForms;
      }

      // If both generalNameFromForms (used as givenName) and a separate surname are found,
      // and givenName appears to be a full name containing the surname, refine givenName.
      if (givenName && surname && givenName !== "Not found" && surname !== "Not found") {
        const gnLower = givenName.toLowerCase();
        const snLower = surname.toLowerCase();
        // Check if givenName ends with surname (and is longer)
        if (gnLower.endsWith(snLower) && gnLower.length > snLower.length) {
          // Check if there's a space before the surname part in givenName
          if (gnLower.charAt(gnLower.length - snLower.length - 1) === ' ') {
            givenName = givenName.substring(0, gnLower.length - snLower.length - 1).trim();
          }
        }
      }
      
      // Fallback to text extraction results if form fields didn't provide the values
      givenName = givenName || extractedNameDetailsFromText.givenName;
      surname = surname || extractedNameDetailsFromText.surname;
      fatherName = fatherName || extractedNameDetailsFromText.fatherName;

      // Ensure "Not found" for empty or null results, and trim
      givenName = (givenName && givenName.trim() !== "") ? givenName.trim() : "Not found";
      surname = (surname && surname.trim() !== "") ? surname.trim() : "Not found";
      fatherName = (fatherName && fatherName.trim() !== "") ? fatherName.trim() : "Not found";

      let finalFullName = "Not found";
      if (givenName !== "Not found" && surname !== "Not found") {
        finalFullName = `${givenName} ${surname}`;
      } else if (givenName !== "Not found") {
        finalFullName = givenName;
      } else if (surname !== "Not found") {
        finalFullName = surname; // Fallback to surname if only surname is found for fullName
      }

      const nameDetails = {
        fullName: finalFullName,
        fatherName: fatherName
      };
      
      const dateOfBirth = findValueByKey(formFields, ["date of birth", "dob", "birth date"]) || extractDateOfBirth(processedText);
      
      // Initial extraction of idNumber
      let idNumberValue = findValueByKey(formFields, ["id number", "document number", "card number", "id"]) || extractIdNumberFromText(processedText);

      // Safeguard against "surname" or "name" being picked as idNumber
      if (idNumberValue && typeof idNumberValue === 'string') {
        const idLower = idNumberValue.toLowerCase();
        if (idLower === "surname" || idLower === "name") {
          const idFromTextAttempt = extractIdNumberFromText(processedText); // Re-attempt with improved extractIdNumberFromText
          if (idFromTextAttempt && idFromTextAttempt.toLowerCase() !== "surname" && idFromTextAttempt.toLowerCase() !== "name" && idFromTextAttempt !== "Not found") {
            idNumberValue = idFromTextAttempt;
          } else {
            idNumberValue = "Not found"; // Default to "Not found" if still problematic
          }
        }
      }
      idNumberValue = (idNumberValue && idNumberValue.trim() !== "") ? idNumberValue.trim() : "Not found";

      const expiry = findValueByKey(formFields, ["expiry date", "expiration date", "valid until"]) || extractExpiryFromText(processedText);
      const placeOfBirth = findValueByKey(formFields, ["place of birth", "birth place"]) || extractPlaceOfBirth(processedText);
      const nationality = findValueByKey(formFields, [
        "nationality", "citizenship", 
        // Cyrillic common keys for formFields (Textract might identify these)
        "гражданство", "народност", "националност"
      ]) || extractNationality(processedText);
      const gender = findValueByKey(formFields, ["gender", "sex"]) || extractGender(processedText);
      const issueDate = findValueByKey(formFields, ["date of issue", "issue date", "issued on"]) || extractIssueDate(processedText);
      const personalNumber = findValueByKey(formFields, ["personal no", "personal number", "p.no", "egn", "jmbg", "personal id", "pin", "id code", "personal code"]) || extractPersonalNumber(processedText);
      
      const idDetails = {
        fullName: nameDetails.fullName,
        fatherName: nameDetails.fatherName,
        idNumber: idNumberValue,
        expiry,
        dateOfBirth,
        placeOfBirth,
        nationality,
        gender,
        issueDate,
        personalNumber
      };
      
      // Log the complete extracted details
      console.log("Full ID extraction results:", JSON.stringify(idDetails, null, 2));
      
      return new Response(
        JSON.stringify(idDetails),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } else {
      console.error("Textract Processing Error: No text blocks found");
      return new Response(
        JSON.stringify({ 
          error: "No text detected in image", 
          fullName: "Not found", 
          fatherName: "Not found",
          idNumber: "Not found", // Ensure this is consistent
          expiry: "Not found",
          dateOfBirth: "Not found",
          placeOfBirth: "Not found",
          nationality: "Not found",
          gender: "Not found",
          issueDate: "Not found",
          personalNumber: "Not found" // Added personalNumber
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Processing error", 
        fullName: "Not found", 
        fatherName: "Not found",
        idNumber: "Not found", // Ensure this is consistent
        expiry: "Not found",
        dateOfBirth: "Not found",
        placeOfBirth: "Not found",
        nationality: "Not found",
        gender: "Not found",
        issueDate: "Not found",
        personalNumber: "Not found" // Added personalNumber
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Extract text from Textract blocks
function extractTextFromBlocks(blocks) {
  let fullText = '';
  const lineBlocks = blocks.filter(block => block.BlockType === 'LINE');
  
  lineBlocks.forEach(block => {
    fullText += block.Text + '\n';
  });
  
  return fullText;
}

// Extract form fields from Textract response
function extractFormFields(blocks) {
  const keyMap = new Map();
  const valueMap = new Map();
  const keyValueMap = new Map();

  // First pass: collect all the blocks
  blocks.forEach(block => {
    if (block.BlockType === 'KEY_VALUE_SET') {
      if (block.EntityTypes.includes('KEY')) {
        keyMap.set(block.Id, block);
      } else {
        valueMap.set(block.Id, block);
      }
    }
  });

  // Second pass: link keys to values
  blocks.forEach(block => {
    if (block.BlockType === 'KEY_VALUE_SET' && block.EntityTypes.includes('KEY')) {
      const key = getTextFromRelationships(blocks, block, 'CHILD');
      
      // Find the value block that this key links to
      if (block.Relationships) {
        block.Relationships.forEach(relationship => {
          if (relationship.Type === 'VALUE') {
            relationship.Ids.forEach(valueId => {
              const valueBlock = valueMap.get(valueId);
              if (valueBlock) {
                const value = getTextFromRelationships(blocks, valueBlock, 'CHILD');
                if (key && value) {
                  keyValueMap.set(key.toLowerCase(), value);
                }
              }
            });
          }
        });
      }
    }
  });

  return Object.fromEntries(keyValueMap);
}

// Get text from relationships
function getTextFromRelationships(blocks, block, relType) {
  if (!block.Relationships) {
    return null;
  }
  
  let text = '';
  
  block.Relationships.forEach(relationship => {
    if (relationship.Type === relType) {
      relationship.Ids.forEach(id => {
        const childBlock = blocks.find(b => b.Id === id);
        if (childBlock && childBlock.Text) {
          text += childBlock.Text + ' ';
        }
      });
    }
  });
  
  return text.trim();
}

// Find a value by multiple possible keys
function findValueByKey(formFields, possibleKeys) {
  for (const key of possibleKeys) {
    const value = formFields[key.toLowerCase()];
    if (value) {
      return value;
    }
  }
  return null;
}

// Helper function to extract the "Name" and "Father's name" from OCR text based on label matching
function extractNameFromText(text) {
  // Split the OCR text into an array of non-empty trimmed lines
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  
  // Initialize our result with default values
  const data = {
    givenName: "Not found", // "name" part of "name + surname"
    surname: "Not found",
    fatherName: "Not found"
  };

  // --- Label-based extraction (value on the next line) ---
  for (let i = 0; i < lines.length; i++) {
    const lowerLine = lines[i].toLowerCase();
    if ((lowerLine === "name" || lowerLine === "given name" || lowerLine === "first name") && i + 1 < lines.length && data.givenName === "Not found") {
      data.givenName = lines[i + 1];
    }
    if ((lowerLine === "surname" || lowerLine === "last name" || lowerLine === "family name") && i + 1 < lines.length && data.surname === "Not found") {
      data.surname = lines[i + 1];
    }
    if (lowerLine === "father's name" && i + 1 < lines.length && data.fatherName === "Not found") {
      data.fatherName = lines[i + 1];
    }
  }

  // --- Pattern-based extraction (label and value on the same line) ---
  let match;

  // Specific given name patterns
  const givenNamePatternSpecific = /(?:given name|first name)[\s:]+(.+)/i;
  match = text.match(givenNamePatternSpecific);
  if (data.givenName === "Not found" && match && match[1]) {
    data.givenName = match[1].trim();
  }

  // Surname patterns
  const surnamePattern = /(?:surname|last name|family name)[\s:]+(.+)/i;
  match = text.match(surnamePattern);
  if (data.surname === "Not found" && match && match[1]) {
    data.surname = match[1].trim();
  }
  
  // Generic "Name: Value" pattern for givenName, if still not found
  // This tries to be smart if a surname is also found
  if (data.givenName === "Not found") {
    const namePatternGeneric = /^\s*name\s*[:\s]+\s*(.+)/im;
    match = text.match(namePatternGeneric);
    if (match && match[1]) {
      let potentialGivenName = match[1].trim();
      // If this generic name potentially includes a surname that we've also separately found.
      // e.g., Text is "Name: John Doe" and "Surname: Doe". We want givenName = "John".
      if (data.surname !== "Not found" && data.surname !== "") {
        const pgLower = potentialGivenName.toLowerCase();
        const sLower = data.surname.toLowerCase();
        if (pgLower.endsWith(sLower) && pgLower.length > sLower.length) {
          // Check for a space separating the potential given name from the surname part
          if (pgLower.charAt(pgLower.length - sLower.length - 1) === ' ') {
            potentialGivenName = potentialGivenName.substring(0, pgLower.length - sLower.length - 1).trim();
          }
        }
      }
      data.givenName = potentialGivenName;
    }
  }

  // Father's name pattern
  const fatherNamePattern = /father's name[\s:]+(.+)/i;
  match = text.match(fatherNamePattern);
  if (data.fatherName === "Not found" && match && match[1]) {
    data.fatherName = match[1].trim();
  }
  
  // Ensure "Not found" if values are empty strings
  data.givenName = data.givenName && data.givenName.trim() !== "" ? data.givenName.trim() : "Not found";
  data.surname = data.surname && data.surname.trim() !== "" ? data.surname.trim() : "Not found";
  data.fatherName = data.fatherName && data.fatherName.trim() !== "" ? data.fatherName.trim() : "Not found";
  
  return data;
}

function extractIdNumberFromText(text) {
  // Look for document number patterns
  const docPatterns = [
    /doc(?:ument)?\s*(?:no|number|#)?[:\s]*([A-Z0-9\-\/]+)/i,
    /card\s*(?:no|number|#)?[:\s]*([A-Z0-9\-\/]+)/i,
    /no[:\s]*([A-Z0-9\-\/]{6,})/i, // Ensure "no" is followed by a typical ID-like string
    /id[:\s]*([A-Z0-9\-\/]{6,})/i  // Ensure "id" is followed by a typical ID-like string
  ];
  
  for (const pattern of docPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      // Additional check to prevent matching common words like "SURNAME" if captured
      if (!/^(?:SURNAME|NAME)$/i.test(match[1].trim())) {
      return match[1].trim();
      }
    }
  }
  
  // Alternative: look for sequences of digits and letters that could be document numbers
  const numberPattern = /\b[A-Z0-9\-\/]{6,}\b/g; // At least 6 characters long
  const matches = text.match(numberPattern);
  if (matches) {
    // Filter out dates and other common number patterns, and specific excluded words
    const purelyAlphaExclusions = /^(?:SURNAME|NAME)$/i; // Words to exclude if purely alphabetical

    const validMatches = matches.filter(match => {
      if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(match)) return false; // filter out dates DD/MM/YYYY etc.
      
      // If the match is purely alphabetical (case-insensitive), check against exclusions.
      // Allows hyphens within the string but the test is on the word itself.
      if (/^[A-Z]+$/i.test(match) && purelyAlphaExclusions.test(match)) {
        return false;
      }
      // Example: "123456" is fine. "ABCDEF" is fine unless it's "SURNAME" or "NAME". "ABC-DEF" is fine. "123-456" is fine.
      return true; 
    });

    if (validMatches.length > 0) {
      // Prefer matches with digits, or mixed alpha-numeric, or longer ones.
      // Simple sort: prioritize those with digits, then by length.
      validMatches.sort((a, b) => {
        const aHasDigit = /\d/.test(a);
        const bHasDigit = /\d/.test(b);
        if (aHasDigit && !bHasDigit) return -1;
        if (!aHasDigit && bHasDigit) return 1;
        return b.length - a.length; // Longer one first if digit presence is same
      });
      return validMatches[0];
    }
  }
  
  return "Not found";
}

function extractExpiryFromText(text) {
  // Look for expiry date patterns
  const expiryRegex = /(?:expiry|expiration|exp|valid until|valid to|expires?(?:\son)?)[:\s]*([\d\/\.\-]+)/i;
  const match = text.match(expiryRegex);
  if (match && match[1]) {
    return match[1].trim();
  }
  
  // Alternative: look for date patterns
  const datePatterns = text.match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/g);
  if (datePatterns && datePatterns.length > 0) {
    // Usually the last date on an ID is the expiry
    return datePatterns[datePatterns.length - 1];
  }
  
  return "Not found";
}

// New extraction functions
function extractDateOfBirth(text) {
  // Common formats and labels for date of birth
  const dobPatterns = [
    /(?:date of birth|birth date|born|dob|d\.o\.b\.)[:\s]*([\d\/\.\-]+)/i,
    /(?:date of birth|birth date|born|dob|d\.o\.b\.)[\s\n]+([\d\/\.\-]+)/i
  ];
  
  for (const pattern of dobPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  // Look for date patterns after "birth" word
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes('birth') && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const dateMatch = nextLine.match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/);
      if (dateMatch) {
        return dateMatch[0];
      }
    }
  }
  
  // If we have multiple dates and already found expiry, the first different date might be DOB
  const expiryDate = extractExpiryFromText(text);
  const datePatterns = text.match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/g);
  if (datePatterns && datePatterns.length > 1) {
    // Find first date that's not the expiry date
    for (const date of datePatterns) {
      if (date !== expiryDate) {
        return date;
      }
    }
  }
  
  return "Not found";
}

function extractPlaceOfBirth(text) {
  // Look for place of birth patterns
  const pobPatterns = [
    /(?:place of birth|birth place|pob)[:\s]*([A-Za-z\s]+)/i,
    /(?:place of birth|birth place|pob)[\s\n]+([A-Za-z\s]+)/i
  ];
  
  for (const pattern of pobPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  // Look for "birth" followed by a place name
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes('birth') && !lines[i].match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/)) {
      // Extract everything after "birth" if it doesn't contain a date
      const birthPlace = lines[i].replace(/.*(?:birth|pob)[:\s]*/i, '').trim();
      if (birthPlace && !/^\d+$/.test(birthPlace)) {
        return birthPlace;
      }
      
      // Or check the next line if current line just contains the label
      if (i + 1 < lines.length && lines[i+1].trim() && !/^\d+$/.test(lines[i+1])) {
        return lines[i+1].trim();
      }
    }
  }
  
  return "Not found";
}

function extractNationality(text) {
  // Pattern 1: Label and value on the same line.
  // Handles Latin/Cyrillic labels and values (3-letter code or longer name).
  const sameLinePattern = new RegExp(
    "(?:nationality|citizen(?:ship)?|гражданство|народност|националност)" + // Latin & Cyrillic Labels
    "[\\s:]*" + // Separator
    "([A-Z]{3}|[A-Za-z\\s\\u0400-\\u04FF]{4,})", // Value: 3-letter UPPERCASE, or 4+ chars (Latin/Cyrillic/space)
    "i" // Case-insensitive for labels
  );
  let match = text.match(sameLinePattern);
  if (match && match[1]) {
    return match[1].trim();
  }

  // Pattern 2: Label on one line, value on the next.
  const lines = text.split('\\n').map(line => line.trim()).filter(Boolean);
  const labelsForNextLine = [
    "nationality", "citizenship",
    "гражданство", "народност", "националност" // Lowercase Cyrillic labels for matching
  ];

  for (let i = 0; i < lines.length - 1; i++) {
    const currentLineLower = lines[i].toLowerCase(); // Convert current line to lowercase for broad label matching
    if (labelsForNextLine.some(label => currentLineLower.includes(label))) {
      const potentialValue = lines[i + 1].trim();
      // Validate potentialValue: is it a 3-letter uppercase code or a plausible nationality string (Latin/Cyrillic)?
      if (/^[A-Z]{3}$/.test(potentialValue) || /^[A-Za-z\s\u0400-\u04FF]{4,}$/i.test(potentialValue)) {
        if (potentialValue.length <= 50) { // Avoid overly long, likely incorrect matches
          return potentialValue;
        }
      }
    }
  }
  
  // Pattern 3: Specific fallback for "BGR" if a general nationality keyword is present.
  const hasNationalityKeyword = /(?:nationality|citizen|гражданство|народност|националност)/i.test(text);
  if (hasNationalityKeyword) {
    const bgrMatch = text.match(/\b(BGR)\b/); // Look for uppercase BGR specifically
    if (bgrMatch && bgrMatch[1]) {
      return bgrMatch[1]; // Returns "BGR"
    }
  }

  return "Not found";
}

function extractGender(text) {
  // Look for gender/sex patterns
  const genderPatterns = [
    /(?:gender|sex)[:\s]*([MF]|Male|Female|Other)/i,
    /(?:gender|sex)[\s\n]+([MF]|Male|Female|Other)/i
  ];
  
  for (const pattern of genderPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  // Look for just M or F preceded or followed by a delimiter
  const simpleGenderMatch = text.match(/[^A-Za-z]([MF])[^A-Za-z]/i);
  if (simpleGenderMatch && simpleGenderMatch[1]) {
    return simpleGenderMatch[1].toUpperCase();
  }
  
  return "Not found";
}

function extractIssueDate(text) {
  // Fuzzy match for 'Date of issue' (allowing for common OCR errors)
  const fuzzyLabel = /date\s*of\s*i[sslv1]{2,4}ue/i; // matches 'issue', 'lssue', 'issve', etc.
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (fuzzyLabel.test(lines[i])) {
      // Try to extract date from the same line
      const dateMatch = lines[i].match(/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/);
      if (dateMatch) return dateMatch[0];
      // Or from the next line
      if (i + 1 < lines.length) {
        const nextLineDateMatch = lines[i + 1].match(/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/);
        if (nextLineDateMatch) return nextLineDateMatch[0];
      }
    }
  }
  // Look for issue date patterns (add more variants)
  const issueDatePatterns = [
    /(?:date of issue|issued on|issued|issue date|valid from|дата на издаване|izdato na|ausgestellt am|emisión|rilasciata il|uitgegeven op|emitida em|data de emissão|fecha de emisión|data rilascio|data wydania|дата выдачи|дата выпуска|дата издачи)[:\s]*([\d\/\.\-]+)/i,
    /(?:date of issue|issued on|issued|issue date|valid from|дата на издаване|izdato na|ausgestellt am|emisión|rilasciata il|uitgegeven op|emitida em|data de emissão|fecha de emisión|data rilascio|data wydania|дата выдачи|дата выпуска|дата издачи)[\s\n]+([\d\/\.\-]+)/i
  ];
  for (const pattern of issueDatePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) return match[1].trim();
  }
  // Check for dates near 'issue' word (but not 'expiry' related words)
  for (let i = 0; i < lines.length; i++) {
    const lowerLine = lines[i].toLowerCase();
    if ((lowerLine.includes('issue') || lowerLine.includes('izdato') || lowerLine.includes('ausgestellt') || lowerLine.includes('rilascio') || lowerLine.includes('wydania') || lowerLine.includes('выдач') || lowerLine.includes('издаване')) && !lowerLine.includes('expir') && !lowerLine.includes('authority')) {
      const dateMatch = lines[i].match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/);
      if (dateMatch) return dateMatch[0];
      if (i + 1 < lines.length) {
        const nextLineDateMatch = lines[i + 1].match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/);
        if (nextLineDateMatch) return nextLineDateMatch[0];
      }
    }
  }
  // Fallback: Try to find a date that's not DOB or Expiry
  const dobDate = extractDateOfBirth(text); 
  const expiryDate = extractExpiryFromText(text);
  const allDateMatches = text.match(/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/g);
  if (allDateMatches && allDateMatches.length > 0) {
    const uniqueDates = [...new Set(allDateMatches)];
    // Try to find a date between DOB and Expiry if possible
    if (dobDate !== 'Not found' && expiryDate !== 'Not found') {
      const dobTime = Date.parse(dobDate.replace(/\//g, '-'));
      const expiryTime = Date.parse(expiryDate.replace(/\//g, '-'));
      const candidates = uniqueDates.filter(d => {
        const t = Date.parse(d.replace(/\//g, '-'));
        return t > dobTime && t < expiryTime;
      });
      if (candidates.length > 0) return candidates[0];
    }
    // Otherwise, pick the first date that's not DOB or Expiry
    const potentialIssueDates = uniqueDates.filter(d => d !== dobDate && d !== expiryDate);
    if (potentialIssueDates.length > 0) return potentialIssueDates[0];
  }
  return "Not found";
}

function extractPersonalNumber(text) {
  const patterns = [
    // English and local language labels
    /(?:Personal\s*No\.?|P\.No\.?|Personal\s*Number|Personal\s*ID|PIN|ID\s*Code|Personal\s*Code|EGN|JMBG|CNP|C.I.P.|CNP|Cod Numeric Personal|Личен\s*номер|ЛН|ЕГН|Персонален\s*номер|Уникален\s*граждански\s*номер|личен номер|лична карта|личен идентификационен номер|личен идентификатор|личен код|личен идентификационен код|личен идентификационен номер)[\s:]*([A-Z0-9\-\/]{6,20})/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) return match[1].trim();
  }
  // Next line extraction logic
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const nextLineLabels = [
    "personal no", "p.no", "personal number", "personal id", "pin", "id code", "personal code",
    "egn", "jmbg", "cnp", "c.i.p.", "cod numeric personal",
    "личен номер", "лн", "егн", "персонален номер", "уникален граждански номер", "лична карта", "личен идентификационен номер", "личен идентификатор", "личен код", "личен идентификационен код"
  ];
  for (let i = 0; i < lines.length - 1; i++) {
    const lowerLine = lines[i].toLowerCase();
    if (nextLineLabels.some(label => lowerLine === label || (label.includes(" ") && lowerLine.includes(label)) )) {
      const potentialValue = lines[i + 1];
      // Basic validation: alphanumeric, typical length range, not a date
      if (/^[A-Z0-9\-\/]{6,20}$/.test(potentialValue) && !/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(potentialValue)) {
        return potentialValue.trim();
      }
    }
  }
  return "Not found";
}
