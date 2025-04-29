import React, { useState, useRef, useEffect } from "react";
import { FaceLivenessDetector } from '@aws-amplify/ui-react';
import { Amplify } from 'aws-amplify';

// Configure Amplify if not done elsewhere (replace with your actual config)
// Ensure this runs once when your app initializes
// Amplify.configure({
//   Auth: {
//     identityPoolId: 'YOUR_IDENTITY_POOL_ID',
//     region: 'YOUR_REGION',
//   },
//   // other configurations
// });

export default function UserRegistrationForm() {
  const [step, setStep] = useState("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [photoFront, setPhotoFront] = useState(null);
  const [cameraAvailable, setCameraAvailable] = useState(true);
  const [cameraStatus, setCameraStatus] = useState("idle");
  const [isFlipping, setIsFlipping] = useState(false);
  const [mockMode, setMockMode] = useState(false);
  const [idDetails, setIdDetails] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [faceVerified, setFaceVerified] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [faceError, setFaceError] = useState(null);
  const [verificationAttempts, setVerificationAttempts] = useState(0);
  const [showRetryOptions, setShowRetryOptions] = useState(false);

  // --- State for Amplify Face Liveness ---
  const [livenessSessionId, setLivenessSessionId] = useState(null);
  const [livenessLoading, setLivenessLoading] = useState(false); // Loading session ID or results
  const [livenessStatus, setLivenessStatus] = useState('idle'); // idle, session_creating, ready, checking_results, complete, error

  // Refs for UI and ID capture
  const videoRef = useRef(null); // For ID capture video
  const canvasRef = useRef(null); // For ID capture canvas
  const containerRef = useRef(null);
  const streamRef = useRef(null); // For ID camera stream
  const fileInputRef = useRef(null); // For ID upload

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Handles ID upload
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const reader = new FileReader();
      reader.onload = (e) => {
        setPhotoFront(e.target.result);
        handleFlip("completed", "right"); // Go to confirmation after upload
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error processing image:", error);
      // Optionally set an error state
    } finally {
      setIsUploading(false);
    }
  };

  // Handles card flip animation
  const handleFlip = async (nextStep, direction = "right") => {
    if (isFlipping) return;
    setIsFlipping(true);
    const card = containerRef.current;
    if (card) {
      card.style.transition = "transform 0.6s ease";
      card.style.transform =
        direction === "left" ? "rotateY(-90deg)" : "rotateY(90deg)";
    }
    await delay(300); // Reduce delay slightly?
    setStep(nextStep);
    if (card) card.style.transform = "rotateY(0deg)";
    await delay(300);
    setIsFlipping(false);
  };

  // Starts the ID camera
  const startCamera = (facing = "environment", targetRef = videoRef) => {
    setCameraStatus("pending");
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { exact: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      .then((stream) => {
        streamRef.current = stream;
        if (targetRef.current) {
          targetRef.current.srcObject = stream;
          targetRef.current.play();
        }
        setCameraAvailable(true);
        setCameraStatus("active");
      })
      .catch(() => {
        setCameraAvailable(false);
        setCameraStatus("error");
        setMockMode(false);
      });
  };

  // Stops the current camera stream (used for ID camera)
  const stopCamera = () => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if(videoRef.current) videoRef.current.srcObject = null; // Clear video element source
      setCameraStatus("idle");
    }
  };

  // Moves from initial form to ID camera step
  const handleFormSubmit = () => {
    startCamera();
    handleFlip("camera", "right");
  };

  // Captures ID photo from video stream
  const capturePhoto = async () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 240;
      const context = canvas.getContext("2d");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = canvas.toDataURL("image/png");
      setPhotoFront(imageData);
      stopCamera(); // Stop ID camera after capture
      handleFlip("completed", "right"); // Go to confirmation
    }
  };

  // Retakes ID photo
  const retakePhoto = async () => {
    startCamera(); // Restart ID camera
    await delay(200);
    await handleFlip("camera", "left"); // Flip back to camera view
  };

  // Moves from ID confirmation to verification step (starts liveness check)
  const handleSubmit = async () => {
    stopCamera(); // Ensure ID camera is stopped
    await delay(300); 
    await handleFlip("verification", "right");
    await delay(200);

    // Reset states specific to the verification step
    setFaceVerified(null);
    setVerificationAttempts(0);
    setShowRetryOptions(false);
    setFaceError(null);
    setLivenessSessionId(null); 
    setLivenessStatus('idle'); // Set to idle initially
    setVerifying(false); 
    
    // Trigger session creation immediately upon entering the step
    createLivenessSession(); 
  };

  // --- Amplify Face Liveness Functions ---
  
  const createLivenessSession = async () => {
      setLivenessLoading(true);
      setLivenessStatus('session_creating');
      setFaceError(null);
      try {
          console.log("[Liveness] Requesting session...");
          const response = await fetch('/api/create-liveness-session', { method: 'POST' });
          const data = await response.json();

          if (!response.ok || !data.sessionId) {
              console.error("[Liveness] Failed to create session:", data);
              throw new Error(data.error || 'Failed to start liveness check.');
          }
          console.log(`[Liveness] Session created: ${data.sessionId}`);
          setLivenessSessionId(data.sessionId);
          setLivenessStatus('ready'); // Ready to render detector
      } catch (error) {
          console.error("[Liveness] Error creating session:", error);
          setFaceError(`Error starting liveness check: ${error.message}`);
          setLivenessStatus('error');
          setShowRetryOptions(true); // Allow retry via button
      } finally {
          setLivenessLoading(false);
      }
  };

  // Called by FaceLivenessDetector when it completes its flow
  const handleAnalysisComplete = async () => {
    console.log("[Liveness] Analysis complete on frontend. Fetching results...");
    setLivenessStatus('checking_results');
    setFaceError(null);
    setLivenessLoading(true); // Show loading indicator while fetching/verifying

    try {
      // Fetch results from your backend
      const res = await fetch(`/api/get-liveness-results?sessionId=${livenessSessionId}`, { method: 'GET' });
      const results = await res.json();

      if (!res.ok) {
        console.error("[Liveness] Error fetching results:", results);
        throw new Error(results.error || 'Could not get liveness results.');
      }

      console.log("[Liveness] Results received:", results);

      // Check the status and confidence
      const LIVENESS_CONFIDENCE_THRESHOLD = 80; // Adjust as needed
      if (results.status === 'SUCCEEDED' && results.confidence >= LIVENESS_CONFIDENCE_THRESHOLD) {
        console.log("[Liveness] Check SUCCEEDED. Proceeding to face match.");
        if (!results.referenceImageBase64) {
           throw new Error("Liveness succeeded but no reference image was returned.");
        }
         // Construct the data URL format (verify-face expects this)
         const referenceSelfieDataUrl = `data:image/jpeg;base64,${results.referenceImageBase64}`;
         // Now call the final verification step
         await verifyLivenessMatch(referenceSelfieDataUrl); 
      } else {
        // Liveness check itself failed or confidence too low
        console.warn(`[Liveness] Check FAILED. Status: ${results.status}, Confidence: ${results.confidence}`);
        setFaceVerified(false);
        setFaceError(`Liveness check failed. Status: ${results.status}${results.confidence ? ", Confidence: " + results.confidence.toFixed(2) : ""}. Please try again.`);
        setVerificationAttempts(prev => prev + 1);
        setShowRetryOptions(true);
        setLivenessStatus('error');
      }
    } catch (error) {
      console.error("[Liveness] Error processing analysis results:", error);
      setFaceError(`Error verifying liveness: ${error.message}`);
      setFaceVerified(false); // Mark as failed on error
      setVerificationAttempts(prev => prev + 1);
      setShowRetryOptions(true);
      setLivenessStatus('error');
    } finally {
       setLivenessLoading(false); // Stop loading indicator after fetching/verifying
       // Verifying state for final match is handled in verifyLivenessMatch
    }
  };

  // Final verification step: Compare ID photo with liveness reference selfie
  const verifyLivenessMatch = async (livenessSelfieDataUrl) => {
      console.log("[Liveness] Verifying ID photo against liveness selfie...");
      setVerifying(true); // Indicate final verification call is in progress
      setFaceError(null);

      try {
          const resp = await fetch('/api/verify-face', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  idImage: photoFront, // The ID photo captured earlier
                  selfie: livenessSelfieDataUrl // Selfie from successful liveness check
              }),
          });

          let errorMessage = 'Verification failed. Please try again.';
          let responseData = null;

          try {
              responseData = await resp.json();
          } catch (jsonError) {
              console.error("Failed to parse final verification response:", jsonError);
              // Keep default error if JSON parsing fails
          }

          if (!resp.ok) {
              console.error("Final face verification API error:", resp.status, responseData);
              errorMessage = responseData?.error || `Face match failed (Status: ${resp.status})`;
              setFaceVerified(false);
              setVerificationAttempts(prev => prev + 1);
              setShowRetryOptions(true);
              setLivenessStatus('error'); 
              setFaceError(errorMessage); 
              return; // Stop execution
          }

          // API call OK, check match result
          setFaceVerified(responseData.match);
          console.log("Final Verification (Match) result:", responseData.match);

          if (!responseData.match) {
              errorMessage = "Face could not be matched to the ID after liveness check.";
              setVerificationAttempts(prev => prev + 1);
              setShowRetryOptions(true);
              setLivenessStatus('error'); 
              setFaceError(errorMessage); 
          } else {
              // SUCCESS! Both liveness and match passed.
              setLivenessStatus('complete'); 
              setFaceError(null); 
              // faceVerified is already true
          }
      } catch (err) {
          // Network or other unexpected errors during final verification fetch
          console.error("Final face verification fetch error:", err);
          setFaceVerified(false);
          setVerificationAttempts(prev => prev + 1);
          setShowRetryOptions(true);
          setLivenessStatus('error'); 
          setFaceError('Network error during final face verification.'); 
      } finally {
          setVerifying(false); // Reset verifying state for the final match step
      }
  };

  // Handles errors reported by the FaceLivenessDetector component itself
   const handleLivenessError = (error) => {
     console.error("[Liveness] Component Error:", error);
     // error object structure might vary, inspect it
     const message = error?.error?.message || error?.message || 'An unexpected error occurred during the liveness check.';
     setFaceError(`Liveness check encountered an error: ${message}`);
     // Mark as failed and allow retry
     setFaceVerified(false); 
     setVerificationAttempts(prev => prev + 1);
     setShowRetryOptions(true);
     setLivenessStatus('error');
     setLivenessLoading(false); // Ensure loading stops
     setVerifying(false); // Ensure verifying stops
   };

  // Retry the whole verification step (create new session)
   const handleRetryVerification = () => {
     console.log("[Liveness] Retrying verification...");
     setFaceVerified(null);
     setShowRetryOptions(false);
     // Keep counting attempts
     setFaceError(null); 
     setVerifying(false);
     setLivenessLoading(false);
     setLivenessSessionId(null); // Reset session ID
     // Reset status and trigger session creation again
     setLivenessStatus('idle'); // Go back to idle before creating session
     createLivenessSession(); 
   };

  // Go to success page/dashboard
   const handleVerificationComplete = () => {
     if (faceVerified) {
       handleFlip("success", "right");
     } else {
       console.warn("handleVerificationComplete called but faceVerified is not true.");
       // Optionally flip back or show error, though button should be disabled
     }
   };

   // --- OCR Extraction Logic (Unchanged) ---
   function compressImageForOCR(dataURL, quality = 0.9) {
     return new Promise((resolve) => {
        const img = new Image();
        img.src = dataURL;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const compressedDataURL = canvas.toDataURL('image/jpeg', quality);
          const fileSizeKb = Math.round((compressedDataURL.length * (3 / 4)) / 1024);
          if (fileSizeKb > 1024 && quality > 0.1) {
            compressImageForOCR(dataURL, quality - 0.1).then(resolve);
          } else {
            resolve(compressedDataURL);
          }
        };
        img.onerror = () => resolve(dataURL); // Handle image load errors
      });
   }
 
   async function extractIdDetails(imageData) {
     try {
        setIsExtracting(true);
        const fileSizeKb = Math.round((imageData.length * (3 / 4)) / 1024);
        let processedImage = imageData;
        if (fileSizeKb > 1024) {
          processedImage = await compressImageForOCR(imageData);
        }
  
        const response = await fetch("/api/extract-id", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: processedImage }),
        });
        if (!response.ok) {
          throw new Error("OCR request failed");
        }
        const data = await response.json();
        if (data.error) {
          console.warn("API returned an error:", data.error);
        }
        return data;
      } catch (error) {
        console.error("Error extracting ID details:", error);
        return {
          name: "Not found",
          idNumber: "Not found",
          expiry: "Not found",
        };
      } finally {
        setIsExtracting(false);
      }
   }
 
   // Trigger OCR extraction when ID photo is ready
   useEffect(() => {
     if (step === "completed" && photoFront && !idDetails && !isExtracting) {
       extractIdDetails(photoFront).then((details) => {
         console.log("Extracted ID Details:", details);
         if (details) {
           setIdDetails(details);
         }
       });
     }
   }, [step, photoFront, idDetails, isExtracting]);
 
   // Card tilt effect (Unchanged)
   useEffect(() => {
     // ... (implementation unchanged)
     const card = containerRef.current;
      const handleMouseMove = (e) => {
        if (isFlipping || !card) return;
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = ((y - centerY) / centerY) * -10;
        const rotateY = ((x - centerX) / centerX) * 10;
        card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
      };
      const resetRotation = () => {
        if (isFlipping || !card) return;
        card.style.transform = "rotateX(0deg) rotateY(0deg)";
      };
      card?.addEventListener("mousemove", handleMouseMove);
      card?.addEventListener("mouseleave", resetRotation);
      return () => {
        card?.removeEventListener("mousemove", handleMouseMove);
        card?.removeEventListener("mouseleave", resetRotation);
      };
   }, [isFlipping]);
 
   // Clean up camera on unmount
   useEffect(() => {
     return () => {
       stopCamera();
     };
   }, []);

   // --- Render Verification Step Content --- 
   const renderVerificationStepContent = () => {
 
     // 1. Loading State (Creating Session or Checking Results)
     if (livenessLoading) {
       return (
          <div className="text-center space-y-4 p-5 min-h-[400px] flex flex-col justify-center items-center">
            <h2 className="text-xl font-semibold">
               {livenessStatus === 'session_creating' ? 'Initializing Liveness Check...' : 'Processing...'}
            </h2>
            <div className="mt-4 w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
            <p className="text-sm text-gray-500 mt-2">
               {livenessStatus === 'checking_results' ? 'Verifying results...' : 'Please wait.'}
            </p>
          </div>
       );
     }
 
     // 2. Error State (Session creation failed or other critical error before component mount)
     // Render this only if loading is false and status is error
     if (livenessStatus === 'error' && !livenessLoading) {
        return (
          <div className="bg-red-50 p-4 rounded-lg border border-red-200 shadow w-full min-h-[400px] flex flex-col justify-center items-center">
             <div className="flex items-center justify-center mb-2">
                <svg className="w-7 h-7 text-red-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <p className="text-red-700 font-medium text-lg">
                   Verification Failed
                </p>
             </div>
             <p className="text-red-600 text-sm mb-3 px-2 text-center">
                {faceError || "An error occurred during the verification process. Please try again."} 
             </p>
             
             {/* Show Retry Options */} 
             {showRetryOptions && (
                <div className="space-y-3 mt-3 border-t border-red-100 pt-3 w-full max-w-xs">
                   {/* ... (Retry options content remains the same) ... */}
                   <p className="text-gray-700 text-sm font-medium">Troubleshooting Tips:</p>
                        <ul className="text-xs text-left list-disc pl-6 text-gray-600 space-y-1">
                           <li>Ensure your face is clearly visible and well-lit.</li>
                           <li>Follow the on-screen instructions carefully.</li>
                           <li>Remove hats, sunglasses, or face coverings.</li>
                           <li>Hold your phone steady during the check.</li>
                           <li>Ensure your ID photo is clear.</li>
                        </ul>
                        <div className="flex flex-col items-center space-y-2 pt-2">
                           <button
                              onClick={handleRetryVerification} 
                              className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg shadow transition-colors"
                           >
                              Try Verification Again
                           </button>
                           {verificationAttempts >= 1 && (
                              <button
                                 onClick={() => handleFlip("completed", "left")}
                                 className="w-full px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg shadow text-sm"
                              >
                                 Check/Retake ID Photo
                              </button>
                           )}
                           {verificationAttempts >= 2 && (
                              <button
                                 onClick={() => window.location.href = "/contact-support"} 
                                 className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg shadow text-sm"
                              >
                                 Contact Support
                              </button>
                           )}
                        </div>
                </div>
             )}
          </div>
        );
     }
 
     // 3. Ready to Render FaceLivenessDetector or show final success
     return (
       <div className="text-center space-y-4">
         <h2 className="text-xl font-semibold">
            Identity Verification
         </h2>
         <p className="text-sm text-gray-600 -mt-2">Liveness Check</p>
 
         <div className="min-h-[450px] flex flex-col items-center justify-center relative"> 
            {/* Render Detector if session is ready and verification not finished */} 
            {livenessStatus === 'ready' && livenessSessionId && faceVerified === null && (
                <FaceLivenessDetector
                  sessionId={livenessSessionId}
                  region={process.env.NEXT_PUBLIC_AWS_REGION || "us-east-1"} // Pass region correctly
                  onAnalysisComplete={handleAnalysisComplete}
                  onError={handleLivenessError}
                  // Optional: Disable header provided by the component if you have your own
                  components={{
                     Header: () => <div className="my-4 text-base text-gray-700">Follow instructions to position your face.</div>,
                     // You can customize other parts too: Footer, Instructions, etc.
                  }}
                  // Optional: Apply custom styles via className or style prop
                  className="w-full max-w-sm"
                />
            )}
 
             {/* Verification Success UI (Render only when faceVerified is true) */} 
             {faceVerified === true && (
                 <div className="bg-green-100 p-4 rounded-lg border border-green-300 shadow w-full max-w-sm">
                   <div className="flex items-center justify-center mb-2">
                      <svg className="w-8 h-8 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      <p className="text-green-700 font-medium text-lg">Identity Verified Successfully!</p>
                   </div>
                   <p className="text-green-600 text-sm mb-3">Your face matched the provided ID document after liveness check.</p>
                   <button
                      onClick={handleVerificationComplete}
                      className="mt-1 px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow transition-colors"
                   >
                      Continue
                   </button>
                 </div>
             )}
 
             {/* Note: Failure/Error state is handled by the condition above (livenessStatus === 'error' && !livenessLoading) */} 
             {/* No need to render failure message here again if already handled */} 
  
          </div> { /* End min-h div */}
       </div>
     );
   };
   
  // --- Main Return with Step Logic --- 
   return (
     <div
       ref={containerRef}
       className="p-6 max-w-md mx-auto bg-gradient-to-br from-gray-100 to-gray-300 rounded-3xl shadow-xl transition-transform duration-300 relative border border-gray-300 will-change-transform"
     >
        <style>{`
          button { border-radius: 10px !important; }
          /* Optional: Style overrides for FaceLivenessDetector if needed */
        `}</style>
       {step === "form" && (
         <div className="space-y-4">
           <h2 className="text-2xl font-semibold text-gray-800">Register</h2>
           <input
             type="email"
             value={email}
             onChange={(e) => setEmail(e.target.value)}
             placeholder="Email"
             className="w-full p-2 border border-gray-300 rounded-lg"
           />
           <input
             type="password"
             value={password}
             onChange={(e) => setPassword(e.target.value)}
             placeholder="Password"
             className="w-full p-2 border border-gray-300 rounded-lg"
           />
           <div className="flex justify-center">
             <button
               onClick={handleFormSubmit}
               className="bg-yellow-400 hover:bg-yellow-300 text-black px-6 py-2 rounded-full shadow-md"
             >
               Continue
             </button>
           </div>
         </div>
       )}
 
       {step === "camera" && (
         <div className="text-center space-y-4">
           <h2 className="text-lg font-medium text-gray-700">
             Capture ID Front
           </h2>
           <div className="w-full h-60 bg-gray-300 flex items-center justify-center rounded overflow-hidden relative">
              {/* ID Camera View */} 
              <video
                 ref={videoRef}
                 autoPlay
                 playsInline
                 muted
                 className="w-full h-full object-cover rounded"
              />
              {/* Add overlay guide for ID capture? */} 
              {/* <div className="absolute inset-0 border-4 border-dashed border-white opacity-50 rounded-lg pointer-events-none"></div> */} 
           </div>
           {cameraStatus === 'error' && <p className="text-xs text-red-500 mt-1">Camera not available. You can upload instead.</p>}
           <div className="flex flex-col md:flex-row justify-center gap-3 mt-4">
             <button
               onClick={capturePhoto}
               disabled={cameraStatus !== 'active'}
               className={`px-4 py-2 rounded-full shadow-md ${cameraStatus === 'active' ? 'bg-yellow-400 hover:bg-yellow-300 text-black' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
             >
               Capture Front
             </button>
 
             {/* Hidden input for upload fallback */}
             <input 
               type="file"
               accept="image/*"
               ref={fileInputRef}
               onChange={handleFileUpload}
               className="hidden"
             />
             <button
               onClick={() => fileInputRef.current.click()}
               disabled={isUploading}
               className="bg-blue-500 hover:bg-blue-400 text-white px-4 py-2 rounded-full shadow-md"
             >
               {isUploading ? "Processing..." : "Upload Image"}
             </button>
           </div>
         </div>
       )}
 
       {step === "completed" && (
         <div className="text-center space-y-6">
           <h2 className="text-2xl font-semibold text-gray-800">
             Registration Confirmation
           </h2>
           <h3 className="text-lg text-gray-700">Email: {email}</h3>
           <div className="relative w-full h-60 bg-gray-300 flex items-center justify-center rounded overflow-hidden shadow-inner">
             {photoFront ? (
               <img
                 src={photoFront}
                 alt="Front of ID"
                 className="w-full h-full object-contain" // Use contain to see full ID
               />
             ) : (
               <span className="text-gray-600 text-lg">Photo Missing</span>
             )}
           </div>
           <div className="text-sm text-gray-500 font-medium pt-1">
             Front of ID
           </div>
           {/* OCR Details Section */} 
           <div className="mt-2 text-xs text-gray-600 min-h-[60px]">
             {idDetails ? (
               <div className="space-y-1 p-2 bg-gray-100 rounded border border-gray-200">
                 <p>
                   <strong>Name:</strong> {idDetails.name} {idDetails.fatherName}
                 </p>
                 <p>
                   <strong>ID No:</strong> {idDetails.idNumber}
                 </p>
                 <p>
                   <strong>Expiry:</strong> {idDetails.expiry}
                 </p>
               </div>
             ) : isExtracting ? (
               <div className="flex flex-col items-center justify-center pt-2">
                 <p>Scanning ID details...</p>
                 <div className="mt-2 w-6 h-6 border-2 border-gray-300 border-t-yellow-400 rounded-full animate-spin"></div>
               </div>
             ) : (
               <button
                 onClick={() => extractIdDetails(photoFront).then(setIdDetails)}
                 className="mt-2 px-4 py-1 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-full text-xs"
               >
                 Scan ID Details
               </button>
             )}
           </div>
           {/* Action Buttons */} 
           <div className="flex justify-center gap-4 pt-2">
             <button
               onClick={() => retakePhoto()}
               className="px-5 py-2 bg-gray-800 text-white hover:bg-gray-700 transition shadow-md"
             >
               Retake Photo
             </button>
             <button
               onClick={handleSubmit}
               disabled={!photoFront || isExtracting} // Disable if no photo or still extracting
               className={`px-6 py-2 text-black transition shadow-md ${!photoFront || isExtracting ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-yellow-400 hover:bg-yellow-300'}`}
             >
               {isExtracting ? 'Scanning...' : 'Confirm & Verify Identity'}
             </button>
           </div>
         </div>
       )}
 
       {step === "verification" && renderVerificationStepContent()}
 
       {step === "success" && (
         <div className="text-center space-y-6">
           <div className="text-6xl mb-4">✅</div>
           <h2 className="text-2xl font-semibold text-gray-800">
             Registration Complete!
           </h2>
           <p className="text-gray-600">
             Your identity has been verified successfully.
           </p>
           <button
             onClick={() => window.location.href = "/dashboard"} // Redirect to dashboard
             className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-md"
           >
             Go to Dashboard
           </button>
         </div>
       )}
       
       {/* Canvas only needed for ID capture now */}
       <canvas ref={canvasRef} className="hidden" /> 
       {/* Hidden input for ID upload fallback */}
       <input type="file" ref={fileInputRef} accept="image/*" onChange={handleFileUpload} className="hidden" />
     </div>
   );
 }
