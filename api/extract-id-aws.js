// Edge-compatible AWS Textract implementation using fetch
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
    const { image } = data;

    if (!image) {
      return new Response(
        JSON.stringify({ error: "Image data is required" }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Convert base64 image to binary
    let base64Data;
    if (image.startsWith('data:image/')) {
      // Handle Data URI format
      base64Data = image.split(',')[1];
    } else {
      // Already in base64 format
      base64Data = image;
    }

    // Call AWS API Gateway or Lambda function that wraps Textract AnalyzeID
    // This indirection is necessary since we can't use AWS SDK directly in Edge Runtime
    const response = await fetch(process.env.AWS_TEXTRACT_API_ENDPOINT || 'https://your-api-gateway-endpoint.execute-api.region.amazonaws.com/prod/analyze-id', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.AWS_API_KEY, // If using API Gateway with API key
      },
      body: JSON.stringify({
        image: base64Data,
        // Pass credentials if not using API Gateway authorizer
        // aws_access_key: process.env.AWS_ACCESS_KEY_ID,
        // aws_secret_key: process.env.AWS_SECRET_ACCESS_KEY,
        // aws_region: process.env.AWS_REGION || 'us-east-1'
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AWS Textract API failed: ${error}`);
    }

    const result = await response.json();
    console.log('AWS Textract Response:', JSON.stringify(result, null, 2));
    
    // Map AWS fields to our format
    const idDetails = result.documentFields ? 
      mapTextractFieldsToFormat(result.documentFields) : 
      {
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
    
    console.log('Mapped ID Details:', JSON.stringify(idDetails, null, 2));
    
    return new Response(
      JSON.stringify(idDetails),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
    
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

/**
 * Maps AWS Textract AnalyzeID fields to our application format
 */
function mapTextractFieldsToFormat(docFields) {
  // Initialize with default values
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
  
  // Process each field from AWS
  for (const field of docFields) {
    const type = field.Type?.Text;
    const value = field.ValueDetection?.Text || '';
    
    if (!type || !value) continue;
    
    // Map AWS field types to our fields
    switch (type.toLowerCase()) {
      case 'first name':
      case 'middle name':
      case 'last name':
      case 'name':
        // Combine name parts if we have a more specific breakdown
        if (type.toLowerCase() === 'name') {
          result.name = value;
        } else {
          if (result.name === "Not found") {
            result.name = value;
          } else {
            result.name += ' ' + value;
          }
        }
        break;
        
      case 'document number':
      case 'id number':
      case 'license number':
      case 'passport number':
        result.idNumber = value;
        break;
        
      case 'expiration date':
      case 'expiry date':
      case 'expiry':
        result.expiry = value;
        break;
        
      case 'date of birth':
      case 'birth date':
      case 'dob':
        result.dateOfBirth = value;
        break;
        
      case 'place of birth':
      case 'birth place':
        result.placeOfBirth = value;
        break;
        
      case 'nationality':
      case 'citizenship':
        result.nationality = value;
        break;
        
      case 'gender':
      case 'sex':
        result.gender = value;
        break;
        
      case 'address':
      case 'street address':
      case 'residence address':
        if (result.address === "Not found") {
          result.address = value;
        } else {
          // Combine address parts
          result.address += ', ' + value;
        }
        break;
        
      case 'issuing authority':
      case 'issuer':
      case 'issue authority':
        result.issuingAuthority = value;
        break;
        
      case 'issue date':
      case 'date of issue':
        result.issueDate = value;
        break;
        
      case 'father name':
      case 'father\'s name':
      case 'fathers name':
        result.fatherName = value;
        break;
        
      // Add additional field mappings as needed
      default:
        // Log unknown fields for debugging
        console.log(`Unmapped field: ${type} = ${value}`);
    }
  }
  
  return result;
} 