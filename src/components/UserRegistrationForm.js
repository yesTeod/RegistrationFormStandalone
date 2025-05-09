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
  const [s3FrontKey, setS3FrontKey] = useState(null);
  const [s3BackKey, setS3BackKey] = useState(null);
  const [selfieVideoDataUrl, setSelfieVideoDataUrl] = useState(null);
  const [s3SelfieKey, setS3SelfieKey] = useState(null);

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
  const selfieMediaRecorderRef = useRef(null);
  const selfieRecordedChunksRef = useRef([]);
  const selfieVideoTimerIdRef = useRef(null);

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
        mediaRecorderRef.current = null;

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
        stopMediaTracks();
        handleFlip("cameraBack", "right");
      };
      mediaRecorderRef.current.stop();
    } else {
      setFrontIdVideoDataUrl(null);
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
      stopMediaTracks();
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
        mediaRecorderRef.current = null;

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
        stopMediaTracks();
        handleFlip("completed", "right");
      };
      mediaRecorderRef.current.stop();
    } else {
      setBackIdVideoDataUrl(null);
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
      stopMediaTracks();
      handleFlip("completed", "right");
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

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
                break;
              }
            }

            if (!supportedMimeType) {
              mediaRecorderRef.current = null;
              return; // Exit if no supported MIME type
            }

            mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: supportedMimeType });
            mediaRecorderRef.current.ondataavailable = (event) => {
              if (event.data.size > 0) {
                recordedChunksRef.current.push(event.data);
              }
            };
            mediaRecorderRef.current.onstart = () => {
            };
            mediaRecorderRef.current.onstop = () => {
            };
            mediaRecorderRef.current.onerror = (event) => {
            };
            mediaRecorderRef.current.start();
          } catch (e) {
            mediaRecorderRef.current = null;
          }
        }
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
    }
  };

  // New function to only stop media tracks, without affecting MediaRecorder state
  const stopMediaTracks = () => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
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
    setS3FrontKey(null);
    setS3BackKey(null);
    setSelfieVideoDataUrl(null);
    setS3SelfieKey(null);

    // Stop and clear any ongoing selfie video recording
    if (selfieMediaRecorderRef.current && selfieMediaRecorderRef.current.state === "recording") {
      selfieMediaRecorderRef.current.stop();
      selfieMediaRecorderRef.current.onstop = null; // Prevent any pending onstop from firing
    }
    clearTimeout(selfieVideoTimerIdRef.current);
    selfieRecordedChunksRef.current = [];

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
    setS3FrontKey(null);
    setS3BackKey(null);
    setSelfieVideoDataUrl(null);
    setS3SelfieKey(null);
    if (selfieMediaRecorderRef.current && selfieMediaRecorderRef.current.state !== "inactive") {
        // If a recorder exists and is not inactive, stop it and clear handlers/chunks
        selfieMediaRecorderRef.current.onstop = null;
        selfieMediaRecorderRef.current.ondataavailable = null;
        if (selfieMediaRecorderRef.current.state === "recording") {
            selfieMediaRecorderRef.current.stop();
        }
    }
    clearTimeout(selfieVideoTimerIdRef.current);
    selfieRecordedChunksRef.current = [];
    selfieMediaRecorderRef.current = null; // Ensure it's fully reset for the new session

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
    // Reset selfie video related states and stop/clear any recording artifacts
    setSelfieVideoDataUrl(null);
    setS3SelfieKey(null);
    if (selfieMediaRecorderRef.current && selfieMediaRecorderRef.current.state !== "inactive") {
        selfieMediaRecorderRef.current.onstop = null;
        selfieMediaRecorderRef.current.ondataavailable = null;
        if (selfieMediaRecorderRef.current.state === "recording") {
            selfieMediaRecorderRef.current.stop();
        }
    }
    clearTimeout(selfieVideoTimerIdRef.current);
    selfieRecordedChunksRef.current = [];
    selfieMediaRecorderRef.current = null; // Ensure it's fully reset for the new session
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

  useEffect(() => {
    if (step === 'verification' && faceVideoRef.current && faceVideoRef.current.srcObject && window.MediaRecorder) {
      const stream = faceVideoRef.current.srcObject;
      if (!stream || stream.getTracks().length === 0) {
        return;
      }

      // Use the same MIME type detection as in startCamera
      const MimeTypesToTry = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4;codecs=h264',
        'video/mp4'
      ];
      let supportedMimeType = '';
      for (const mimeType of MimeTypesToTry) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          supportedMimeType = mimeType;
          break;
        }
      }

      if (!supportedMimeType) {
        console.warn("[UserRegForm] Selfie video recording: No supported MIME type found.");
        selfieMediaRecorderRef.current = null;
        return;
      }

      selfieRecordedChunksRef.current = []; // Clear previous chunks
      try {
        selfieMediaRecorderRef.current = new MediaRecorder(stream, { mimeType: supportedMimeType });

        selfieMediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0) {
            selfieRecordedChunksRef.current.push(event.data);
          }
        };

        selfieMediaRecorderRef.current.onstop = async () => {
          const videoBlob = new Blob(selfieRecordedChunksRef.current, { type: supportedMimeType });
          if (videoBlob.size > 0) {
            try {
              const videoDataUrl = await blobToDataURL(videoBlob);
              setSelfieVideoDataUrl(videoDataUrl);
            } catch (error) {
              setSelfieVideoDataUrl(null);
            }
          } else {
            setSelfieVideoDataUrl(null);
          }
          // Do not clear chunks here, allow them to be used for upload
        };

        selfieMediaRecorderRef.current.onerror = (event) => {
          setSelfieVideoDataUrl(null);
        };

        selfieMediaRecorderRef.current.start();

        // Set a 5-second timer to stop the recording
        selfieVideoTimerIdRef.current = setTimeout(() => {
          if (selfieMediaRecorderRef.current && selfieMediaRecorderRef.current.state === "recording") {
            selfieMediaRecorderRef.current.stop();
          }
        }, 5000);

      } catch (e) {
        selfieMediaRecorderRef.current = null;
        setSelfieVideoDataUrl(null);
      }
    }

    return () => {
      // Cleanup: stop recorder and clear timer when component unmounts or step changes
      clearTimeout(selfieVideoTimerIdRef.current);
      if (selfieMediaRecorderRef.current && selfieMediaRecorderRef.current.state === "recording") {
        selfieMediaRecorderRef.current.stop();
      }
      // Don't clear selfieRecordedChunksRef.current here, as onstop might still need it briefly
      // And we need it for the upload later.
    };
  }, [step, cameraStatus]); // Re-run if step changes or cameraStatus changes (indicating new stream)

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
      setFaceVerified(false);
      setVerificationAttempts(prev => prev + 1);
      setShowRetryOptions(true);
    } finally {
      setVerifying(false);
      // Ensure selfie video recording is stopped and timer is cleared
      clearTimeout(selfieVideoTimerIdRef.current);
      if (selfieMediaRecorderRef.current && selfieMediaRecorderRef.current.state === "recording") {
        selfieMediaRecorderRef.current.stop(); // This will trigger its onstop to set selfieVideoDataUrl
      }
    }
  };

  const handleVerificationComplete = async () => {
    if (faceVerified) {
      // If face is verified, attempt to upload selfie video before saving registration
      if (selfieVideoDataUrl) {
        setIsUploading(true); // Indicate upload activity
        console.log("[UserRegForm] Processing selfie video for S3...");
        const selfieResult = await processVideoForS3(selfieVideoDataUrl, 'selfie', email);
        if (selfieResult.success && selfieResult.s3Key) {
          setS3SelfieKey(selfieResult.s3Key);
          console.log("[UserRegForm] Selfie video S3 upload successful. Key:", selfieResult.s3Key);
        } else {
          console.warn("[UserRegForm] Selfie video S3 upload failed or no key returned.");
          // Decide if this failure is critical. For now, proceed with registration.
        }
        setIsUploading(false);
      } else {
        console.log("[UserRegForm] No selfie video data to upload.");
      }
      // Save the registration with ID details (and potentially selfie S3 key if backend handles it via email association)
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
      }
      return data;
    } catch (error) {
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

  const processVideoForS3 = async (videoDataUrl, idSideForAPI, emailForAPI) => {
    if (!videoDataUrl) {
      console.log(`[UserRegForm] No video data URL provided for ${idSideForAPI}, skipping.`);
      return { success: false, s3Key: null };
    }
    const videoBlob = dataURLtoBlob(videoDataUrl);
    if (!videoBlob) {
      console.warn(`[UserRegForm] Failed to convert DataURL to Blob for ${idSideForAPI}.`);
      return { success: false, s3Key: null };
    }

    try {
      const apiUrl = '/api/generate-s3-upload-url';
      const payload = {
        fileType: videoBlob.type,
        email: emailForAPI,
        idSide: idSideForAPI
      };
      console.log(`[UserRegForm] Requesting S3 URL for ${idSideForAPI} ID. Payload:`, JSON.stringify(payload));

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let errorDetail = `HTTP status ${response.status}`;
        try { const errorJson = await response.json(); errorDetail = errorJson.error || JSON.stringify(errorJson); }
        catch (e) { errorDetail = (await response.text()) || errorDetail; }
        throw new Error(`Failed to get S3 pre-signed URL (${idSideForAPI}): ${errorDetail}`);
      }

      const presignedData = await response.json();
      if (!presignedData.success || !presignedData.url || !presignedData.fields || !presignedData.key) {
        throw new Error(presignedData.error || `Invalid data from pre-signed URL API (${idSideForAPI})`);
      }

      const formData = new FormData();
      Object.entries(presignedData.fields).forEach(([key, value]) => formData.append(key, value));
      formData.append("file", videoBlob);

      const s3UploadResponse = await fetch(presignedData.url, { method: 'POST', body: formData });
      if (!s3UploadResponse.ok) {
        const errorText = await s3UploadResponse.text();
        throw new Error(`S3 upload failed (${idSideForAPI}): ${s3UploadResponse.status} - ${errorText}`);
      }
      console.log(`[UserRegForm] S3 upload successful for ${idSideForAPI}. Key: ${presignedData.key}`);
      return { success: true, s3Key: presignedData.key };

    } catch (error) {
      console.error(`[UserRegForm] Error in processVideoForS3 for ${idSideForAPI}:`, error.message, error.stack);
      return { success: false, s3Key: null };
    }
  };

  const handleDirectS3Upload = async () => {
    if (!frontIdVideoDataUrl && !backIdVideoDataUrl) {
      alert("No videos captured or selected to upload.");
      return;
    }

    setIsUploading(true);
    // let frontUploadSuccess = false; // Can be used if we need to track overall success
    // let backUploadSuccess = false;

    console.log("[UserRegForm] Checking frontIdVideoDataUrl:", frontIdVideoDataUrl ? "Exists" : "Does NOT exist or is null");
    if (frontIdVideoDataUrl) {
      console.log("[UserRegForm] Processing front video...");
      const frontResult = await processVideoForS3(frontIdVideoDataUrl, 'front', email);
      // frontUploadSuccess = frontResult.success;
      // console.log("[UserRegForm] Front video processing result:", frontResult);
    }

    console.log("[UserRegForm] Checking backIdVideoDataUrl:", backIdVideoDataUrl ? "Exists" : "Does NOT exist or is null");
    if (backIdVideoDataUrl) {
      console.log("[UserRegForm] Processing back video...");
      const backResult = await processVideoForS3(backIdVideoDataUrl, 'back', email);
      // backUploadSuccess = backResult.success;
      // console.log("[UserRegForm] Back video processing result:", backResult);
    }
    
    setIsUploading(false);
    // The handleSubmit() call will proceed regardless of individual upload successes here,
    // as the database key registration is handled by the backend API during URL generation.
    // If a specific upload fails, its key won't be in the DB.
    handleSubmit();
  };

  const saveRegistration = async () => {
    if (!email || !password || !faceVerified) {
      return;
    }

    

    setIsUploading(true);

    try {
      const regResponse = await fetch('/api/save-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email, 
          password,
          idDetails: combinedIdDetails
        })
      });
      
      const regData = await regResponse.json();
      
      if (regResponse.ok && regData.success) {
        
        try {
          const loginResponse = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          const loginData = await loginResponse.json();

          if (loginResponse.ok && loginData.success) {
            setUserData(loginData);
            if (loginData.isAdmin) {
              handleFlip("adminDashboard", "right");
            } else {
              handleFlip("loggedIn", "right");
            }
          } else {
            alert("Registration was successful, but auto-login failed. Please try logging in manually.");
            handleFlip("form", "left");
          }
        } catch (loginError) {
          alert("Registration was successful, but an error occurred during auto-login. Please try logging in manually.");
          handleFlip("form", "left");
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
      setIsUploading(false);
    }
    lastLivenessCheckTime.current = 0;
    setSelfieVideoDataUrl(null);
    setS3SelfieKey(null);
    if (selfieMediaRecorderRef.current && selfieMediaRecorderRef.current.state === "recording") {
      selfieMediaRecorderRef.current.stop();
    }
    clearTimeout(selfieVideoTimerIdRef.current);
    selfieRecordedChunksRef.current = [];
  };

  return (
    <div
      ref={containerRef}
      className={`p-6 ${step === "adminDashboard" ? "max-w-[75%]" : "max-w-md"} mx-auto bg-gradient-to-br from-gray-100 to-gray-300 rounded-3xl shadow-xl transition-transform duration-300 relative border border-gray-300 will-change-transform`}
    >
      <style>{`button { border-radius: 10px !important; }`}</style>
      
     

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
          <div className="w-full h-60 bg-gray-300 flex items-center justify-center rounded overflow-hidden relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover rounded"
            />
            <div 
              className="absolute border-2 border-dashed border-yellow-400"
              style={{
                width: "80%",
                height: "70%",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                pointerEvents: "none"
              }}
            ></div>
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
          <div className="w-full h-60 bg-gray-300 flex items-center justify-center rounded overflow-hidden relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover rounded"
            />
            <div 
              className="absolute border-2 border-dashed border-yellow-400"
              style={{
                width: "80%",
                height: "70%",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                pointerEvents: "none"
              }}
            ></div>
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
              onClick={handleDirectS3Upload}
              disabled={isUploading || (!frontIdVideoDataUrl && !backIdVideoDataUrl)}
              className={`px-6 py-2 text-black transition shadow-md ${
                (isUploading || (!frontIdVideoDataUrl && !backIdVideoDataUrl))
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-yellow-400 hover:bg-yellow-300"
              }`}
            >
              {isUploading ? "Uploading..." : "Proceed to face verification"}
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
