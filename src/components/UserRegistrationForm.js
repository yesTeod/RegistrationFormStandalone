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
  const [idDetectionStatus, setIdDetectionStatus] = useState("idle");
  const [idDetectionMessage, setIdDetectionMessage] = useState("Align ID card within the frame.");
  const [idGuideBoxColor, setIdGuideBoxColor] = useState("rgba(250, 204, 21, 0.8)");
  const [isCompletingVerification, setIsCompletingVerification] = useState(false);
  const [isPC, setIsPC] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");

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
  const idCheckIntervalRef = useRef(null);

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
        stopCamera();
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
            // Start S3 upload for front video in the background
            processVideoForS3(videoDataUrl, 'front', email).then(result => {
              if (result.success && result.s3Key) {
                setS3FrontKey(result.s3Key);
              }
            });
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
            // Start S3 upload for back video in the background
            processVideoForS3(videoDataUrl, 'back', email).then(result => {
              if (result.success && result.s3Key) {
                setS3BackKey(result.s3Key);
              }
            });
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
        setIsCompletingVerification(true); // Start loading for continue button
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
        setIsCompletingVerification(true); // Start loading for continue button, even if no selfie video
        console.log("[UserRegForm] No selfie video data to upload.");
      }
      // Save the registration with ID details (and potentially selfie S3 key if backend handles it via email association)
      try {
        await saveRegistration();
      } finally {
        setIsCompletingVerification(false); // Stop loading for continue button
      }
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
    if (step === "adminDashboard") {
      if (card) card.style.transform = "rotateX(0deg) rotateY(0deg)";
      return;
    }

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
      if (card) card.style.transform = "rotateX(0deg) rotateY(0deg)";
    };
  }, [isFlipping, step, containerRef.current]);

  useEffect(() => {
    // Reset ID detection state when moving to a camera step
    if (step === "camera" || step === "cameraBack") {
      setIdDetectionStatus("idle");
      setIdDetectionMessage("Align ID card within the frame.");
      setIdGuideBoxColor("rgba(250, 204, 21, 0.8)"); // Default yellow
    }

    if ((step === "camera" || step === "cameraBack") && cameraStatus === "active" && videoRef.current) {
      clearInterval(idCheckIntervalRef.current); // Clear any existing interval
      idCheckIntervalRef.current = setInterval(() => {
        checkIdPositionAgainstServer();
      }, 2000); // Check every 2 seconds
    } else {
      clearInterval(idCheckIntervalRef.current);
    }

    return () => {
      clearInterval(idCheckIntervalRef.current);
    };
  }, [step, cameraStatus]); // Rerun when step or cameraStatus changes

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  useEffect(() => {
    const checkDeviceType = () => {
      let isMobileDevice = false;
      if (navigator.userAgentData) {
        isMobileDevice = navigator.userAgentData.mobile;
      } else {
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        if (/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|rim)|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(userAgent) ||
            /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n203|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|400|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(00|h\-|v\-|v )|sy(mb|n0)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(userAgent.substr(0,4))) {
          isMobileDevice = true;
        }
      }
      setIsPC(!isMobileDevice);
    };
    checkDeviceType();
  }, []);

  useEffect(() => {
    if (isPC && step === "form") {
      try {
        const currentUrl = window.location.href;
        setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(currentUrl)}`);
      } catch (e) {
        // In case window.location.href is not available (e.g. SSR)
        setQrCodeUrl("");
      }
    } else {
      setQrCodeUrl(""); // Clear QR code if not PC or not on form step
    }
  }, [isPC, step]);

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
              disabled={isCompletingVerification}
              className="mt-3 px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow transition-colors flex items-center justify-center"
            >
              {isCompletingVerification ? (
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : null}
              {isCompletingVerification ? "Processing..." : "Continue"}
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
    handleSubmit();
  };

  const saveRegistration = async () => {
    if (!email || !password || !faceVerified) {
      return;
    }

    

    setIsUploading(true);

    try {
      // Fetch IP address
      let ipAddress = 'N/A';
      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        if (ipResponse.ok) {
          const ipData = await ipResponse.json();
          ipAddress = ipData.ip;
        }
      } catch (ipError) {
        console.warn("Could not fetch IP address:", ipError);
      }

      const regResponse = await fetch('/api/save-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email, 
          password,
          idDetails: combinedIdDetails,
          ipAddress // Add IP address to the payload
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
            stopCamera();
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

  const checkIdPositionAgainstServer = async () => {
    if (!videoRef.current || !canvasRef.current || videoRef.current.paused || videoRef.current.ended || videoRef.current.readyState < 3) {
      return; // Video not ready
    }
    if (idDetectionStatus === "checking") {
      return; // Already checking
    }

    setIdDetectionStatus("checking");
    setIdDetectionMessage("Verifying ID position...");

    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageDataUrl = canvas.toDataURL("image/jpeg", 0.8); // Use JPEG for smaller size

    try {
      const response = await fetch('/api/check-id-position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageDataUrl }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Server error during ID check.' }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setIdDetectionMessage(data.message || "Status updated.");
        switch (data.status) {
          case "DETECTED_GOOD_POSITION":
            setIdDetectionStatus("detected_good");
            setIdGuideBoxColor("rgba(74, 222, 128, 0.8)"); // Green
            break;
          case "DETECTED_BAD_POSITION":
            setIdDetectionStatus("detected_bad");
            setIdGuideBoxColor("rgba(251, 146, 60, 0.8)"); // Orange
            break;
          case "NOT_DETECTED":
            setIdDetectionStatus("not_detected");
            setIdGuideBoxColor("rgba(250, 204, 21, 0.8)"); // Yellow
            break;
          default:
            setIdDetectionStatus("error");
            setIdGuideBoxColor("rgba(239, 68, 68, 0.8)"); // Red
            setIdDetectionMessage(data.message || "Unknown status from server.");
        }
      } else {
        setIdDetectionStatus("error");
        setIdGuideBoxColor("rgba(239, 68, 68, 0.8)"); // Red
        setIdDetectionMessage(data.message || "Failed to check ID position.");
      }

    } catch (error) {
      setIdDetectionStatus("error");
      setIdGuideBoxColor("rgba(239, 68, 68, 0.8)"); // Red
      setIdDetectionMessage(error.message || "Error checking ID position. Check connection.");
      console.error("Error in checkIdPositionAgainstServer:", error);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`p-6 ${step === "adminDashboard" ? "max-w-[75%]" : isPC && step === "form" ? "max-w-2xl" : "max-w-md"} mx-auto bg-gradient-to-br from-gray-100 to-gray-300 rounded-3xl shadow-xl transition-transform duration-300 relative border border-gray-300 will-change-transform`}
    >
      <style>{`button { border-radius: 10px !important; }`}</style>
      
     

      {step === "form" && (
        <div className={`flex ${isPC && qrCodeUrl ? 'flex-row gap-6' : 'flex-col'} items-start`}>
          <div className={`${isPC && qrCodeUrl ? 'w-2/3' : 'w-full'} space-y-4`}>
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
              {(() => {
                const buttonClasses = `${
                  isCheckingUser 
                    ? "bg-gray-400 cursor-not-allowed" 
                    : "bg-yellow-400 hover:bg-yellow-300"
                } text-black px-6 py-2 rounded-full shadow-md`;
                return (
                  <button
                    onClick={handleFormSubmit}
                    disabled={isCheckingUser}
                    className={buttonClasses}
                  >
                    {isCheckingUser ? "Checking..." : "Continue"}
                  </button>
                );
              })()}
            </div>
          </div>

          {isPC && qrCodeUrl && (
            <div className="w-1/3 p-4 bg-white border border-gray-200 rounded-xl shadow-lg flex flex-col items-center justify-center space-y-2 self-center">
              <p className="text-xs text-gray-700 text-center font-medium">
                Scan with your mobile to continue registration on your phone.
              </p>
              <img src={qrCodeUrl} alt="QR Code for mobile registration" className="w-32 h-32" />
            </div>
          )}
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
              className="absolute border-2 border-dashed rounded-md" 
              style={{
                borderColor: idGuideBoxColor,
                width: "80%", 
                height: "70%", 
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
                boxShadow: `0 0 15px ${idGuideBoxColor.replace("0.8", "0.5")}`
              }}
            ></div>
            <canvas
              ref={canvasRef}
              width={320}
              height={240}
              className="hidden"
            />
          </div>
          <p className="text-sm text-gray-600 -mt-2 min-h-[20px]">{idDetectionMessage}</p>
          <div className="flex flex-col md:flex-row justify-center gap-3 mt-4">
            <button
              onClick={capturePhoto}
              disabled={idDetectionStatus !== "detected_good" || cameraStatus !== "active"}
              className={`px-4 py-2 rounded-full shadow-md transition-colors ${
                idDetectionStatus === "detected_good" && cameraStatus === "active"
                  ? "bg-yellow-400 hover:bg-yellow-300 text-black"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              Capture Front
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
              className="absolute border-2 border-dashed rounded-md" 
              style={{
                borderColor: idGuideBoxColor,
                width: "80%", 
                height: "70%", 
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
                boxShadow: `0 0 15px ${idGuideBoxColor.replace("0.8", "0.5")}`
              }}
            ></div>
            <canvas
              ref={canvasRef}
              width={320}
              height={240}
              className="hidden"
            />
          </div>
          <p className="text-sm text-gray-600 -mt-2 min-h-[20px]">{idDetectionMessage}</p>
          <div className="flex flex-col md:flex-row justify-center gap-3 mt-4">
            <button
              onClick={captureBackPhoto}
              disabled={idDetectionStatus !== "detected_good" || cameraStatus !== "active"}
              className={`px-4 py-2 rounded-full shadow-md transition-colors ${
                idDetectionStatus === "detected_good" && cameraStatus === "active"
                  ? "bg-yellow-400 hover:bg-yellow-300 text-black"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              Capture Back
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
                  <strong>Full Name:</strong> {combinedIdDetails.fullName}
                </p>
                {combinedIdDetails.fatherName && combinedIdDetails.fatherName !== "Not found" && (
                  <p>
                    <strong>Father's Name:</strong> {combinedIdDetails.fatherName}
                  </p>
                )}
                <p>
                  <strong>ID No:</strong> {combinedIdDetails.idNumber}
                </p>
                <p>
                  <strong>Expiry:</strong> {combinedIdDetails.expiry}
                </p>
                <p>
                  <strong>Date of Birth:</strong> {combinedIdDetails.dateOfBirth}
                </p>
                 {/* Display other relevant fields from combinedIdDetails as needed */}
                 {combinedIdDetails.nationality && combinedIdDetails.nationality !== "Not found" && (
                  <p>
                    <strong>Nationality:</strong> {combinedIdDetails.nationality}
                  </p>
                )}
                {combinedIdDetails.gender && combinedIdDetails.gender !== "Not found" && (
                  <p>
                    <strong>Gender:</strong> {combinedIdDetails.gender}
                  </p>
                )}
                {combinedIdDetails.issueDate && combinedIdDetails.issueDate !== "Not found" && (
                  <p>
                    <strong>Issue Date:</strong> {combinedIdDetails.issueDate}
                  </p>
                )}
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
              disabled={isUploading || isFlipping || isExtracting}
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
                    {/* Full Name from idDetails */}
                    {userData.idDetails.fullName && userData.idDetails.fullName !== "Not found" &&
                      <p><span className="font-medium">Full Name:</span> {userData.idDetails.fullName}</p>
                    }

                    {/* Father's Name from idDetails */}
                    {userData.idDetails.fatherName && userData.idDetails.fatherName !== "Not found" &&
                      <p><span className="font-medium">Father's Name:</span> {userData.idDetails.fatherName}</p>
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
    </div>
  );
}
