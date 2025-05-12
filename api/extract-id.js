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
      let processedText = extractedText;
      if (englishOnly) {
        processedText = extractedText.replace(/[^
