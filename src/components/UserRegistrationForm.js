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

  const logToScreen = (message, type = 'log') => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLogs(prevLogs => [{ timestamp, type, message: String(message) }, ...prevLogs.slice(0, 49)]);
    // Also log to console for easier debugging during development if not on phone
    if (type === 'error') console.error(`[${timestamp}] ${message}`);
    else if (type === 'warn') console.warn(`[${timestamp}] ${message}`);
    else console.log(`[${timestamp}] ${message}`);
  };

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
      logToScreen(`Error converting DataURL to Blob: ${e}`, 'error');
      return null;
    }
  };

  const blobToDataURL = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        logToScreen("Blob converted to DataURL successfully.");
        resolve(reader.result);
      };
      reader.onerror = (error) => {
        logToScreen("Error converting blob to DataURL: " + error, 'error');
        reject(error);
      };
      reader.readAsDataURL(blob);
      logToScreen("Starting blob to DataURL conversion.");
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
        logToScreen("[form] User logged in successfully: " + JSON.stringify(data));
        setUserData(data);
        if (data.isAdmin) {
          handleFlip("adminDashboard", "right");
        } else {
          handleFlip("loggedIn", "right");
        }
      } else if (data.code === 'EMAIL_NOT_FOUND') {
        logToScreen("[form] User doesn't exist, continuing with registration");
        handleFlip("camera", "right");
      } else if (data.code === 'INCORRECT_PASSWORD') {
        setLoginError("Incorrect password");
      } else {
        setLoginError(data.error || "Login failed");
        logToScreen("Login failed: " + (data.error || "Unknown error"), 'error');
      }
    } catch (error) {
      logToScreen("Error checking user: " + error, 'error');
      setLoginError("Network error, please try again");
    } finally {
      setIsCheckingUser(false);
    }
  };

  const capturePhoto = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      logToScreen("Front ID: MediaRecorder is active and recording. Setting up onstop.");
      mediaRecorderRef.current.onstop = async () => {
        logToScreen("Front ID: MediaRecorder onstop triggered.");
        const videoBlob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        logToScreen(`Front ID: Video blob size: ${videoBlob.size} bytes. Chunks count: ${recordedChunksRef.current.length}`);

        if (videoBlob.size > 0) {
          try {
            const videoDataUrl = await blobToDataURL(videoBlob);
            setFrontIdVideoDataUrl(videoDataUrl);
            logToScreen("Front ID video recorded and DataURL set successfully.");
          } catch (error) {
            logToScreen("Error converting front ID video blob to DataURL: " + error, 'error');
            setFrontIdVideoDataUrl(null);
          }
        } else {
          logToScreen("Front ID video blob was empty. Setting video URL to null.", 'warn');
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
      logToScreen("Front ID: MediaRecorder.stop() called.");
    } else {
      logToScreen(`Front ID: MediaRecorder not active or available. MediaRecorder instance: ${mediaRecorderRef.current}, State: ${mediaRecorderRef.current ? mediaRecorderRef.current.state : 'N/A'}. No video will be saved.`, 'warn');
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
      logToScreen("Back ID: MediaRecorder is active and recording. Setting up onstop.");
      mediaRecorderRef.current.onstop = async () => {
        logToScreen("Back ID: MediaRecorder onstop triggered.");
        const videoBlob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        logToScreen(`Back ID: Video blob size: ${videoBlob.size} bytes. Chunks count: ${recordedChunksRef.current.length}`);

        if (videoBlob.size > 0) {
          try {
            const videoDataUrl = await blobToDataURL(videoBlob);
            setBackIdVideoDataUrl(videoDataUrl);
            logToScreen("Back ID video recorded and DataURL set successfully.");
          } catch (error) {
            logToScreen("Error converting back ID video blob to DataURL: " + error, 'error');
            setBackIdVideoDataUrl(null);
          }
        } else {
          logToScreen("Back ID video blob was empty. Setting video URL to null.", 'warn');
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
      logToScreen("Back ID: MediaRecorder.stop() called.");
    } else {
      logToScreen(`Back ID: MediaRecorder not active or available. MediaRecorder instance: ${mediaRecorderRef.current}, State: ${mediaRecorderRef.current ? mediaRecorderRef.current.state : 'N/A'}. No video will be saved.`, 'warn');
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
    logToScreen("Front ID video set to null due to file upload.");

    try {
      setIsUploading(true);
      const reader = new FileReader();
      reader.onload = (e) => {
        setPhotoFront(e.target.result);
        handleFlip("cameraBack", "right");
      };
      reader.readAsDataURL(file);
    } catch (error) {
      logToScreen("Error processing image: " + error, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleBackFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // If a file is uploaded, no video is recorded via camera for this side.
    setBackIdVideoDataUrl(null);
    logToScreen("Back ID video set to null due to file upload.");

    try {
      setIsUploading(true);
      const reader = new FileReader();
      reader.onload = (e) => {
        setPhotoBack(e.target.result);
        handleFlip("completed", "right");
      };
      reader.readAsDataURL(file);
    } catch (error) {
      logToScreen("Error processing image: " + error, 'error');
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
    logToScreen(`[${currentStep}] Attempting to start camera. Facing: ${facing}, Target: ${targetRef === videoRef ? 'videoRef' : 'faceVideoRef'}`);
    
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
        logToScreen(`[${currentStep}] Camera started successfully. Stream ID: ${stream.id}`);

        // Start MediaRecorder if this is for ID capture (not face verification)
        if ((currentStep === "camera" || currentStep === "cameraBack") && window.MediaRecorder) {
          recordedChunksRef.current = []; // Clear previous chunks
          try {
            const MimeTypesToTry = [
              'video/webm;codecs=vp9',
              'video/webm;codecs=vp8',
              'video/webm',
              'video/mp4;codecs=h264', // May not be widely supported for recording
              'video/mp4'             // May not be widely supported for recording
            ];
            let supportedMimeType = '';

            for (const mimeType of MimeTypesToTry) {
              if (MediaRecorder.isTypeSupported(mimeType)) {
                supportedMimeType = mimeType;
                logToScreen(`[${currentStep}] Supported MIME type found: ${supportedMimeType}`);
                break;
              }
              logToScreen(`[${currentStep}] MIME type not supported: ${mimeType}`, 'warn');
            }

            if (!supportedMimeType) {
              logToScreen(`[${currentStep}] No supported MIME type found for MediaRecorder. Video recording will be disabled for this step.`, 'error');
              mediaRecorderRef.current = null;
              return; // Exit if no supported MIME type
            }

            mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: supportedMimeType });
            mediaRecorderRef.current.ondataavailable = (event) => {
              if (event.data.size > 0) {
                recordedChunksRef.current.push(event.data);
                logToScreen(`[${currentStep}] MediaRecorder data available. Chunk size: ${event.data.size}. Total chunks: ${recordedChunksRef.current.length}`);
              } else {
                logToScreen(`[${currentStep}] MediaRecorder data available, but chunk size is 0.`, 'warn');
              }
            };
            mediaRecorderRef.current.onstart = () => {
              logToScreen(`[${currentStep}] MediaRecorder started successfully. State: ${mediaRecorderRef.current.state}, MIMEType: ${supportedMimeType}`);
            };
            mediaRecorderRef.current.onstop = () => {
              logToScreen(`[${currentStep}] MediaRecorder stopped. State: ${mediaRecorderRef.current.state}. Chunks collected: ${recordedChunksRef.current.length}`);
            };
            mediaRecorderRef.current.onerror = (event) => {
              logToScreen(`[${currentStep}] MediaRecorder error: ` + JSON.stringify(event.error || event), 'error');
            };
            mediaRecorderRef.current.start();
            logToScreen(`[${currentStep}] MediaRecorder.start() called. Current state: ${mediaRecorderRef.current.state}`);
          } catch (e) {
            logToScreen(`[${currentStep}] Error initializing MediaRecorder: ` + e, 'error');
            mediaRecorderRef.current = null;
          }
        } else if (currentStep === "camera" || currentStep === "cameraBack") {
          logToScreen(`[${currentStep}] MediaRecorder API not available in this browser.`, 'warn');
        }
      })
      .catch((err) => {
        setCameraAvailable(false);
        setCameraStatus("error");
        setMockMode(false);
        logToScreen(`[${currentStep}] Error starting camera: ` + err, 'error');
      });
  };

  const stopCamera = () => {
    logToScreen("stopCamera called.");
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.onstop = null; // Remove any existing onstop handler
      mediaRecorderRef.current.stop();
      recordedChunksRef.current = []; // Clear chunks as we are not saving this video
      logToScreen("MediaRecorder was recording, now stopped by stopCamera. Chunks cleared.");
    } else if (mediaRecorderRef.current) {
      logToScreen(`MediaRecorder was not recording (state: ${mediaRecorderRef.current.state}), but instance exists. Clearing ref.`, 'warn');
    }
    mediaRecorderRef.current = null;

    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      logToScreen("Media stream tracks stopped.");
    } else {
      logToScreen("No active media stream to stop.", 'warn');
    }
  };

  // New function to only stop media tracks, without affecting MediaRecorder state
  const stopMediaTracks = () => {
    logToScreen("stopMediaTracks called.");
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      logToScreen("Media stream tracks stopped (by stopMediaTracks).");
    } else {
      logToScreen("No active media stream to stop (by stopMediaTracks).", 'warn');
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
    logToScreen("Photo and video states reset for retake.");

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
        logToScreen("[completed] Extracted Front ID Details:" + JSON.stringify(frontDetails));
        setIdDetails(frontDetails);
        
        extractIdDetails(photoBack, true).then((backDetails) => {
          logToScreen("[completed] Extracted Back ID Details:" + JSON.stringify(backDetails));
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
      logToScreen("[useEffect] Step changed to 'camera'. Starting camera for front ID.");
      startCamera("environment", videoRef);
    }
    if (step === "cameraBack") {
      logToScreen("[useEffect] Step changed to 'cameraBack'. Starting camera for back ID.");
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

  const saveRegistration = async () => {
    if (!email || !password || !faceVerified) {
      logToScreen("Cannot save registration - missing required data (email, password, or faceVerified).", 'error');
      return;
    }

    logToScreen(`Initial check - Front video URL length: ${frontIdVideoDataUrl ? frontIdVideoDataUrl.length : '0'}. Back video URL length: ${backIdVideoDataUrl ? backIdVideoDataUrl.length : '0'}`);
    
    let frontVideoS3Key = null;
    let backVideoS3Key = null;
    const videoFileType = 'video/mp4'; // Determined from previous logs

    setIsUploading(true); // Use a general uploading/processing state
    logToScreen("Starting registration save process including S3 uploads...");

    try {
      // Upload Front ID Video to S3 if it exists
      const frontVideoBlob = dataURLtoBlob(frontIdVideoDataUrl);
      if (frontVideoBlob) {
        logToScreen("Front video blob created. Requesting S3 pre-signed URL...");
        const presignedResponseFront = await fetch('/api/generate-s3-upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileType: videoFileType }),
        });
        const presignedDataFront = await presignedResponseFront.json();

        if (!presignedResponseFront.ok || !presignedDataFront.success) {
          throw new Error(presignedDataFront.error || "Failed to get S3 pre-signed URL for front video");
        }
        logToScreen(`S3 pre-signed URL obtained for front video. Key: ${presignedDataFront.key}`);

        const formDataFront = new FormData();
        Object.entries(presignedDataFront.fields).forEach(([key, value]) => {
          formDataFront.append(key, value);
        });
        formDataFront.append("file", frontVideoBlob);

        logToScreen("Attempting S3 fetch for front video...");
        const s3UploadResponseFront = await fetch(presignedDataFront.url, {
          method: 'POST',
          body: formDataFront,
        });
        logToScreen(`S3 fetch for front video completed. Status: ${s3UploadResponseFront.status}`);

        if (!s3UploadResponseFront.ok) {
          const errorText = await s3UploadResponseFront.text();
          logToScreen(`S3 Upload Error (Front Video): ${s3UploadResponseFront.status} - ${errorText}`, 'error')
          throw new Error(`S3 upload failed for front video: ${s3UploadResponseFront.status}`);
        }
        frontVideoS3Key = presignedDataFront.key;
        logToScreen(`Front video successfully uploaded to S3. Key: ${frontVideoS3Key}`);
      } else if (frontIdVideoDataUrl) {
        logToScreen("Front video DataURL existed but failed to convert to Blob.", 'warn');
      }

      // Upload Back ID Video to S3 if it exists
      const backVideoBlob = dataURLtoBlob(backIdVideoDataUrl);
      if (backVideoBlob) {
        logToScreen("Back video blob created. Requesting S3 pre-signed URL...");
        const presignedResponseBack = await fetch('/api/generate-s3-upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileType: videoFileType }),
        });
        const presignedDataBack = await presignedResponseBack.json();

        if (!presignedResponseBack.ok || !presignedDataBack.success) {
          throw new Error(presignedDataBack.error || "Failed to get S3 pre-signed URL for back video");
        }
        logToScreen(`S3 pre-signed URL obtained for back video. Key: ${presignedDataBack.key}`);

        const formDataBack = new FormData();
        Object.entries(presignedDataBack.fields).forEach(([key, value]) => {
          formDataBack.append(key, value);
        });
        formDataBack.append("file", backVideoBlob);

        logToScreen("Attempting S3 fetch for back video...");
        const s3UploadResponseBack = await fetch(presignedDataBack.url, {
          method: 'POST',
          body: formDataBack,
        });
        logToScreen(`S3 fetch for back video completed. Status: ${s3UploadResponseBack.status}`);

        if (!s3UploadResponseBack.ok) {
          const errorText = await s3UploadResponseBack.text();
          logToScreen(`S3 Upload Error (Back Video): ${s3UploadResponseBack.status} - ${errorText}`, 'error')
          throw new Error(`S3 upload failed for back video: ${s3UploadResponseBack.status}`);
        }
        backVideoS3Key = presignedDataBack.key;
        logToScreen(`Back video successfully uploaded to S3. Key: ${backVideoS3Key}`);
      } else if (backIdVideoDataUrl) {
        logToScreen("Back video DataURL existed but failed to convert to Blob.", 'warn');
      }

      // Now save registration with S3 keys
      logToScreen("Proceeding to save registration data to backend with S3 keys...");
      logToScreen(`Data for save-registration: email, idDetails, frontS3Key: ${frontVideoS3Key}, backS3Key: ${backVideoS3Key}`); // Log data being sent
      
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
        logToScreen("Registration saved successfully with S3 keys. Now attempting to log in.");
        
        // Attempt to login the user automatically
        try {
          const loginResponse = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          const loginData = await loginResponse.json();

          if (loginResponse.ok && loginData.success) {
            logToScreen("Auto-login after registration successful:" + JSON.stringify(loginData));
            setUserData(loginData); // Use login data to set the user session
            if (loginData.isAdmin) {
              handleFlip("adminDashboard", "right");
            } else {
              handleFlip("loggedIn", "right"); // Go to the loggedIn step (dashboard)
            }
          } else {
            logToScreen("Auto-login after registration failed: " + (loginData.error || "Unknown error"), 'error');
            alert("Registration was successful, but auto-login failed. Please try logging in manually.");
            handleFlip("form", "left"); // Go back to form if auto-login fails
          }
        } catch (loginError) {
          logToScreen("Error during auto-login after registration: " + loginError, 'error');
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
      logToScreen("Error during S3 upload or saving registration: " + error.toString(), 'error');
      logToScreen("Full error object: " + JSON.stringify(error, Object.getOwnPropertyNames(error)), 'error');
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
                retakePhoto();
              }}
              className="px-5 py-2 bg-gray-800 text-white hover:bg-gray-700 transition shadow-md"
            >
              Retake Photos
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
