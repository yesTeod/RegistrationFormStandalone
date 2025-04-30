const AWS = require('aws-sdk');
const textract = new AWS.Textract();

/**
 * AWS Lambda function that processes ID documents using AWS Textract AnalyzeID
 * 
 * To be deployed as a Lambda function and exposed via API Gateway
 */
exports.handler = async (event) => {
  try {
    console.log('Received event:', JSON.stringify(event));
    
    // Parse the request body from API Gateway
    const body = JSON.parse(event.body || '{}');
    const { image } = body;
    
    if (!image) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Image data is required' })
      };
    }
    
    // Convert base64 to binary
    const imageBuffer = Buffer.from(image, 'base64');
    
    // Call AWS Textract AnalyzeID
    const params = {
      DocumentPages: [{
        Bytes: imageBuffer
      }]
    };
    
    console.log('Calling AWS Textract AnalyzeID...');
    const result = await textract.analyzeID(params).promise();
    
    // Process the results
    if (!result.IdentityDocuments || result.IdentityDocuments.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No identity document found in the image' })
      };
    }
    
    // Extract document fields
    const documentFields = result.IdentityDocuments[0].IdentityDocumentFields;
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // For CORS support
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST,OPTIONS'
      },
      body: JSON.stringify({ 
        message: 'ID document analyzed successfully',
        documentFields 
      })
    };
  } catch (error) {
    console.error('Error processing request:', error);
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: error.message || 'Error processing the ID document'
      })
    };
  }
};

/**
 * CloudFormation/SAM template for deploying this Lambda with API Gateway:
 * 
 * Resources:
 *   TextractAnalyzeIDFunction:
 *     Type: AWS::Serverless::Function
 *     Properties:
 *       Handler: index.handler
 *       Runtime: nodejs14.x
 *       Timeout: 30
 *       MemorySize: 512
 *       Policies:
 *         - AmazonTextractFullAccess
 *       Events:
 *         ApiEvent:
 *           Type: Api
 *           Properties:
 *             Path: /analyze-id
 *             Method: post
 *             RestApiId: !Ref ApiGateway
 * 
 *   ApiGateway:
 *     Type: AWS::Serverless::Api
 *     Properties:
 *       StageName: prod
 *       Auth:
 *         ApiKeyRequired: true
 */ 