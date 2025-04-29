import React, { useState, useRef, useEffect } from "react";
import { Amplify } from 'aws-amplify';
import { FaceLivenessDetector } from '@aws-amplify/ui-react-liveness';
import '@aws-amplify/ui-react/styles.css';

// Define awsRegion first
const awsRegion = process.env.REACT_APP_AWS_REGION || "us-east-1";

Amplify.configure({
  Auth: {
    region: awsRegion, // Add region here
    // If using unauthenticated identities, you might need:
    identityPoolId: 'eu-central-1:04cbf64c-4d6f-44e9-abe9-46466f2a0e39', 
  },
  // geo: {
  //   AmazonLocationService: { // Example structure if using Geo
  //      region: awsRegion
  //      // other geo configs...
  //   }
  // },
  Predictions: {
     // Configuration for Predictions category if needed
  },
  // Add the top-level region configuration as well
  aws_project_region: awsRegion 
});

export default function UserRegistrationForm() {
  const [step, setStep] = useState("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [photoFront, setPhotoFront] = useState(null);
  const [cameraAvailable, setCameraAvailable] = useState(true);
  const [cameraStatus, setCameraStatus] = useState("idle");
  const [isFlipping, setIsFlipping] = useState(false);
  const [facePresent, setFacePresent] = useState(false);
  const [mockMode, setMockMode] = useState(false);
  const [idDetails, setIdDetails] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [faceVerified, setFaceVerified] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [faceError, setFaceError] = useState(null);
  const [verificationAttempts, setVerificationAttempts] = useState(0);
  const [showRetryOptions, setShowRetryOptions] = useState(false);
  const [livenessSessionId, setLivenessSessionId] = useState(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isCheckingResult, setIsCheckingResult] = useState(false);

  const videoRef = useRef(null);
  const faceVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const faceCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const selfieInputRef = useRef(null);
  const lastDetectionTime = useRef(0);

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const reader = new FileReader();
      reader.onload = (e) => {
        setPhotoFront(e.target.result);
        handleFlip("completed", "right");
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error processing image:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFlip = async (nextStep, direction = "right") => {
    if (isFlipping) return;
    setIsFlipping(true);
    const card = containerRef.current;
    if (card) {
      card.style.transition = "transform 0.6s ease";
      card.style.transform =
        direction === "left" ? "rotateY(-90deg)" : "rotateY(90deg)";
    }
    await delay(600);
    setStep(nextStep);
    if (card) card.style.transform = "rotateY(0deg)";
    await delay(600);
    setIsFlipping(false);
  };

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

  const stopCamera = () => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const handleFormSubmit = () => {
    startCamera();
    handleFlip("camera", "right");
  };

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
      stopCamera();
      handleFlip("completed", "right");
    }
  };

  const retakePhoto = async () => {
    startCamera();
    await delay(200);
    await handleFlip("camera", "left");
  };

  const handleSubmit = async () => {
    stopCamera();
    await delay(300);
    setFaceVerified(null);
    setVerificationAttempts(0);
    setShowRetryOptions(false);
    setLivenessSessionId(null);
    setIsCreatingSession(false);
    setIsCheckingResult(false);
    await handleFlip("verification", "right");
  };

  const handleStartLivenessCheck = async () => {
    setIsCreatingSession(true);
    setFaceError(null);
    setFaceVerified(null);
    setShowRetryOptions(false);

    try {
      const response = await fetch('/api/create-liveness-session', { method: 'POST' });
      const data = await response.json();

      if (!response.ok || !data.sessionId) {
        throw new Error(data.error || 'Failed to create session');
      }

      console.log("Received Liveness SessionId:", data.sessionId);
      setLivenessSessionId(data.sessionId);

    } catch (error) {
      console.error("Error creating liveness session:", error);
      setFaceError(`Failed to start check: ${error.message}`);
      setShowRetryOptions(true);
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleAnalysisComplete = async () => {
    console.log("Liveness analysis complete, fetching results for session:", livenessSessionId);
    setIsCheckingResult(true);
    setFaceError(null);

    try {
      const response = await fetch(`/api/get-liveness-result?sessionId=${livenessSessionId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to get results (Status: ${response.status})`);
      }

      console.log("Liveness Result:", data);

      if (data.status === 'SUCCEEDED' && data.isLive) {
         setFaceVerified(true);
      } else {
        setFaceVerified(false);
        setVerificationAttempts(prev => prev + 1);
        setShowRetryOptions(true);
        setFaceError(data.error || 'Liveness check failed or face was not live.');
        setLivenessSessionId(null);
      }

    } catch (error) {
      console.error("Error fetching liveness results:", error);
      setFaceVerified(false);
      setVerificationAttempts(prev => prev + 1);
      setShowRetryOptions(true);
      setFaceError(`Result Error: ${error.message}`);
      setLivenessSessionId(null);
    } finally {
      setIsCheckingResult(false);
    }
  };

  const handleLivenessError = (error) => {
    console.error("Error during FaceLivenessDetector flow:", error);
    setFaceVerified(false);
    setFaceError(`Liveness Error: ${error.message}`);
    setVerificationAttempts(prev => prev + 1);
    setShowRetryOptions(true);
    setLivenessSessionId(null);
    setIsCreatingSession(false);
    setIsCheckingResult(false);
  };

  const handleRetryVerification = () => {
    setFaceVerified(null);
    setShowRetryOptions(false);
    setLivenessSessionId(null);
    setIsCreatingSession(false);
    setIsCheckingResult(false);
  };

  const handleVerificationComplete = () => {
    if (faceVerified) {
      handleFlip("success", "right");
    } else {
      console.warn("handleVerificationComplete called but faceVerified is not true.");
      handleFlip("completed", "left");
    }
  }

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

  useEffect(() => {
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

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const renderVerificationStepContent = () => {
    return (
      <div className="text-center space-y-4">
        <h2 className="text-xl font-semibold">
           Identity Verification
        </h2>
         <p className="text-sm text-gray-600 -mt-2">Please complete the face liveness check.</p>

        <div className="min-h-[350px] flex flex-col items-center justify-center">
            {livenessSessionId && !isCheckingResult && faceVerified === null && (
                <FaceLivenessDetector
                    sessionId={livenessSessionId}
                    region={awsRegion}
                    onAnalysisComplete={handleAnalysisComplete}
                    onError={handleLivenessError}
                />
            )}

             {isCreatingSession && (
                 <div className="flex flex-col items-center space-y-2">
                     <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin"></div>
                     <p className="text-blue-600">Starting liveness check...</p>
                 </div>
            )}

             {isCheckingResult && (
                 <div className="flex flex-col items-center space-y-2">
                     <div className="w-8 h-8 border-4 border-green-200 border-t-green-500 rounded-full animate-spin"></div>
                     <p className="text-green-600">Verifying results...</p>
                 </div>
            )}

            {!livenessSessionId && !isCreatingSession && !isCheckingResult && faceVerified === null && (
                <button
                    onClick={handleStartLivenessCheck}
                    disabled={isCreatingSession}
                    className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-black rounded-full shadow-md font-semibold text-lg transition-all duration-200 ease-in-out transform hover:scale-105 disabled:opacity-50"
                >
                    Start Liveness Check
                </button>
            )}

            {faceError && faceVerified !== false && (
                 <p className="text-red-600 text-sm mt-2 px-2">{faceError}</p>
             )}

        </div>

        {faceVerified === true && (
            <div className="bg-green-100 p-4 rounded-lg border border-green-300 shadow">
              <div className="flex items-center justify-center mb-2">
                 <svg className="w-8 h-8 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                 <p className="text-green-700 font-medium text-lg">Identity Verified Successfully!</p>
              </div>
              <p className="text-green-600 text-sm mb-3">Your face matched the provided ID document.</p>
              <button
                onClick={handleVerificationComplete}
                className="mt-1 px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow transition-colors"
              >
                Continue to Dashboard
              </button>
            </div>
        )}

        {faceVerified === false && (
           <div className="bg-red-50 p-4 rounded-lg border border-red-200 shadow">
              <div className="flex items-center justify-center mb-2">
                 <svg className="w-7 h-7 text-red-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <p className="text-red-700 font-medium text-lg">
                    Verification Failed
                </p>
              </div>
             <p className="text-red-600 text-sm mb-3 px-2">
                 {faceError || "Could not verify your liveness. Please try again."}
             </p>

            {showRetryOptions && (
              <div className="space-y-3 mt-3 border-t border-red-100 pt-3">
                <p className="text-gray-700 text-sm font-medium">Troubleshooting Tips:</p>
                 <ul className="text-xs text-left list-disc pl-6 text-gray-600 space-y-1">
                  <li>Ensure your face is well-lit from the front. Avoid backlighting or strong shadows.</li>
                   <li>Remove hats, sunglasses, or face coverings. Regular glasses are usually okay if worn in ID.</li>
                  <li>Hold your phone still at eye level.</li>
                   <li>Position your face fully within the oval on the screen.</li>
                   <li>Ensure you are the same person shown on the ID document.</li>
                </ul>

                <div className="flex flex-col items-center space-y-2 pt-2">
                   <button
                     onClick={handleRetryVerification}
                    className="w-full max-w-xs px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg shadow transition-colors"
                  >
                     Try Liveness Check Again
                  </button>

                  {verificationAttempts >= 1 && (
                    <button
                      onClick={() => handleFlip("completed", "left")}
                      className="w-full max-w-xs px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg shadow text-sm"
                    >
                       Check/Retake ID Photo
                    </button>
                  )}

                  {verificationAttempts >= 2 && (
                    <button
                       onClick={() => window.location.href = "/contact-support"}
                      className="w-full max-w-xs px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg shadow text-sm"
                    >
                      Contact Support
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="p-6 max-w-md mx-auto bg-gradient-to-br from-gray-100 to-gray-300 rounded-3xl shadow-xl transition-transform duration-300 relative border border-gray-300 will-change-transform"
    >
       <style>{`
         button { border-radius: 10px !important; }
         .flipped-video { transform: scaleX(-1); }
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
          <div className="w-full h-60 bg-gray-300 flex items-center justify-center rounded overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover rounded"
            />
            <canvas
              ref={canvasRef}
              width={320}
              height={240}
              className="hidden"
            />
          </div>
          <div className="flex flex-col md:flex-row justify-center gap-3 mt-4">
            <button
              onClick={capturePhoto}
              className="bg-yellow-400 hover:bg-yellow-300 text-black px-4 py-2 rounded-full shadow-md"
            >
              Capture Front
            </button>

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
          <div className="relative w-full h-60 bg-gray-300 flex items-center justify-center rounded overflow-hidden">
            {photoFront ? (
              <img
                src={photoFront}
                alt="Front of ID"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-gray-600 text-lg">Photo Missing</span>
            )}
          </div>
          <div className="text-sm text-gray-500 font-medium pt-1">
            Front of ID
          </div>
          <div className="mt-4 text-xs text-gray-600">
            {idDetails ? (
              <div>
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
              <div className="flex flex-col items-center justify-center">
                <p>Scanning ID details...</p>
                <div className="mt-2 w-8 h-8 border-2 border-gray-300 border-t-yellow-400 rounded-full animate-spin"></div>
              </div>
            ) : (
              <button
                onClick={() =>
                  extractIdDetails(photoFront).then(setIdDetails)
                }
                className="px-4 py-1 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-full text-xs"
              >
                Scan ID Details
              </button>
            )}
          </div>
          <div className="flex justify-center gap-4 pt-2">
            <button
              onClick={() => retakePhoto()}
              className="px-5 py-2 bg-gray-800 text-white hover:bg-gray-700 transition shadow-md"
            >
              Retake Photo
            </button>
            <button
              onClick={handleSubmit}
              className="px-6 py-2 bg-yellow-400 hover:bg-yellow-300 text-black transition shadow-md"
            >
              Submit
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
            onClick={() => window.location.href = "/dashboard"}
            className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-md"
          >
            Go to Dashboard
          </button>
        </div>
      )}
      
      <canvas ref={canvasRef} className="hidden" />
      <input type="file" ref={fileInputRef} accept="image/*" onChange={handleFileUpload} className="hidden" />
    </div>
  );
}
