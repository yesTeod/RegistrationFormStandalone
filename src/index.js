import React from 'react';
import ReactDOM from 'react-dom/client'; // Or 'react-dom' for older React versions
import './styles.css'; // Assuming you have global styles
import App from './App';
import { Amplify } from 'aws-amplify';

// --- Add Amplify Configuration Here --- 
Amplify.configure({
  Auth: {
    // MANDATORY - Cognito Identity Pool ID
    // Use Vercel Environment Variables (REACT_APP_ prefix for Create React App)
    identityPoolId: process.env.REACT_APP_IDENTITY_POOL_ID, 
    // MANDATORY - Amazon Cognito Region
    region: process.env.REACT_APP_AWS_REGION, 
  },
  // Add other categories if needed
});
// -------------------------------------

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
