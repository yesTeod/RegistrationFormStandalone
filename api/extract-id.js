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
      
      // Extract key-value pairs directly for ID fields
      const nameDetails = {
        name: findValueByKey(formFields, ["name", "given name", "first name"]) || extractNameFromText(processedText),
        fatherName: findValueByKey(formFields, ["father's name", "surname", "last name", "family name"]) || "Not found"
      };
      
      const dateOfBirth = findValueByKey(formFields, ["date of birth", "dob", "birth date"]) || extractDateOfBirth(processedText);
      const idNumber = findValueByKey(formFields, ["id number", "document number", "card number", "id"]) || extractIdNumberFromText(processedText);
      const expiry = findValueByKey(formFields, ["expiry date", "expiration date", "valid until"]) || extractExpiryFromText(processedText);
      const placeOfBirth = findValueByKey(formFields, ["place of birth", "birth place"]) || extractPlaceOfBirth(processedText);
      const nationality = findValueByKey(formFields, ["nationality", "citizenship"]) || extractNationality(processedText);
      const gender = findValueByKey(formFields, ["gender", "sex"]) || extractGender(processedText);
      const address = findValueByKey(formFields, ["address", "residence"]) || extractAddress(processedText);
      const issuingAuthority = findValueByKey(formFields, ["issuing authority", "issued by", "authority"]) || extractIssuingAuthority(processedText);
      const issueDate = findValueByKey(formFields, ["date of issue", "issue date", "issued on"]) || extractIssueDate(processedText);
      
      const idDetails = {
        name: nameDetails.name,
        fatherName: nameDetails.fatherName,
        idNumber,
        expiry,
        dateOfBirth,
        placeOfBirth,
        nationality,
        gender,
        address,
        issuingAuthority,
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
    name: "Not found",
    fatherName: "Not found"
  };

  // --- First, check for English labels ---
  // The idea is to look for the line that exactly equals the label (case insensitive),
  // then treat the immediately following line as the field value.
  for (let i = 0; i < lines.length; i++) {
    const lowerLine = lines[i].toLowerCase();
    if (lowerLine === "name" && i + 1 < lines.length) {
      data.name = lines[i + 1];
    }
    if (lowerLine === "father's name" && i + 1 < lines.length) {
      data.fatherName = lines[i + 1];
    }
  }

  // --- If the English labels weren't found, try to use Bulgarian labels ---
  // For the given name, Bulgarian may use "Име" (or even OCR mis-read as "ViMe")
  // For the father's name, Bulgarian may have "Презиме"
  if (data.name === "Not found") {
    for (let i = 0; i < lines.length; i++) {
      const lowerLine = lines[i].toLowerCase();
      if ((lowerLine === "име" || lowerLine === "vime") && i + 1 < lines.length) {
        data.name = lines[i + 1];
      }
    }
  }
  
  if (data.fatherName === "Not found") {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase() === "презиме" && i + 1 < lines.length) {
        data.fatherName = lines[i + 1];
      }
    }
  }

  // Check for patterns like "Name: John Doe" on the same line
  const namePattern = /name[\s:]+(.*)/i;
  const nameMatch = text.match(namePattern);
  if (data.name === "Not found" && nameMatch && nameMatch[1]) {
    data.name = nameMatch[1].trim();
  }
  
  // Check for "surname" field
  const surnamePattern = /surname[\s:]+(.*)/i;
  const surnameMatch = text.match(surnamePattern);
  if (data.fatherName === "Not found" && surnameMatch && surnameMatch[1]) {
    data.fatherName = surnameMatch[1].trim();
  }
  
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

function extractAddress(text) {
  // Look for address patterns
  const addressPatterns = [
    /(?:address|residence)[:\s]*([^\n]+)/i,
    /(?:address|residence)[\s\n]+([^\n]+)/i
  ];
  
  for (const pattern of addressPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  // Check for address by line detection
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().match(/^(?:address|residence)/i) && i + 1 < lines.length) {
      // Address might span multiple lines
      let address = lines[i + 1].trim();
      // Check if next line might be part of address (no known label and not a date)
      if (i + 2 < lines.length && 
          !lines[i + 2].match(/^[A-Za-z]+[\s:]/i) && 
          !lines[i + 2].match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/)) {
        address += ", " + lines[i + 2].trim();
      }
      return address;
    }
  }
  
  return "Not found";
}

function extractIssuingAuthority(text) {
  // Look for issuing authority patterns
  const authorityPatterns = [
    /(?:issuing authority|issued by|authority|issuer)[:\s]*([^\n]+)/i,
    /(?:issuing authority|issued by|authority|issuer)[\s\n]+([^\n]+)/i
  ];
  
  for (const pattern of authorityPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  // Check by line detection
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().match(/(?:issuing|issued|authority)/i) && 
        !lines[i].match(/date/i) && 
        i + 1 < lines.length) {
      return lines[i + 1].trim();
    }
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
