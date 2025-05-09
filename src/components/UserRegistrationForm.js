import React, { useState, useRef, useEffect } from "react";
import AdminDashboard from './AdminDashboard.js';

export default function UserRegistrationForm() {
  const [step, setStep] = useState("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [photoFront, setPhotoFront] = useState(null);
  const [photoBack, setPhotoBack] = useState(null);
  const [cameraAvailable, setCameraAvailable] = useState(true);
  const [cameraStatus, setCameraStatus] = useState("idle");
  const [isFlipping, setIsFlipping] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [mockMode, setMockMode] = useState(false);
  const [idDetails, setIdDetails] = useState(null);
  const [backIdDetails, setBackIdDetails] = useState(null);
  const [combinedIdDetails, setCombinedIdDetails] = useState(null);
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
  const [isCheckingUser, setIsCheckingUser] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [userData, setUserData] = useState(null);
  const [frontIdVideoDataUrl, setFrontIdVideoDataUrl] = useState(null);
  const [backIdVideoDataUrl, setBackIdVideoDataUrl] = useState(null);
  const [debugLogs, setDebugLogs] = useState([]);
  const [isProcessingConfirmation, setIsProcessingConfirmation] = useState(false);

  const videoRef = useRef(null);
  const faceVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const faceCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastDetectionTime = useRef(0);
  const lastLivenessCheckTime = useRef(0);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const dataURLtoBlob = (dataurl) => {
    if (!dataurl) return null;
    try {
      const arr = dataurl.split(',');
      if (arr.length < 2) return null;
      const mimeMatch = arr[0].match(/:(.*?);/);
      if (!mimeMatch || mimeMatch.length < 2) return null;
      const mime = mimeMatch[1];
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], { type: mime });
    } catch (e) {
      return null;
    }
  };

  const blobToDataURL = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        
        resolve(reader.result);
      };
      reader.onerror = (error) => {
        
        reject(error);
      };
      reader.readAsDataURL(blob);
      
    });
  };

  const handleFormSubmit = async () => {
    if (!email || !password) {
      alert("Please enter both email and password");
      return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert("Please enter a valid email address");
      return;
    }
    
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      alert("Password must be at least 8 characters and include both letters and numbers");
      return;
    }

    setIsCheckingUser(true);
    setLoginError(null);
    
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        
        setUserData(data);
        if (data.isAdmin) {
          handleFlip("adminDashboard", "right");
        } else {
          handleFlip("loggedIn", "right");
        }
      } else if (data.code === 'EMAIL_NOT_FOUND') {
        
        handleFlip("camera", "right");
      } else if (data.code === 'INCORRECT_PASSWORD') {
        setLoginError("Incorrect password");
      } else {
        setLoginError(data.error || "Login failed");
        
      }
    } catch (error) {
      
      setLoginError("Network error, please try again");
    } finally {
      setIsCheckingUser(false);
    }
  };

  const capturePhoto = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      
      mediaRecorderRef.current.onstop = async () => {
        
        const videoBlob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        

        if (videoBlob.size > 0) {
          try {
            const videoDataUrl = await blobToDataURL(videoBlob);
            setFrontIdVideoDataUrl(videoDataUrl);
            
          } catch (error) {
            
            setFrontIdVideoDataUrl(null);
          }
        } else {
          
          setFrontIdVideoDataUrl(null);
        }
        recordedChunksRef.current = [];
        mediaRecorderRef.current = null; // Clear the ref after processing

        // Proceed with photo capture after video is processed
        if (videoRef.current && canvasRef.current) {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          canvas.width = video.videoWidth || 320;
          canvas.height = video.videoHeight || 240;
          const context = canvas.getContext("2d");
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = canvas.toDataURL("image/png");
          setPhotoFront(imageData);
        }
        stopMediaTracks(); // Stop only tracks, recorder handled
        handleFlip("cameraBack", "right");
      };
      mediaRecorderRef.current.stop();
      
    } else {
      setFrontIdVideoDataUrl(null); // Ensure it's null if not recorded
      // Fallback if MediaRecorder wasn't active (e.g., browser incompatibility)
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 240;
        const context = canvas.getContext("2d");
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL("image/png");
        setPhotoFront(imageData);
      }
      stopMediaTracks(); // Stop only tracks
      handleFlip("cameraBack", "right");
    }
  };

  const captureBackPhoto = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      
      mediaRecorderRef.current.onstop = async () => {
        
        const videoBlob = new Blob(recordedChunksRef.current, { type: 'video/webm' });

        if (videoBlob.size > 0) {
          try {
            const videoDataUrl = await blobToDataURL(videoBlob);
            setBackIdVideoDataUrl(videoDataUrl);
            
          } catch (error) {
            
            setBackIdVideoDataUrl(null);
          }
        } else {
          setBackIdVideoDataUrl(null);
        }
        recordedChunksRef.current = [];
        mediaRecorderRef.current = null; // Clear the ref after processing

        // Proceed with photo capture after video is processed
        if (videoRef.current && canvasRef.current) {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          canvas.width = video.videoWidth || 320;
          canvas.height = video.videoHeight || 240;
          const context = canvas.getContext("2d");
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = canvas.toDataURL("image/png");
          setPhotoBack(imageData);
        }
        stopMediaTracks(); // Stop only tracks, recorder handled
        handleFlip("completed", "right");
      };
      mediaRecorderRef.current.stop();
      
    } else {
      setBackIdVideoDataUrl(null); // Ensure it's null if not recorded
      // Fallback if MediaRecorder wasn't active
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 240;
        const context = canvas.getContext("2d");
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL("image/png");
        setPhotoBack(imageData);
      }
      stopMediaTracks(); // Stop only tracks
      handleFlip("completed", "right");
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // If a file is uploaded, no video is recorded via camera for this side.
    setFrontIdVideoDataUrl(null);

    try {
      setIsUploading(true);
      const reader = new FileReader();
      reader.onload = (e) => {
        setPhotoFront(e.target.result);
        handleFlip("cameraBack", "right");
      };
      reader.readAsDataURL(file);
    } catch (error) {
      
    } finally {
      setIsUploading(false);
    }
  };

  const handleBackFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // If a file is uploaded, no video is recorded via camera for this side.
    setBackIdVideoDataUrl(null);

    try {
      setIsUploading(true);
      const reader = new FileReader();
      reader.onload = (e) => {
        setPhotoBack(e.target.result);
        handleFlip("completed", "right");
      };
      reader.readAsDataURL(file);
    } catch (error) {
      
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
    const currentStep = step; // Capture current step for accurate logging within async operations
    
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
      .catch((err) => {
        setCameraAvailable(false);
        setCameraStatus("error");
        setMockMode(false);
      });
  };

  const stopCamera = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.onstop = null; // Remove any existing onstop handler
      mediaRecorderRef.current.stop();
      recordedChunksRef.current = []; // Clear chunks as we are not saving this video
    } else if (mediaRecorderRef.current) {
      
    }
    mediaRecorderRef.current = null;

    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    } else {
      
    }
  };

  // New function to only stop media tracks, without affecting MediaRecorder state
  const stopMediaTracks = () => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    } else {
      
    }
  };

  const retakePhoto = async () => {
    stopCamera();
    setPhotoFront(null);
    setPhotoBack(null);
    setIdDetails(null);
    setBackIdDetails(null);
    setCombinedIdDetails(null);
    setFrontIdVideoDataUrl(null);
    setBackIdVideoDataUrl(null);
    

    await handleFlip("camera", "left");
    await delay(50);
    startCamera("environment", videoRef);
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
    setFaceDetected(false);
    setBlinked(false);
    setLivenessVerified(false);
    setLiveChallengeStep(0);
    setLivenessCheckActive(false);
    lastDetectionTime.current = 0;
    lastLivenessCheckTime.current = 0;
    startCamera("user", faceVideoRef);
  };

  const detectFaceOnServer = async (dataURL) => {
    const now = Date.now();
    if (now - lastDetectionTime.current < 3000 || faceDetectionPaused) {
      return;
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

  const checkLiveness = async (dataURL) => {
    const now = Date.now();
    if (now - lastLivenessCheckTime.current < 2000 || !livenessCheckActive || faceDetectionPaused) {
      return;
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
        if (json.boundingBox) {
          setFaceBoundingBox(json.boundingBox);
        }
        
        if (liveChallengeStep === 1 && json.isBlinking) {
          setBlinked(true);
          setLiveChallengeStep(2);
          setChallengeText("Great! Now turn your head left");
        } else if (liveChallengeStep === 2 && json.headPose && json.headPose.yaw < -15) {
          setTurnedLeft(true);
          setLiveChallengeStep(3);
          setChallengeText("Excellent! Now turn your head right");
        } else if (liveChallengeStep === 3 && json.headPose && json.headPose.yaw > 15) {
          setTurnedRight(true);
          
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

  const startLivenessCheck = () => {
    setBlinked(false);
    setTurnedLeft(false);
    setTurnedRight(false);
    setLivenessVerified(false);
    setLiveChallengeStep(1);
    setChallengeText("Please blink your eyes");
    setLivenessCheckActive(true);
    lastLivenessCheckTime.current = 0;
  };

  const calculateLivenessProgress = () => {
    const totalSteps = 3;
    let completedSteps = 0;
    
    if (blinked) completedSteps++;
    if (turnedLeft) completedSteps++;
    if (turnedRight) completedSteps++;
    
    return (completedSteps / totalSteps) * 100;
  };
  
  const getGuideColor = () => {
    if (liveChallengeStep === 1) return "blue";
    if (liveChallengeStep === 2) return "green";
    if (liveChallengeStep === 3) return "purple";
    return "gray";
  };

  const handleRetryVerification = () => {
    setFaceVerified(null);
    setShowRetryOptions(false);
    setFaceDetectionPaused(false);
    setBlinked(false);
    setTurnedLeft(false);
    setTurnedRight(false);
    setLivenessVerified(false);
    setLiveChallengeStep(0);
    setLivenessCheckActive(false);
    setChallengeText("");
    lastDetectionTime.current = 0;
    lastLivenessCheckTime.current = 0;
  };

  useEffect(() => {
    let interval;
    if (step === 'verification' && !faceDetectionPaused) {
      interval = setInterval(() => {
        if (faceCanvasRef.current) {
          const canvas = faceCanvasRef.current;
          const context = canvas.getContext("2d");
          if (faceVideoRef.current && faceVideoRef.current.readyState >= 2) {
            context.drawImage(faceVideoRef.current, 0, 0, 320, 240);
            const dataURL = canvas.toDataURL('image/png');
            detectFaceOnServer(dataURL);
          }
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [step, faceDetectionPaused]);

  useEffect(() => {
    let interval;
    if (step === 'verification' && livenessCheckActive && !faceDetectionPaused) {
      interval = setInterval(() => {
        if (faceCanvasRef.current) {
          const canvas = faceCanvasRef.current;
          const context = canvas.getContext("2d");
          if (faceVideoRef.current && faceVideoRef.current.readyState >= 2) {
            context.drawImage(faceVideoRef.current, 0, 0, 320, 240);
            const dataURL = canvas.toDataURL('image/png');
            checkLiveness(dataURL);
          }
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [step, livenessCheckActive, faceDetectionPaused, liveChallengeStep, blinked]);

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
        
        // If we've reached maximum verification attempts, reject the registration
        if (verificationAttempts >= 2) {
          // Short delay to show the failure message before transitioning
          setTimeout(() => {
            handleFlip("registrationFailed", "right");
          }, 1500);
        } else {
          setShowRetryOptions(true);
        }
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

  const handleVerificationComplete = () => {
    if (faceVerified) {
      // Save the registration with ID details
      saveRegistration();
    } else {
      // If face verification failed definitively, show the failure screen
      if (verificationAttempts >= 3) {
        handleFlip("registrationFailed", "right");
      } else {
        // Otherwise go back to ID step
        handleFlip("completed", "left");
      }
    }
  };

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

  async function extractIdDetails(imageData, englishOnly = false) {
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
        body: JSON.stringify({ 
          image: processedImage,
          englishOnly: englishOnly 
        }),
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
    if (step === "completed" && photoFront && photoBack && !idDetails && !backIdDetails && !isExtracting) {
      extractIdDetails(photoFront, true).then((frontDetails) => {
        
        setIdDetails(frontDetails);
        
        extractIdDetails(photoBack, true).then((backDetails) => {
          
          setBackIdDetails(backDetails);
          
          const combined = {};
          
          const allKeys = [...new Set([...Object.keys(frontDetails), ...Object.keys(backDetails)])];
          
          allKeys.forEach(key => {
            const frontValue = frontDetails[key];
            const backValue = backDetails[key];
            
            if (frontValue && frontValue !== "Not found") {
              combined[key] = frontValue;
            } else if (backValue && backValue !== "Not found") {
              combined[key] = backValue;
            } else {
              combined[key] = frontValue || backValue || "Not found";
            }
          });
          
          setCombinedIdDetails(combined);
          console.log("Combined ID Details:", combined);
        });
      });
    }
  }, [step, photoFront, photoBack, idDetails, backIdDetails, isExtracting]);

  useEffect(() => {
    if (step === "camera") {
      
      startCamera("environment", videoRef);
    }
    if (step === "cameraBack") {
      
      startCamera("environment", videoRef);
    }
  }, [step]);

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
          Face Verification
        </h2>

        <div className="mx-auto w-80 h-60 relative overflow-hidden rounded-lg border">
          {faceVerified === null && (
            <div className="absolute inset-0 pointer-events-none">
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

        {faceVerified === null && livenessCheckActive && (
          <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-300">
            <h3 className="text-yellow-800 font-medium">Liveness Check</h3>
            <div className="mt-2">
              <p className="text-yellow-700 font-medium">{challengeText}</p>
              
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
            
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div 
                className="bg-yellow-500 h-2 rounded-full transition-all" 
                style={{ width: `${calculateLivenessProgress()}%` }}
              ></div>
            </div>
          </div>
        )}

        {faceVerified === null && !livenessCheckActive && (
          <div className="text-sm">
            {detecting && <p className="text-blue-600">Detecting face...</p>}
            {!detecting && faceDetected && <p className="text-green-600">Face detected - Ready for verification</p>}
            {!detecting && !faceDetected && <p className="text-amber-600">No face detected, please align your face within the frame</p>}
            {faceError && <p className="text-red-600 text-xs">{faceError}</p>}
          </div>
        )}

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
          </div>
        )}
      </div>
    );
  };

  const saveVideoKeysToDatabase = async (frontKey, backKey) => {
    if (!frontKey && !backKey) {
      console.info("[DB Save] No S3 keys provided, skipping database save.");
      return { success: true, message: "No keys to save." }; // Or consider this a non-error scenario
    }
    console.log(`[DB Save] Attempting to save S3 keys to DB: Front - ${frontKey}, Back - ${backKey}`);
    try {
      const response = await fetch('/api/save-video-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Include email if you want to associate these keys with the user
        // For now, make sure 'email' state is accessible here if you uncomment
        body: JSON.stringify({ 
          frontS3Key: frontKey, 
          backS3Key: backKey, 
          email: email // Assuming 'email' is from component state and accessible
        }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        console.log("[DB Save] S3 keys successfully sent to API.", data.message);
        return { success: true, message: data.message };
      } else {
        console.error("[DB Save] API Error:", data.error || response.statusText);
        return { success: false, message: data.error || `API request failed with status ${response.status}` };
      }
    } catch (error) {
      console.error("[DB Save] Network or other error saving S3 keys:", error);
      return { success: false, message: error.message || "Network error during DB save." };
    }
  };

  const handleDirectS3Upload = async () => {
    let frontUploadSuccess = false;
    let backUploadSuccess = false;
    let frontS3Key = null;
    let backS3Key = null;

    if (!frontIdVideoDataUrl && !backIdVideoDataUrl) {
      alert("No videos captured or selected to upload.");
      return;
    }

    setIsUploading(true);

    // --- Upload Front ID Video ---    
    if (frontIdVideoDataUrl) {
      const frontVideoBlob = dataURLtoBlob(frontIdVideoDataUrl);
      if (frontVideoBlob) {
        try {
          const apiUrl = '/api/generate-s3-upload-url';
          const payload = { fileType: frontVideoBlob.type };
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!response.ok) {
            let errorDetail = `HTTP status ${response.status}`;
            try { const errorJson = await response.json(); errorDetail = errorJson.error || JSON.stringify(errorJson); } 
            catch (e) { errorDetail = (await response.text()) || errorDetail; }
            throw new Error(`Failed to get S3 pre-signed URL (front): ${errorDetail}`);
          }
          const presignedDataFront = await response.json();
          if (!presignedDataFront.success || !presignedDataFront.url || !presignedDataFront.fields || !presignedDataFront.key) {
            throw new Error(presignedDataFront.error || "Invalid data from pre-signed URL API (front)");
          }
          
          const formDataFront = new FormData();
          Object.entries(presignedDataFront.fields).forEach(([key, value]) => formDataFront.append(key, value));
          formDataFront.append("file", frontVideoBlob);
          const s3UploadResponseFront = await fetch(presignedDataFront.url, { method: 'POST', body: formDataFront });
          if (!s3UploadResponseFront.ok) {
            const errorText = await s3UploadResponseFront.text();
            throw new Error(`S3 upload failed (front): ${s3UploadResponseFront.status} - ${errorText}`);
          }
          frontS3Key = presignedDataFront.key;
          frontUploadSuccess = true;
        } catch (error) {
          console.error("[Front Video] Upload Error:", error.message);
        }
      } else {
        console.warn("[Front Video] DataURL existed but failed to convert to Blob.");
      }
    }

    // --- Upload Back ID Video ---    
    if (backIdVideoDataUrl) {
      const backVideoBlob = dataURLtoBlob(backIdVideoDataUrl);
      if (backVideoBlob) {
        try {
          const apiUrl = '/api/generate-s3-upload-url';
          const payload = { fileType: backVideoBlob.type };
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!response.ok) {
            let errorDetail = `HTTP status ${response.status}`;
            try { const errorJson = await response.json(); errorDetail = errorJson.error || JSON.stringify(errorJson); }
            catch (e) { errorDetail = (await response.text()) || errorDetail; }
            throw new Error(`Failed to get S3 pre-signed URL (back): ${errorDetail}`);
          }
          const presignedDataBack = await response.json();
          if (!presignedDataBack.success || !presignedDataBack.url || !presignedDataBack.fields || !presignedDataBack.key) {
            throw new Error(presignedDataBack.error || "Invalid data from pre-signed URL API (back)");
          }

          const formDataBack = new FormData();
          Object.entries(presignedDataBack.fields).forEach(([key, value]) => formDataBack.append(key, value));
          formDataBack.append("file", backVideoBlob);
          const s3UploadResponseBack = await fetch(presignedDataBack.url, { method: 'POST', body: formDataBack });
          if (!s3UploadResponseBack.ok) {
            const errorText = await s3UploadResponseBack.text();
            throw new Error(`S3 upload failed (back): ${s3UploadResponseBack.status} - ${errorText}`);
          }
          backS3Key = presignedDataBack.key;
          backUploadSuccess = true;
        } catch (error) {
          console.error("[Back Video] Upload Error:", error.message);
        }
      } else {
        console.warn("[Back Video] DataURL existed but failed to convert to Blob.");
      }
    }
    
    // --- Save Keys to Database --- 
    let dbSaveResult = { success: false, message: "DB save not attempted." };
    if (frontUploadSuccess || backUploadSuccess) { // Only attempt DB save if at least one video uploaded
      dbSaveResult = await saveVideoKeysToDatabase(frontS3Key, backS3Key);
    }

    setIsUploading(false);

    // --- Final Alerting --- 
    let alertMessage = "";
    if (frontIdVideoDataUrl && backIdVideoDataUrl) { // Both were attempted
        if (frontUploadSuccess && backUploadSuccess) alertMessage = `Both videos uploaded successfully!\nFront Key: ${frontS3Key}\nBack Key: ${backS3Key}`;
        else if (frontUploadSuccess) alertMessage = `Front video uploaded (Key: ${frontS3Key}). Back video failed.`;
        else if (backUploadSuccess) alertMessage = `Back video uploaded (Key: ${backS3Key}). Front video failed.`;
        else alertMessage = "Both video uploads failed.";
    } else if (frontIdVideoDataUrl) { // Only front was attempted
        alertMessage = frontUploadSuccess ? `Front video uploaded successfully! Key: ${frontS3Key}` : "Front video upload failed.";
    } else if (backIdVideoDataUrl) { // Only back was attempted
        alertMessage = backUploadSuccess ? `Back video uploaded successfully! Key: ${backS3Key}` : "Back video upload failed.";
    } else {
        alertMessage = "No videos were provided to upload."; 
    }

    if (frontUploadSuccess || backUploadSuccess) {
        alertMessage += `\n\nDatabase save: ${dbSaveResult.success ? "Success" : "Failed (" + dbSaveResult.message + ")"}`;
    }
    
    // Add a general instruction to check console if any part failed
    if (!frontUploadSuccess || !backUploadSuccess || ( (frontUploadSuccess || backUploadSuccess) && !dbSaveResult.success)) {
        alertMessage += "\n(Check console for more error details if any step failed.)";
    }

    alert(alertMessage);
  };

  const handleConfirmAndProceed = async () => {
    setIsProcessingConfirmation(true);

    // Check if there are videos to upload. This check is also in the button's disabled logic.
    if (frontIdVideoDataUrl || backIdVideoDataUrl) {
      // Await the upload attempt. Proceed regardless of its internal success/failure,
      // but after it has completed its execution (including any alerts).
      await handleDirectS3Upload(); 
    } else {
      // This case should ideally not be reached if the button is disabled when no videos.
      // If it can be reached, logging is appropriate.
      console.log("No videos available to upload. Proceeding to verification.");
    }
    
    // Proceed to face verification step by calling handleSubmit.
    await handleSubmit(); 

    // No need to set setIsProcessingConfirmation(false) as the step will change,
    // effectively removing this button or this part of the component.
  };

  const saveRegistration = async () => {
    if (!email || !password || !faceVerified) {
      return;
    }

    let frontVideoS3Key = null;
    let backVideoS3Key = null;
    const videoFileType = 'video/mp4'; // Determined from previous logs

    setIsUploading(true); // Use a general uploading/processing state
    

    try {
      // Upload Front ID Video to S3 if it exists
      const frontVideoBlob = dataURLtoBlob(frontIdVideoDataUrl);
      if (frontVideoBlob) {
        
        const presignedResponseFront = await fetch('/api/generate-s3-upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileType: videoFileType }),
        });
        const presignedDataFront = await presignedResponseFront.json();

        if (!presignedResponseFront.ok || !presignedDataFront.success) {
          throw new Error(presignedDataFront.error || "Failed to get S3 pre-signed URL for front video");
        }
        

        const formDataFront = new FormData();
        Object.entries(presignedDataFront.fields).forEach(([key, value]) => {
          formDataFront.append(key, value);
        });
        formDataFront.append("file", frontVideoBlob);

        
        const s3UploadResponseFront = await fetch(presignedDataFront.url, {
          method: 'POST',
          body: formDataFront,
        });

        if (!s3UploadResponseFront.ok) {
          const errorText = await s3UploadResponseFront.text();
          
          throw new Error(`S3 upload failed for front video: ${s3UploadResponseFront.status}`);
        }
        frontVideoS3Key = presignedDataFront.key;
        
      } else if (frontIdVideoDataUrl) {
        
      }

      // Upload Back ID Video to S3 if it exists
      const backVideoBlob = dataURLtoBlob(backIdVideoDataUrl);
      if (backVideoBlob) {
        
        const presignedResponseBack = await fetch('/api/generate-s3-upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileType: videoFileType }),
        });
        const presignedDataBack = await presignedResponseBack.json();

        if (!presignedResponseBack.ok || !presignedDataBack.success) {
          throw new Error(presignedDataBack.error || "Failed to get S3 pre-signed URL for back video");
        }
        

        const formDataBack = new FormData();
        Object.entries(presignedDataBack.fields).forEach(([key, value]) => {
          formDataBack.append(key, value);
        });
        formDataBack.append("file", backVideoBlob);

        
        const s3UploadResponseBack = await fetch(presignedDataBack.url, {
          method: 'POST',
          body: formDataBack,
        });

        if (!s3UploadResponseBack.ok) {
          const errorText = await s3UploadResponseBack.text();
          
          throw new Error(`S3 upload failed for back video: ${s3UploadResponseBack.status}`);
        }
        backVideoS3Key = presignedDataBack.key;
        
      } else if (backIdVideoDataUrl) {
        
      }

      // Now save registration with S3 keys
      
      const regResponse = await fetch('/api/save-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email, 
          password,
          idDetails: combinedIdDetails,
          frontIdVideoS3Key: frontVideoS3Key, // Send S3 key
          backIdVideoS3Key: backVideoS3Key    // Send S3 key
        })
      });
      
      const regData = await regResponse.json();
      
      if (regResponse.ok && regData.success) {
        
        
        // Attempt to login the user automatically
        try {
          const loginResponse = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          const loginData = await loginResponse.json();

          if (loginResponse.ok && loginData.success) {
            
            setUserData(loginData); // Use login data to set the user session
            if (loginData.isAdmin) {
              handleFlip("adminDashboard", "right");
            } else {
              handleFlip("loggedIn", "right"); // Go to the loggedIn step (dashboard)
            }
          } else {
            
            alert("Registration was successful, but auto-login failed. Please try logging in manually.");
            handleFlip("form", "left"); // Go back to form if auto-login fails
          }
        } catch (loginError) {
          
          alert("Registration was successful, but an error occurred during auto-login. Please try logging in manually.");
          handleFlip("form", "left"); // Go back to form if auto-login fails
        }

      } else if (regData.code === 'USER_EXISTS') {
        alert("This email is already registered. Please log in instead.");
        handleFlip("form", "left");
      } else {
        alert("Error saving registration: " + (regData.error || "Unknown error"));
      }
    } catch (error) {
      
      
      setIsUploading(false);
      alert("A network error occurred, or the system was unable to save your registration. Please check your connection and try again. If the problem persists, note any error messages from the on-screen log.");
    } finally {
      setIsUploading(false); // Ensure this is always called
    }
  };

  return (
    <div
      ref={containerRef}
      className={`p-6 ${step === "adminDashboard" ? "max-w-[75%]" : "max-w-md"} mx-auto bg-gradient-to-br from-gray-100 to-gray-300 rounded-3xl shadow-xl transition-transform duration-300 relative border border-gray-300 will-change-transform`}
    >
      <style>{`button { border-radius: 10px !important; }`}</style>
      
      {/* On-screen debug log window */}
      <div style={{
        position: 'fixed',
        top: '10px',
        left: '10px',
        width: '300px',
        height: '200px',
        backgroundColor: 'rgba(0,0,0,0.7)',
        color: 'white',
        padding: '5px',
        overflowY: 'scroll',
        fontSize: '10px',
        zIndex: 9999,
        borderRadius: '5px',
        border: '1px solid #ccc'
      }}>
        <h4 style={{ margin: '0 0 5px 0', borderBottom: '1px solid #555', paddingBottom: '3px' }}>Event Log</h4>
        {debugLogs.map((log, index) => (
          <div key={index} style={{ marginBottom: '3px', wordBreak: 'break-all', color: log.type === 'error' ? 'red' : log.type === 'warn' ? 'yellow' : 'white' }}>
            <strong>[{log.timestamp}]</strong> ({log.type}): {log.message}
          </div>
        ))}
      </div>

      {step === "form" && (
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-gray-800">Register or Login</h2>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full p-2 border border-gray-300 rounded-lg"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full p-2 border border-gray-300 rounded-lg"
            required
          />
          
          {loginError && (
            <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {loginError}
            </div>
          )}
          
          <div className="flex justify-center">
            <button
              onClick={handleFormSubmit}
              disabled={isCheckingUser}
              className={`${
                isCheckingUser 
                  ? "bg-gray-400 cursor-not-allowed" 
                  : "bg-yellow-400 hover:bg-yellow-300"
              } text-black px-6 py-2 rounded-full shadow-md`}
            >
              {isCheckingUser ? "Checking..." : "Continue"}
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

      {step === "cameraBack" && (
        <div className="text-center space-y-4">
          <h2 className="text-lg font-medium text-gray-700">
            Capture ID Back
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
              onClick={captureBackPhoto}
              className="bg-yellow-400 hover:bg-yellow-300 text-black px-4 py-2 rounded-full shadow-md"
            >
              Capture Back
            </button>

            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleBackFileUpload}
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
          
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative w-full h-44 bg-gray-300 flex items-center justify-center rounded overflow-hidden">
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
            </div>
            
            <div className="flex-1">
              <div className="relative w-full h-44 bg-gray-300 flex items-center justify-center rounded overflow-hidden">
                {photoBack ? (
                  <img
                    src={photoBack}
                    alt="Back of ID"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-gray-600 text-lg">Photo Missing</span>
                )}
              </div>
              <div className="text-sm text-gray-500 font-medium pt-1">
                Back of ID
              </div>
            </div>
          </div>
          
          <div className="mt-4 text-xs text-gray-600">
            {combinedIdDetails ? (
              <div>
                <p>
                  <strong>Name:</strong> {combinedIdDetails.name} {combinedIdDetails.fatherName}
                </p>
                <p>
                  <strong>ID No:</strong> {combinedIdDetails.idNumber}
                </p>
                <p>
                  <strong>Expiry:</strong> {combinedIdDetails.expiry}
                </p>
                <p>
                  <strong>Date of Birth:</strong> {combinedIdDetails.dateOfBirth}
                </p>
              </div>
            ) : isExtracting ? (
              <div className="flex flex-col items-center justify-center">
                <p>Scanning ID details...</p>
                <div className="mt-2 w-8 h-8 border-2 border-gray-300 border-t-yellow-400 rounded-full animate-spin"></div>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (!idDetails && !backIdDetails) {
                    extractIdDetails(photoFront, true).then(frontDetails => {
                      setIdDetails(frontDetails);
                      extractIdDetails(photoBack, true).then(backDetails => {
                        setBackIdDetails(backDetails);
                        
                        const combined = {};
                        const allKeys = [...new Set([...Object.keys(frontDetails), ...Object.keys(backDetails)])];
                        
                        allKeys.forEach(key => {
                          const frontValue = frontDetails[key];
                          const backValue = backDetails[key];
                          
                          if (frontValue && frontValue !== "Not found") {
                            combined[key] = frontValue;
                          } else if (backValue && backValue !== "Not found") {
                            combined[key] = backValue;
                          } else {
                            combined[key] = frontValue || backValue || "Not found";
                          }
                        });
                        
                        setCombinedIdDetails(combined);
                        console.log("Combined ID Details:", combined);
                      });
                    });
                  }
                }}
                className="px-4 py-1 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-full text-xs"
              >
                Scan ID Details
              </button>
            )}
          </div>
          <div className="flex justify-center gap-4 pt-2">
            <button
              onClick={() => {
                setPhotoFront(null);
                setPhotoBack(null);
                setIdDetails(null);
                setBackIdDetails(null);
                setCombinedIdDetails(null);
                // Reset video URLs when retaking photos, as they are linked to the photo capture session
                setFrontIdVideoDataUrl(null);
                setBackIdVideoDataUrl(null);
                retakePhoto();
              }}
              className="px-5 py-2 bg-gray-800 text-white hover:bg-gray-700 transition shadow-md"
            >
              Retake Photos
            </button>
            <button
              onClick={handleConfirmAndProceed}
              disabled={isProcessingConfirmation || (!frontIdVideoDataUrl && !backIdVideoDataUrl)}
              className={`px-6 py-2 text-black transition shadow-md ${
                (isProcessingConfirmation || (!frontIdVideoDataUrl && !backIdVideoDataUrl))
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-yellow-400 hover:bg-yellow-300"
              }`}
            >
              {isProcessingConfirmation ? "Processing..." : "Confirm & Proceed to Verification"}
            </button>
          </div>
        </div>
      )}

      {step === "verification" && renderVerificationStepContent()}

      {step === "registrationFailed" && (
        <div className="text-center space-y-6">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-2xl font-semibold text-gray-800">
            Registration Failed
          </h2>
          <p className="text-gray-600">
            We were unable to verify your identity.
          </p>
          <p className="text-sm text-red-600">
            Your face could not be matched with your ID document.
          </p>
          <button
            onClick={() => handleFlip("form", "left")}
            className="px-8 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg shadow-md"
          >
            Try Again
          </button>
        </div>
      )}

      {step === "success" && (
        <div className="text-center space-y-6">
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
      
      {step === "loggedIn" && (
        <div className="text-center space-y-6">
          <h2 className="text-2xl font-semibold text-gray-800">
            Welcome
          </h2>
          <p className="text-gray-600">
            You are registered in our system.
          </p>
          
          {userData && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h3 className="text-lg font-medium text-gray-800 mb-2">Your Details</h3>
              <div className="text-sm text-left space-y-1">
                <p><span className="font-medium">Email:</span> {userData.email}</p>
                
                {userData.idDetails && (
                  <>
                    {/* Given Name from idDetails */}
                    {userData.idDetails.name && userData.idDetails.name !== "Not found" &&
                      <p><span className="font-medium">Given Name:</span> {userData.idDetails.name}</p>
                    }

                    {/* Surname from idDetails (using fatherName field) */}
                    {userData.idDetails.fatherName && userData.idDetails.fatherName !== "Not found" &&
                      <p><span className="font-medium">Surname:</span> {userData.idDetails.fatherName}</p>
                    }

                    {/* ID Number from idDetails */}
                    {userData.idDetails.idNumber && userData.idDetails.idNumber !== "Not found" &&
                      <p><span className="font-medium">ID Number:</span> {userData.idDetails.idNumber}</p>}

                    {/* Date of Birth from idDetails */}
                    {userData.idDetails.dateOfBirth && userData.idDetails.dateOfBirth !== "Not found" &&
                      <p><span className="font-medium">Date of Birth:</span> {userData.idDetails.dateOfBirth}</p>}

                    {/* Expiry Date from idDetails */}
                    {userData.idDetails.expiry && userData.idDetails.expiry !== "Not found" &&
                      <p><span className="font-medium">Expiry Date:</span> {userData.idDetails.expiry}</p>}

                    {/* Nationality from idDetails */}
                    {userData.idDetails.nationality && userData.idDetails.nationality !== "Not found" &&
                      <p><span className="font-medium">Nationality:</span> {userData.idDetails.nationality}</p>}

                    {/* Gender from idDetails */}
                    {userData.idDetails.gender && userData.idDetails.gender !== "Not found" &&
                      <p><span className="font-medium">Gender:</span> {userData.idDetails.gender}</p>}

                    {/* Issue Date from idDetails */}
                    {userData.idDetails.issueDate && userData.idDetails.issueDate !== "Not found" &&
                      <p><span className="font-medium">Issue Date:</span> {userData.idDetails.issueDate}</p>}
                  </>
                )}
                
                <p><span className="font-medium">Status:</span> {userData.status || "Verified"}</p>
              </div>
            </div>
          )}
          
          <button
            onClick={() => window.location.href = "/dashboard"}
            className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-md"
          >
            Go to Login
          </button>
        </div>
      )}

      {step === "adminDashboard" && (
        <AdminDashboard />
      )}
      
      <canvas ref={canvasRef} className="hidden" />
      <input type="file" ref={fileInputRef} accept="image/*" onChange={handleFileUpload} className="hidden" />
    </div>
  );
}
