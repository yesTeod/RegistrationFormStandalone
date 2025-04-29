import React, { useState, useRef, useEffect } from "react";

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
  const [faceDetectionPaused, setFaceDetectionPaused] = useState(false);

  const [livenessStage, setLivenessStage] = useState('idle');
  const [livenessProgress, setLivenessProgress] = useState({
    center: false,
    up: false,
    down: false,
    left: false,
    right: false,
  });
  const requiredMovements = ['center', 'up', 'down', 'left', 'right'];
  const poseDataRef = useRef(null);

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
    await handleFlip("verification", "right");
    await delay(200);

    setFaceVerified(null);
    setVerificationAttempts(0);
    setShowRetryOptions(false);
    setFaceDetectionPaused(false);
    setFacePresent(false);
    lastDetectionTime.current = 0;
    setLivenessStage('idle');
    setLivenessProgress({ center: false, up: false, down: false, left: false, right: false });
    poseDataRef.current = null;
    setFaceError(null);
    setVerifying(false);
    setDetecting(false);

    startCamera("user", faceVideoRef);
  };

  const checkLivenessPose = (pose) => {
    if (!pose || livenessStage === 'idle' || livenessStage === 'verifying' || livenessStage === 'complete' || livenessStage === 'failed') return;

    const { Yaw: yaw, Pitch: pitch } = pose;
    const YAW_THRESHOLD = 18;
    const PITCH_THRESHOLD = 18;
    const CENTER_THRESHOLD = 8;

    if (typeof yaw !== 'number' || typeof pitch !== 'number') {
      console.warn("Invalid pose data received:", pose);
      setFaceError("Could not read head pose. Try adjusting lighting or position.");
      return;
    }

    let currentMoveSatisfied = false;
    let feedbackError = null;

    switch (livenessStage) {
      case 'center':
        if (Math.abs(yaw) < CENTER_THRESHOLD && Math.abs(pitch) < CENTER_THRESHOLD) {
          currentMoveSatisfied = true;
        } else {
          feedbackError = "Look straight at the camera.";
          if (Math.abs(yaw) >= CENTER_THRESHOLD) feedbackError += " Center your head horizontally.";
          if (Math.abs(pitch) >= CENTER_THRESHOLD) feedbackError += " Center your head vertically.";
        }
        break;
      case 'up':
        if (pitch < -PITCH_THRESHOLD && Math.abs(yaw) < YAW_THRESHOLD) {
          currentMoveSatisfied = true;
        } else {
          feedbackError = "Tilt your head slowly upwards.";
          if (pitch >= -PITCH_THRESHOLD) feedbackError += " Tilt higher.";
          if (Math.abs(yaw) >= YAW_THRESHOLD) feedbackError += " Keep looking straight ahead while tilting.";
        }
        break;
      case 'down':
        if (pitch > PITCH_THRESHOLD && Math.abs(yaw) < YAW_THRESHOLD) {
          currentMoveSatisfied = true;
        } else {
          feedbackError = "Tilt your head slowly downwards.";
          if (pitch <= PITCH_THRESHOLD) feedbackError += " Tilt lower.";
          if (Math.abs(yaw) >= YAW_THRESHOLD) feedbackError += " Keep looking straight ahead while tilting.";
        }
        break;
      case 'left':
        if (yaw > YAW_THRESHOLD && Math.abs(pitch) < PITCH_THRESHOLD) {
          currentMoveSatisfied = true;
        } else {
          feedbackError = "Turn your head slowly to your left.";
          if (yaw <= YAW_THRESHOLD) feedbackError += " Turn further left.";
          if (Math.abs(pitch) >= PITCH_THRESHOLD) feedbackError += " Keep your head level while turning.";
        }
        break;
      case 'right':
        if (yaw < -YAW_THRESHOLD && Math.abs(pitch) < PITCH_THRESHOLD) {
          currentMoveSatisfied = true;
        } else {
          feedbackError = "Turn your head slowly to your right.";
          if (yaw >= -YAW_THRESHOLD) feedbackError += " Turn further right.";
          if (Math.abs(pitch) >= PITCH_THRESHOLD) feedbackError += " Keep your head level while turning.";
        }
        break;
      default:
        break;
    }

    if (currentMoveSatisfied) {
      console.log(`Liveness: Detected movement for stage: ${livenessStage}`);
      setLivenessProgress(prev => ({ ...prev, [livenessStage]: true }));
      if (faceError && !faceError.toLowerCase().includes('network') && !faceError.toLowerCase().includes('lighting')) {
           setFaceError(null);
      }

      const currentIndex = requiredMovements.indexOf(livenessStage);
      const nextIndex = currentIndex + 1;

      if (nextIndex < requiredMovements.length) {
        setTimeout(() => {
          setLivenessStage(requiredMovements[nextIndex]);
        }, 300);
      } else {
        console.log("Liveness: All movements detected.");
        setFaceDetectionPaused(true);
        setLivenessStage('verifying');
        captureAndVerify();
      }
    } else if (feedbackError) {
        if (faceError !== feedbackError) {
            setFaceError(feedbackError);
        }
    }
  };

  const detectFaceAndPoseOnServer = async (dataURL) => {
    const now = Date.now();
    if (now - lastDetectionTime.current < 1000 || faceDetectionPaused || livenessStage === 'idle' || livenessStage === 'verifying' || livenessStage === 'complete' || livenessStage === 'failed') {
      return;
    }

    setDetecting(true);
    lastDetectionTime.current = now;

    try {
      const res = await fetch('/api/detect-face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataURL }),
      });
      const json = await res.json();

      if (!res.ok || json.error) {
        console.warn("Detection API error:", json.error || `HTTP ${res.status}`);
        setFacePresent(false);
        poseDataRef.current = null;
        const currentPoseFeedback = faceError && (faceError.includes("Tilt") || faceError.includes("Turn") || faceError.includes("Look straight") || faceError.includes("Center your head"));
        if (!currentPoseFeedback) {
           if (json.error && json.error !== faceError) setFaceError(json.error);
           else if (!json.error && res.status !== 200) setFaceError(`Detection failed (Status: ${res.status})`);
           else setFaceError("Could not detect face. Check lighting and position.");
        }
      } else {
        setFacePresent(json.faceDetected);
        if(json.faceDetected && json.pose) {
          poseDataRef.current = json.pose;
          checkLivenessPose(json.pose);
        } else if (json.faceDetected && !json.pose) {
          console.warn("Face detected but no pose data returned.");
          poseDataRef.current = null;
          const currentPoseFeedback = faceError && (faceError.includes("Tilt") || faceError.includes("Turn") || faceError.includes("Look straight") || faceError.includes("Center your head"));
          if (requiredMovements.includes(livenessStage) && !currentPoseFeedback) {
            setFaceError("Could not determine head pose.");
          }
        } else {
          poseDataRef.current = null;
          const currentPoseFeedback = faceError && (faceError.includes("Tilt") || faceError.includes("Turn") || faceError.includes("Look straight") || faceError.includes("Center your head"));
          if (requiredMovements.includes(livenessStage) && !currentPoseFeedback) {
            setFaceError("No face detected. Please position your face clearly in the frame.");
          }
        }
      }
    } catch (e) {
      console.error("Network error during detection:", e);
      setFacePresent(false);
      poseDataRef.current = null;
      setFaceError('Network error connecting to detection service.');
    } finally {
      setDetecting(false);
    }
  };

  useEffect(() => {
    let interval;
    const isActiveLiveness = requiredMovements.includes(livenessStage);

    if (step === 'verification' && isActiveLiveness && !faceDetectionPaused) {
      console.log(`Liveness: Starting polling for stage: ${livenessStage}`);
      setFaceError(null);
      interval = setInterval(() => {
        if (faceVideoRef.current && faceVideoRef.current.readyState >= 2 && faceCanvasRef.current) {
          const canvas = faceCanvasRef.current;
          const context = canvas.getContext("2d");
          const videoWidth = faceVideoRef.current.videoWidth;
          const videoHeight = faceVideoRef.current.videoHeight;
          if (canvas.width !== videoWidth || canvas.height !== videoHeight) {
            canvas.width = videoWidth || 320;
            canvas.height = videoHeight || 240;
          }
          context.drawImage(faceVideoRef.current, 0, 0, canvas.width, canvas.height);
          const dataURL = canvas.toDataURL('image/jpeg', 0.8);
          detectFaceAndPoseOnServer(dataURL);
        }
      }, 750);
    } else {
      console.log(`Liveness: Polling conditions not met or stopped. Step: ${step}, Stage: ${livenessStage}, Paused: ${faceDetectionPaused}`);
    }

    return () => {
      if(interval) {
        console.log("Liveness: Clearing polling interval.");
        clearInterval(interval);
      }
    };
  }, [step, livenessStage, faceDetectionPaused]);

  const captureAndVerify = async () => {
    console.log("Liveness: Capturing final image for verification.");
    setFaceError(null);

    if (faceCanvasRef.current && faceVideoRef.current && faceVideoRef.current.readyState >= 2) {
      const canvas = faceCanvasRef.current;
      const context = canvas.getContext("2d");
      const videoWidth = faceVideoRef.current.videoWidth;
      const videoHeight = faceVideoRef.current.videoHeight;
      canvas.width = videoWidth || 320;
      canvas.height = videoHeight || 240;
      context.drawImage(faceVideoRef.current, 0, 0, canvas.width, canvas.height);
      const finalSelfieDataUrl = canvas.toDataURL('image/png');

      setVerifying(true);
      setShowRetryOptions(false);

      try {
        const resp = await fetch('/api/verify-face', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idImage: photoFront, selfie: finalSelfieDataUrl }),
        });

        let errorMessage = 'Verification failed. Please try again.';
        let responseData = null;

        try {
          responseData = await resp.json();
        } catch (jsonError) {
          console.error("Failed to parse verification response:", jsonError);
        }

        if (!resp.ok) {
          console.error("Face verification API error:", resp.status, responseData);
          errorMessage = responseData?.error || `Verification failed (Status: ${resp.status})`;
          setFaceVerified(false);
          setVerificationAttempts(prev => prev + 1);
          setShowRetryOptions(true);
          setLivenessStage('failed');
          setFaceError(errorMessage);
          return;
        }

        setFaceVerified(responseData.match);
        console.log("Verification result:", responseData.match);

        if (!responseData.match) {
          errorMessage = "Face could not be matched to the ID. Please ensure you are the person in the ID.";
          setVerificationAttempts(prev => prev + 1);
          setShowRetryOptions(true);
          setLivenessStage('failed');
          setFaceError(errorMessage);
        } else {
          setLivenessStage('complete');
          setFaceError(null);
        }
      } catch (err) {
        console.error("Face verification fetch error:", err);
        setFaceVerified(false);
        setVerificationAttempts(prev => prev + 1);
        setShowRetryOptions(true);
        setLivenessStage('failed');
        setFaceError('Network error during face verification.');
      } finally {
        setVerifying(false);
      }
    } else {
      console.error("Liveness: Failed to capture final image - video or canvas not ready.");
      setFaceError("Could not capture image for verification. Please ensure camera access.");
      setLivenessStage('failed');
      setShowRetryOptions(true);
      setVerifying(false);
      setFaceDetectionPaused(true);
    }
  };

  const handleRetryVerification = () => {
    setFaceVerified(null);
    setShowRetryOptions(false);
    setFaceDetectionPaused(false);
    lastDetectionTime.current = 0;
    setLivenessProgress({ center: false, up: false, down: false, left: false, right: false });
    setLivenessStage('center');
    setFaceError(null);
    poseDataRef.current = null;
    setVerifying(false);
    setDetecting(false);
  };

  const handleVerificationComplete = () => {
    if (faceVerified) {
      handleFlip("success", "right");
    } else {
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
    const getLivenessInstruction = () => {
      switch (livenessStage) {
        case 'idle': return 'Get ready for the liveness check.';
        case 'center': return 'Look straight ahead at the camera.';
        case 'up': return 'Slowly tilt your head upwards.';
        case 'down': return 'Slowly tilt your head downwards.';
        case 'left': return 'Slowly turn your head to your left.';
        case 'right': return 'Slowly turn your head to your right.';
        case 'verifying': return 'Verifying your identity... Please hold still.';
        case 'complete': return faceVerified ? 'Identity Verified!' : 'Liveness check complete. Verification pending...';
        case 'failed': return 'Liveness check failed. See tips below.';
        default: return 'Position your face in the frame.';
      }
    };

    const renderProgressIndicators = () => {
      return (
        <div className="flex justify-center space-x-2 my-3">
          {requiredMovements.map((move) => (
            <div key={move} className="flex flex-col items-center">
              <span
                className={`inline-block w-5 h-5 rounded-full border-2 ${
                  livenessProgress[move]
                    ? 'bg-green-500 border-green-600'
                    : 'bg-gray-200 border-gray-400'
                } transition-colors duration-300`}
              ></span>
              <span className="text-xs mt-1 capitalize text-gray-600">{move}</span>
            </div>
          ))}
        </div>
      );
    };

    return (
      <div className="text-center space-y-4">
        <h2 className="text-xl font-semibold">
           Identity Verification
        </h2>
         <p className="text-sm text-gray-600 -mt-2">Liveness Check Required</p>

        <div className="mx-auto w-80 h-60 relative overflow-hidden rounded-lg border-2 border-gray-300 shadow-inner bg-gray-100">
          {(livenessStage !== 'verifying' && livenessStage !== 'complete' && livenessStage !== 'failed') && faceVerified === null && (
             <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
                <div className="w-[180px] h-[220px] border-4 border-dashed border-yellow-400 rounded-[50%] opacity-75 shadow-md"></div>
             </div>
          )}
          <video ref={faceVideoRef} autoPlay muted playsInline className="w-full h-full object-cover transform scale-x-[-1]" />
          <canvas ref={faceCanvasRef} className="absolute top-0 left-0 opacity-0 pointer-events-none" width="320" height="240"/>
        </div>

        {faceVerified !== true && (
           <div className="text-sm min-h-[80px] flex flex-col justify-center items-center bg-gray-50 p-3 rounded-lg border border-gray-200">
              <p className={`text-base font-medium mb-2 ${livenessStage === 'failed' || faceError ? 'text-red-600' : 'text-gray-800'}`}>
                 {getLivenessInstruction()}
              </p>

              {requiredMovements.includes(livenessStage) && renderProgressIndicators()}

               {(detecting || verifying) && livenessStage !== 'failed' && (
                   <div className="mt-2 w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin"></div>
               )}

              {faceError && <p className="text-red-600 text-xs mt-2 px-2">{faceError}</p>}

               {!facePresent && requiredMovements.includes(livenessStage) && !detecting && !faceError && (
                   <p className="text-amber-600 text-xs mt-1">Cannot detect face. Adjust position/lighting.</p>
               )}
           </div>
        )}

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

        {(faceVerified === false || (livenessStage === 'failed' && faceVerified === null)) && (
           <div className="bg-red-50 p-4 rounded-lg border border-red-200 shadow">
              <div className="flex items-center justify-center mb-2">
                 <svg className="w-7 h-7 text-red-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <p className="text-red-700 font-medium text-lg">
                   {faceVerified === false ? 'Verification Failed' : 'Liveness Check Failed'}
                </p>
              </div>
             <p className="text-red-600 text-sm mb-3 px-2">
                {faceError || (faceVerified === false ? "We couldn't match your face with the ID provided." : "Could not complete the liveness check.")}
             </p>

            {(showRetryOptions || livenessStage === 'failed') && (
              <div className="space-y-3 mt-3 border-t border-red-100 pt-3">
                <p className="text-gray-700 text-sm font-medium">Troubleshooting Tips:</p>
                 <ul className="text-xs text-left list-disc pl-6 text-gray-600 space-y-1">
                  <li>Ensure your face is well-lit from the front. Avoid backlighting or strong shadows.</li>
                   <li>Remove hats, sunglasses, or face coverings. Regular glasses are usually okay if worn in ID.</li>
                  <li>Hold your phone still at eye level.</li>
                  <li>Follow the head movement prompts slowly and clearly.</li>
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

        {faceVerified === null && livenessStage === 'idle' && !verifying && (
          <div className="flex justify-center mt-4">
            <button
              onClick={() => {
                 setLivenessStage('center');
                 setFaceDetectionPaused(false);
              }}
              className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-black rounded-full shadow-md font-semibold text-lg transition-all duration-200 ease-in-out transform hover:scale-105"
            >
              Start Liveness Check
            </button>
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
