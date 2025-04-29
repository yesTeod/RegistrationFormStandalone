// Example in src/index.js or src/App.js

import React from 'react';
import ReactDOM from 'react-dom/client'; // or import App from './App';
import App from './App.js'; // or your main app component
import { Amplify } from 'aws-amplify';
import '@aws-amplify/ui-react/styles.css';

// Define awsRegion ONCE, ideally from environment variables
const awsRegion = process.env.REACT_APP_AWS_REGION || "eu-central-1"; // Or eu-central-1? See point 2

// Configure Amplify *here*
Amplify.configure({
  Auth: {
    region: awsRegion,
    identityPoolId: 'eu-central-1:04cbf64c-4d6f-44e9-abe9-46466f2a0e39', // Make sure region matches ID Pool region! See point 2
  },
  // geo: { ... }, // Uncomment and configure if needed
  // Predictions: { ... }, // Uncomment and configure if needed
  aws_project_region: awsRegion // Should match Auth.region
});

// Render your app
// For index.js with React 18+
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

