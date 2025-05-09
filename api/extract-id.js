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
        extractedText.replace(/[^\x00-\x7F]/g, ' ').replace(/\s+/g, ' ').trim() : 
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
        finalFullName = surname;
      }
      
      const nameDetails = {
        fullName: finalFullName,
        fatherName: fatherName
      };
      
      const dateOfBirth = findValueByKey(formFields, ["date of birth", "dob", "birth date"]) || extractDateOfBirth(processedText);
      const idNumber = findValueByKey(formFields, ["id number", "document number", "card number", "id"]) || extractIdNumberFromText(processedText);
      const expiry = findValueByKey(formFields, ["expiry date", "expiration date", "valid until"]) || extractExpiryFromText(processedText);
      const placeOfBirth = findValueByKey(formFields, ["place of birth", "birth place"]) || extractPlaceOfBirth(processedText);
      const nationality = findValueByKey(formFields, ["nationality", "citizenship"]) || extractNationality(processedText);
      const gender = findValueByKey(formFields, ["gender", "sex"]) || extractGender(processedText);
      const issueDate = findValueByKey(formFields, ["date of issue", "issue date", "issued on"]) || extractIssueDate(processedText);
      
      const idDetails = {
        fullName: nameDetails.fullName,
        fatherName: nameDetails.fatherName,
        idNumber,
        expiry,
        dateOfBirth,
        placeOfBirth,
        nationality,
        gender,
        issueDate
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
          idNumber: "Not found", 
          expiry: "Not found",
          dateOfBirth: "Not found",
          placeOfBirth: "Not found",
          nationality: "Not found",
          gender: "Not found",
          issueDate: "Not found"
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
        idNumber: "Not found", 
        expiry: "Not found",
        dateOfBirth: "Not found",
        placeOfBirth: "Not found",
        nationality: "Not found",
        gender: "Not found",
        issueDate: "Not found"
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
    /no[:\s]*([A-Z0-9\-\/]{6,})/i,
    /id[:\s]*([A-Z0-9\-\/]{6,})/i
  ];
  
  for (const pattern of docPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  // Alternative: look for sequences of digits and letters that could be document numbers
  const numberPattern = /\b[A-Z0-9\-\/]{6,}\b/g;
  const matches = text.match(numberPattern);
  if (matches) {
    // Filter out dates and other common number patterns
    const validMatches = matches.filter(match => 
      !/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(match) && // not a date
      !/^\d+$/.test(match) // not just a sequence of numbers
    );
    if (validMatches.length > 0) {
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
  // Look for nationality patterns
  const nationalityPatterns = [
    /(?:nationality|citizen(?:ship)?)[:\s]*([A-Za-z\s]+)/i,
    /(?:nationality|citizen(?:ship)?)[\s\n]+([A-Za-z\s]+)/i
  ];
  
  for (const pattern of nationalityPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  // Check for nationality by line detection
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().match(/^(?:nationality|citizen)/i) && i + 1 < lines.length) {
      return lines[i + 1].trim();
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
  // Look for issue date patterns
  const issueDatePatterns = [
    /(?:date of issue|issued on|issued|issue date)[:\s]*([\d\/\.\-]+)/i,
    /(?:date of issue|issued on|issued|issue date)[\s\n]+([\d\/\.\-]+)/i
  ];
  
  for (const pattern of issueDatePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  // Check for dates near "issue" word
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes('issue') && !lines[i].toLowerCase().includes('expir')) {
      // Check current line for dates
      const dateMatch = lines[i].match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/);
      if (dateMatch) {
        return dateMatch[0];
      }
      
      // Check next line for dates
      if (i + 1 < lines.length) {
        const nextLineDateMatch = lines[i + 1].match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/);
        if (nextLineDateMatch) {
          return nextLineDateMatch[0];
        }
      }
    }
  }
  
  // If we have multiple dates and already found expiry and DOB,
  // another date might be the issue date
  const expiryDate = extractExpiryFromText(text);
  const dobDate = extractDateOfBirth(text);
  const datePatterns = text.match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/g);
  
  if (datePatterns && datePatterns.length > 2) {
    // Find a date that's not expiry or DOB
    for (const date of datePatterns) {
      if (date !== expiryDate && date !== dobDate) {
        return date;
      }
    }
  }
  
  return "Not found";
}
