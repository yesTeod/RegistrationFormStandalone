import React, { useState, useRef, useEffect } from "react";

export default function UserRegistrationForm() {
  const [step, setStep] = useState("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [photoFront, setPhotoFront] = useState(null);
  const [cameraAvailable, setCameraAvailable] = useState(true);
  const [cameraStatus, setCameraStatus] = useState("idle");
  const [isFlipping, setIsFlipping] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
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
  const [faceDetectionPaused, setFaceDetectionPaused] = useState(false);
  const [blinked, setBlinked] = useState(false);
  const [livenessVerified, setLivenessVerified] = useState(false);
  const [liveChallengeStep, setLiveChallengeStep] = useState(0);
  const [livenessCheckActive, setLivenessCheckActive] = useState(false);
  const [turnedLeft, setTurnedLeft] = useState(false);
  const [turnedRight, setTurnedRight] = useState(false);
  const [faceBoundingBox, setFaceBoundingBox] = useState(null);
  const [challengeText, setChallengeText] = useState("");

  const videoRef = useRef(null);
  const faceVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const faceCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const selfieInputRef = useRef(null);
  const lastDetectionTime = useRef(0);
  const lastLivenessCheckTime = useRef(0);

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Handle file upload without compression.
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
    // Request a higher resolution stream for a clear, crisp feed.
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
      // Set canvas dimensions to match the video feed for a clear capture.
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
    await delay(300); // wait for camera to stop cleanly
    await handleFlip("verification", "right");
    await delay(200); // wait for DOM to update
    setFaceVerified(null);
    setVerificationAttempts(0);
    setShowRetryOptions(false);
    setFaceDetectionPaused(false);
    setFaceDetected(false);
    setBlinked(false);
    setLivenessVerified(false);
    setLiveChallengeStep(0);
    setLivenessCheckActive(false);
    lastDetectionTime.current = 0;
    lastLivenessCheckTime.current = 0;
    startCamera("user", faceVideoRef);
  };

  // Face detection with rate limiting
  const detectFaceOnServer = async (dataURL) => {
    // Check if throttling needed - only call API every 3 seconds
    const now = Date.now();
    if (now - lastDetectionTime.current < 3000 || faceDetectionPaused) {
      return; // Skip this detection cycle
    }
    
    setDetecting(true);
    setFaceError(null);
    lastDetectionTime.current = now;
    
    try {
      const res = await fetch('/api/detect-face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataURL }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFaceDetected(false);
        setFaceError(json.error || 'Detection error');
      } else {
        setFaceDetected(json.faceDetected);
        
        // Store face bounding box for UI positioning
        if (json.faceDetected && json.boundingBox) {
          setFaceBoundingBox(json.boundingBox);
        }
      }
    } catch (e) {
      setFaceDetected(false);
      setFaceError('Network error');
    } finally {
      setDetecting(false);
    }
  };

  // Liveness check function with rate limiting - separate from face detection
  const checkLiveness = async (dataURL) => {
    // Rate limit to every 2 seconds
    const now = Date.now();
    if (now - lastLivenessCheckTime.current < 2000 || !livenessCheckActive || faceDetectionPaused) {
      return; // Skip this liveness check cycle
    }
    
    lastLivenessCheckTime.current = now;
    
    try {
      const res = await fetch('/api/detect-face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataURL }),
      });
      const json = await res.json();
      
      if (res.ok && json.faceDetected) {
        // Store face bounding box for UI positioning (we'll still store it even though we won't use it for positioning)
        if (json.boundingBox) {
          setFaceBoundingBox(json.boundingBox);
        }
        
        // Process liveness actions based on current step
        if (liveChallengeStep === 1 && json.isBlinking) {
          // Detected blinking
          setBlinked(true);
          // Skip smile challenge and move directly to turn left
          setLiveChallengeStep(2);
          setChallengeText("Great! Now turn your head left");
        } else if (liveChallengeStep === 2 && json.headPose && json.headPose.yaw < -15) {
          // Detected head turn left (negative yaw value)
          setTurnedLeft(true);
          // Move to turn right challenge
          setLiveChallengeStep(3);
          setChallengeText("Excellent! Now turn your head right");
        } else if (liveChallengeStep === 3 && json.headPose && json.headPose.yaw > 15) {
          // Detected head turn right (positive yaw value)
          setTurnedRight(true);
          
          // If all challenges passed
          if (blinked && turnedLeft) {
            setLivenessVerified(true);
            setLivenessCheckActive(false);
            setChallengeText("Liveness verified! You can proceed.");
          }
        }
      }
    } catch (e) {
      console.error('Liveness check error:', e);
    }
  };

  // Start liveness verification process
  const startLivenessCheck = () => {
    // Reset liveness states
    setBlinked(false);
    setTurnedLeft(false);
    setTurnedRight(false);
    setLivenessVerified(false);
    // Start with blink challenge
    setLiveChallengeStep(1);
    setChallengeText("Please blink your eyes");
    setLivenessCheckActive(true);
    lastLivenessCheckTime.current = 0; // Reset timer to allow immediate first check
  };

  // Calculate progress percentage based on completed challenges
  const calculateLivenessProgress = () => {
    const totalSteps = 3; // Blink, turn left, turn right (removed smile)
    let completedSteps = 0;
    
    if (blinked) completedSteps++;
    if (turnedLeft) completedSteps++;
    if (turnedRight) completedSteps++;
    
    return (completedSteps / totalSteps) * 100;
  };
  
  // Get the appropriate oval guide color based on the current step
  const getGuideColor = () => {
    if (liveChallengeStep === 1) return "blue"; // Blink
    if (liveChallengeStep === 2) return "green"; // Turn left
    if (liveChallengeStep === 3) return "purple"; // Turn right
    return "gray";
  };

  // Reset verification state for retry
  const handleRetryVerification = () => {
    setFaceVerified(null);
    setShowRetryOptions(false);
    setFaceDetectionPaused(false);
    // Reset liveness states
    setBlinked(false);
    setTurnedLeft(false);
    setTurnedRight(false);
    setLivenessVerified(false);
    setLiveChallengeStep(0);
    setLivenessCheckActive(false);
    setChallengeText("");
    lastDetectionTime.current = 0; // Reset timer to allow immediate detection
    lastLivenessCheckTime.current = 0;
  };

  // On verification step, poll for face detection with rate limiting
  useEffect(() => {
    let interval;
    if (step === 'verification' && !faceDetectionPaused) {
      interval = setInterval(() => {
        if (faceCanvasRef.current) {
          const canvas = faceCanvasRef.current;
          const context = canvas.getContext("2d");
          // Make sure video is ready
          if (faceVideoRef.current && faceVideoRef.current.readyState >= 2) {
            context.drawImage(faceVideoRef.current, 0, 0, 320, 240);
            const dataURL = canvas.toDataURL('image/png');
            detectFaceOnServer(dataURL);
          }
        }
      }, 1000); // Check every second, but API calls are throttled internally
    }
    return () => clearInterval(interval);
  }, [step, faceDetectionPaused]);

  // Separate effect for liveness checks
  useEffect(() => {
    let interval;
    if (step === 'verification' && livenessCheckActive && !faceDetectionPaused) {
      interval = setInterval(() => {
        if (faceCanvasRef.current) {
          const canvas = faceCanvasRef.current;
          const context = canvas.getContext("2d");
          // Make sure video is ready
          if (faceVideoRef.current && faceVideoRef.current.readyState >= 2) {
            context.drawImage(faceVideoRef.current, 0, 0, 320, 240);
            const dataURL = canvas.toDataURL('image/png');
            checkLiveness(dataURL);
          }
        }
      }, 2000); // Check every 2 seconds for liveness
    }
    return () => clearInterval(interval);
  }, [step, livenessCheckActive, faceDetectionPaused, liveChallengeStep, blinked]);

  // AWS Rekognition call
  const verifyFace = async () => {
    // Start liveness verification first
    if (!livenessVerified && !livenessCheckActive) {
      startLivenessCheck();
      return;
    }
    
    // Only proceed with face verification if liveness is verified
    if (!livenessVerified) {
      return;
    }
    
    setVerifying(true);
    setShowRetryOptions(false);
    setFaceDetectionPaused(true); // Pause detection during verification
    
    try {
      const resp = await fetch('/api/verify-face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idImage: photoFront, selfie: faceCanvasRef.current.toDataURL('image/png') }),
      });
      
      if (!resp.ok) {
        // Handle HTTP error responses (e.g., 400 Bad Request)
        const errorData = await resp.json().catch(() => ({ error: 'Unknown error' }));
        console.error("Face verification failed:", resp.status, errorData);
        setFaceVerified(false);
        setVerificationAttempts(prev => prev + 1);
        setShowRetryOptions(true);
        return;
      }
      
      const data = await resp.json();
      setFaceVerified(data.match);
      
      if (!data.match) {
        setVerificationAttempts(prev => prev + 1);
        setShowRetryOptions(true);
      }
    } catch (err) {
      console.error("Face verification error:", err);
      setFaceVerified(false);
      setVerificationAttempts(prev => prev + 1);
      setShowRetryOptions(true);
    } finally {
      setVerifying(false);
    }
  };

  // --- Verify via upload ---
  const handleSelfieUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setVerifying(true);
    setShowRetryOptions(false);
    setFaceDetectionPaused(true); // Pause detection during verification
    
    // Skip liveness check for uploaded selfies - we're assuming the user is providing a legitimate selfie
    setBlinked(true);
    setTurnedLeft(true);
    setTurnedRight(true);
    setLivenessVerified(true);
    setLivenessCheckActive(false);
    setChallengeText("");
    
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataURL = ev.target.result;
      try {
        const res = await fetch("/api/verify-face", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idImage: photoFront, selfie: dataURL }),
        });
        
        if (!res.ok) {
          // Handle HTTP error responses
          const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
          console.error("Face verification failed:", res.status, errorData);
          setFaceVerified(false);
          setVerificationAttempts(prev => prev + 1);
          setShowRetryOptions(true);
          return;
        }
        
        const data = await res.json();
        setFaceVerified(data.match);
        
        if (!data.match) {
          setVerificationAttempts(prev => prev + 1);
          setShowRetryOptions(true);
        }
      } catch (err) {
        console.error("Face verification error:", err);
        setFaceVerified(false);
        setVerificationAttempts(prev => prev + 1);
        setShowRetryOptions(true);
      } finally {
        setVerifying(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Return to completed step or go to success if verification is successful
  const handleVerificationComplete = () => {
    if (faceVerified) {
      handleFlip("success", "right");
    } else {
      // This shouldn't typically happen as the button is only shown in success case
      handleFlip("completed", "left");
    }
  }

  // This helper function compresses the image dataURL for OCR.
  function compressImageForOCR(dataURL, quality = 0.9) {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = dataURL;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Optionally, you can also reduce dimensions here if needed.
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        // Convert image to JPEG with the specified quality.
        const compressedDataURL = canvas.toDataURL('image/jpeg', quality);
        // Estimate file size in KB (base64 encoding approximates to 3/4 the length in bytes)
        const fileSizeKb = Math.round((compressedDataURL.length * (3 / 4)) / 1024);
        if (fileSizeKb > 1024 && quality > 0.1) {
          // Reduce quality further if file size is still too high.
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

      // Estimate file size and compress if necessary.
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

  // Trigger OCR extraction when registration is completed.
  useEffect(() => {
    if (step === "completed" && photoFront && !idDetails && !isExtracting) {
      extractIdDetails(photoFront).then((details) => {
        console.log("Extracted ID Details:", details);
        // Additional logging for the new extracted fields
        if (details) {
          console.log("Date of Birth:", details.dateOfBirth || "Not found");
          console.log("Place of Birth:", details.placeOfBirth || "Not found");
          console.log("Nationality:", details.nationality || "Not found");
          console.log("Gender:", details.gender || "Not found");
          console.log("Address:", details.address || "Not found");
          console.log("Issuing Authority:", details.issuingAuthority || "Not found");
          console.log("Issue Date:", details.issueDate || "Not found");
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

  // Clean up when component unmounts
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const renderVerificationStepContent = () => {
    return (
      <div className="text-center space-y-4">
        <h2 className="text-xl font-semibold">
          Face Verification
        </h2>

        <div className="mx-auto w-80 h-60 relative overflow-hidden rounded-lg border">
          {/* Fixed oval guide overlay centered in the camera view */}
          {faceVerified === null && (
            <div className="absolute inset-0 pointer-events-none">
              {/* Always centered oval, not trying to snap to face position */}
              <div 
                className="absolute border-2 border-dashed rounded-full transition-all duration-300"
                style={{
                  borderColor: livenessCheckActive ? getGuideColor() : "rgba(250, 204, 21, 0.6)",
                  width: "140px",
                  height: "180px",
                  left: "50%",
                  top: "50%",
                  transform: 'translate(-50%, -50%)',
                  boxShadow: livenessCheckActive ? `0 0 10px ${getGuideColor()}` : 'none',
                  opacity: 0.7
                }}
              >
                {/* Challenge indicators */}
                {liveChallengeStep === 1 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-full h-1 bg-blue-400 animate-pulse"></div>
                  </div>
                )}
                {liveChallengeStep === 2 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-2xl text-green-500 font-bold animate-pulse">←</div>
                  </div>
                )}
                {liveChallengeStep === 3 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-2xl text-purple-500 font-bold animate-pulse">→</div>
                  </div>
                )}
              </div>
            </div>
          )}
          <video ref={faceVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
          <canvas ref={faceCanvasRef} width={320} height={240} className="absolute top-0 left-0 opacity-0" />
        </div>

        {/* Liveness challenge instructions */}
        {faceVerified === null && livenessCheckActive && (
          <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-300">
            <h3 className="text-yellow-800 font-medium">Liveness Check</h3>
            <div className="mt-2">
              <p className="text-yellow-700 font-medium">{challengeText}</p>
              
              {/* Challenge status indicators */}
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                <span className={`text-xs px-2 py-1 rounded-full ${blinked ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                  {blinked ? '✓ Blink' : '◯ Blink'}
                </span>
                <span className={`text-xs px-2 py-1 rounded-full ${turnedLeft ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                  {turnedLeft ? '✓ Turn Left' : '◯ Turn Left'}
                </span>
                <span className={`text-xs px-2 py-1 rounded-full ${turnedRight ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                  {turnedRight ? '✓ Turn Right' : '◯ Turn Right'}
                </span>
              </div>
            </div>
            
            {/* Progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div 
                className="bg-yellow-500 h-2 rounded-full transition-all" 
                style={{ width: `${calculateLivenessProgress()}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Status indicators - only show when not in liveness check */}
        {faceVerified === null && !livenessCheckActive && (
          <div className="text-sm">
            {detecting && <p className="text-blue-600">Detecting face...</p>}
            {!detecting && faceDetected && <p className="text-green-600">Face detected - Ready for verification</p>}
            {!detecting && !faceDetected && <p className="text-amber-600">No face detected, please align your face within the frame</p>}
            {faceError && <p className="text-red-600 text-xs">{faceError}</p>}
          </div>
        )}

        {/* Verification success message */}
        {faceVerified === true && (
          <div className="bg-green-100 p-4 rounded-lg border border-green-300">
            <p className="text-green-700 font-medium text-lg">Identity Verified</p>
            <p className="text-green-600 text-sm">Your face has been successfully matched with your ID.</p>
            <button 
              onClick={handleVerificationComplete}
              className="mt-3 px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {/* Verification failure message with guidance */}
        {faceVerified === false && (
          <div className="bg-red-50 p-4 rounded-lg border border-red-200">
            <p className="text-red-700 font-medium text-lg">Verification Failed</p>
            <p className="text-red-600 text-sm mb-2">
              We couldn't match your face with the ID provided.
            </p>
            
            {showRetryOptions && (
              <div className="space-y-3 mt-2">
                <p className="text-gray-700 text-sm">Please try again with these tips:</p>
                <ul className="text-xs text-left list-disc pl-5 text-gray-600">
                  <li>Ensure good lighting on your face</li>
                  <li>Remove glasses or face coverings</li>
                  <li>Look directly at the camera</li>
                  <li>Avoid shadows on your face</li>
                </ul>
                
                <div className="flex flex-col space-y-2 mt-3">
                  <button
                    onClick={handleRetryVerification}
                    className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg shadow"
                  >
                    Try Again
                  </button>
                  
                  {verificationAttempts >= 2 && (
                    <button
                      onClick={() => handleFlip("completed", "left")}
                      className="w-full px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg shadow"
                    >
                      Back to ID Verification
                    </button>
                  )}
                  
                  {verificationAttempts >= 3 && (
                    <button
                      onClick={() => window.location.href = "/contact-support"}
                      className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg shadow"
                    >
                      Contact Support
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action buttons - only show when not displaying result or retry options */}
        {faceVerified === null && !showRetryOptions && (
          <div className="flex justify-center space-x-4">
            <button
              onClick={verifyFace}
              disabled={!faceDetected || verifying || (livenessCheckActive && !livenessVerified)}
              className={`px-4 py-2 rounded-full transition-colors ${
                faceDetected && !verifying && (!livenessCheckActive || livenessVerified)
                  ? "bg-yellow-400 hover:bg-yellow-300 text-black"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              {verifying ? 'Verifying...' : livenessCheckActive ? 'Performing Liveness Check...' : livenessVerified ? 'Verify Face' : 'Start Verification'}
            </button>
            <button
              onClick={() => selfieInputRef.current.click()}
              disabled={verifying || livenessCheckActive}
              className={`px-4 py-2 bg-blue-500 hover:bg-blue-400 text-white rounded-full ${
                verifying || livenessCheckActive ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {verifying ? 'Uploading...' : 'Upload Selfie'}
            </button>
          </div>
        )}

        <input
          type="file"
          accept="image/*"
          ref={selfieInputRef}
          onChange={handleSelfieUpload}
          className="hidden"
        />
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="p-6 max-w-md mx-auto bg-gradient-to-br from-gray-100 to-gray-300 rounded-3xl shadow-xl transition-transform duration-300 relative border border-gray-300 will-change-transform"
    >
      <style>{`button { border-radius: 10px !important; }`}</style>
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
