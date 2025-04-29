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

  const [livenessFeedback, setLivenessFeedback] = useState(null);

  const [poseHoldTimer, setPoseHoldTimer] = useState(null);
  const [poseStartTime, setPoseStartTime] = useState(null);
  const POSE_HOLD_DURATION = 750; // ms to hold the pose
  const POSE_STAGE_TIMEOUT = 30000; // ms before stage times out

  // State for visual debugging on mobile
  const [debugReadyState, setDebugReadyState] = useState(null);
  const [debugStreamActive, setDebugStreamActive] = useState(null);
  const [debugEffectStatus, setDebugEffectStatus] = useState("Effect Initial");
  const [debugIntervalStatus, setDebugIntervalStatus] = useState("Interval Initial");
  const [debugPollingStatus, setDebugPollingStatus] = useState("Polling Initial");
  const [debugLastError, setDebugLastError] = useState(null);
  const [showDebugInfo, setShowDebugInfo] = useState(false);

  // Define confidence thresholds for smile/eyes open
  const SMILE_CONFIDENCE_THRESHOLD = 75;
  const EYES_OPEN_CONFIDENCE_THRESHOLD = 75;

  const [livenessStage, setLivenessStage] = useState('idle');
  const [livenessStageStartTime, setLivenessStageStartTime] = useState(null); // For stage timeout
  const [livenessProgress, setLivenessProgress] = useState({
    center: false,
    blink: false,
    smile: false,
  });
  const requiredMovements = ['center', 'blink', 'smile'];
  const faceDetailsRef = useRef(null);

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
    console.log("Attempting to stop camera. Current stream:", streamRef.current);
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => {
        console.log(`Stopping track: ${track.kind}, label: ${track.label}, state: ${track.readyState}`);
        track.stop();
      });
      streamRef.current = null;
      console.log("Camera stream stopped and ref cleared.");
    } else {
      console.log("stopCamera called but no active stream found.");
    }
    // Also clear video element source to be safe
    if (videoRef.current) videoRef.current.srcObject = null;
    if (faceVideoRef.current) faceVideoRef.current.srcObject = null;
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
    setLivenessProgress({ center: false, blink: false, smile: false });
    faceDetailsRef.current = null;
    setFaceError(null);
    setVerifying(false);
    setDetecting(false);
    // Reset debug states on submit
    setDebugEffectStatus("Reset on Submit");
    setDebugIntervalStatus("Reset on Submit");
    setDebugPollingStatus("Reset on Submit");
    setDebugLastError(null);

    startCamera("user", faceVideoRef);
  };

  const checkLivenessChallenge = (details) => {
    // Check if conditions are met to process the challenge
    if (!details || !requiredMovements.includes(livenessStage) || faceDetectionPaused || verifying) {
        return;
    }

    // Clear feedback/error at the start of each check cycle unless already failed
    if(livenessStage !== 'failed') {
        setLivenessFeedback(null);
        setFaceError(null);
    }

    // --- Check for stage timeout ---
    if (livenessStageStartTime && (Date.now() - livenessStageStartTime > POSE_STAGE_TIMEOUT)) {
      console.warn(`Liveness: Timeout on stage: ${livenessStage}`);
      setFaceError(`Timeout: Could not complete '${livenessStage}' action in time.`);
      setLivenessStage('failed');
      setFaceDetectionPaused(true); // Pause detection on timeout failure
      setShowRetryOptions(true);
      setLivenessStageStartTime(null); // Reset timer
      return;
    }
    // --- End Timeout Check ---

    const { Pose: pose, Smile: smile, EyesOpen: eyesOpen } = details;
    const YAW_THRESHOLD = 15; // Relaxed threshold
    const PITCH_THRESHOLD = 15; // Relaxed threshold

    let isChallengeMet = false;
    let feedbackMsg = null;

    // Check pose first only for the 'center' stage
    if (livenessStage === 'center') {
        if (!pose || typeof pose.Yaw !== 'number' || typeof pose.Pitch !== 'number') {
            console.warn("Invalid pose data received for center check:", pose);
            setFaceError("Could not read head pose. Try adjusting lighting or position.");
            // No timer to clear here
            return;
        }
        const { Yaw: yaw, Pitch: pitch } = pose;
        // Use relaxed thresholds
        if (Math.abs(yaw) < YAW_THRESHOLD && Math.abs(pitch) < PITCH_THRESHOLD) {
             isChallengeMet = true;
             console.log(`Liveness: 'center' met (Yaw: ${yaw.toFixed(1)}, Pitch: ${pitch.toFixed(1)})`);
        } else {
            feedbackMsg = "Keep looking straight ahead.";
            console.log(`Liveness: 'center' NOT met (Yaw: ${yaw.toFixed(1)}, Pitch: ${pitch.toFixed(1)})`);
        }
    } else if (livenessStage === 'blink') {
        if (!eyesOpen || typeof eyesOpen.Value !== 'boolean' || typeof eyesOpen.Confidence !== 'number') {
            console.warn("Invalid eyesOpen data received:", eyesOpen);
            setFaceError("Could not detect eye status. Adjust lighting or position.");
            // No timer to clear
            return;
        }
        // We want to detect the closed state (Value: false) with sufficient confidence
        if (eyesOpen.Value === false && eyesOpen.Confidence >= EYES_OPEN_CONFIDENCE_THRESHOLD) {
            isChallengeMet = true;
            console.log(`Liveness: 'blink' met (EyesClosed: ${!eyesOpen.Value}, Conf: ${eyesOpen.Confidence.toFixed(1)})`);
        } else {
             feedbackMsg = "Blink both eyes fully.";
             console.log(`Liveness: 'blink' NOT met (EyesClosed: ${!eyesOpen.Value}, Conf: ${eyesOpen.Confidence.toFixed(1)})`);
        }
    } else if (livenessStage === 'smile') {
        if (!smile || typeof smile.Value !== 'boolean' || typeof smile.Confidence !== 'number') {
             console.warn("Invalid smile data received:", smile);
            setFaceError("Could not detect smile status. Adjust lighting or position.");
            // No timer to clear
            return;
        }
        // We want to detect the smiling state (Value: true) with sufficient confidence
        if (smile.Value === true && smile.Confidence >= SMILE_CONFIDENCE_THRESHOLD) {
            isChallengeMet = true;
             console.log(`Liveness: 'smile' met (Smiling: ${smile.Value}, Conf: ${smile.Confidence.toFixed(1)})`);
        } else {
             feedbackMsg = "Smile naturally.";
             console.log(`Liveness: 'smile' NOT met (Smiling: ${smile.Value}, Conf: ${smile.Confidence.toFixed(1)})`);
        }
    }

    if (isChallengeMet) {
        console.log(`Liveness: Correct action detected for ${livenessStage}. Advancing.`);
        setLivenessProgress(prev => ({ ...prev, [livenessStage]: true }));
        setFaceError(null); // Clear any previous error on success
        setLivenessFeedback(null); // Clear feedback on success
        setLivenessStageStartTime(null); // Clear timer for the completed stage

        const currentIndex = requiredMovements.indexOf(livenessStage);
        const nextIndex = currentIndex + 1;

        if (nextIndex < requiredMovements.length) {
            const nextStage = requiredMovements[nextIndex];
            setLivenessStage(nextStage);
            setLivenessStageStartTime(Date.now()); // Start timer for the next stage
            console.log(`Liveness: Moved to stage '${nextStage}'. Timer started.`);
        } else {
            console.log("Liveness: All movements detected. Pausing detection and starting verification.");
            setFaceDetectionPaused(true); // Pause detection before verification
            setLivenessStage('verifying');
            captureAndVerify(); // Proceed to final capture and verification
        }
    } else {
        // If the challenge wasn't met, provide feedback if available
        if (feedbackMsg && !faceError) { // Only show feedback if no major error exists
            setLivenessFeedback(feedbackMsg);
        }
    }
  };

  const detectFaceAndPoseOnServer = async (dataURL) => {
    const now = Date.now();
    if (detecting || now - lastDetectionTime.current < 1000 || faceDetectionPaused || !requiredMovements.includes(livenessStage)) {
       if (detecting) {
            console.log("Detection already in progress. Skipping new request.");
            setDebugPollingStatus("Polling: Skipped (Detection Active)");
       } else if (now - lastDetectionTime.current < 1000) {
           console.log("Detection throttled. Skipping new request.");
           setDebugPollingStatus("Polling: Skipped (Throttled)");
       } else if (faceDetectionPaused) {
           console.log("Detection paused. Skipping new request.");
           setDebugPollingStatus("Polling: Skipped (Paused)");
       } else if (!requiredMovements.includes(livenessStage)) {
            console.log(`Detection not needed for stage: ${livenessStage}. Skipping.`);
            setDebugPollingStatus(`Polling: Skipped (Stage: ${livenessStage})`);
       }
      return;
    }

    setDetecting(true);
    lastDetectionTime.current = now;
    setDebugPollingStatus("Polling: Sending Request..."); // Indicate request is being sent

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
        faceDetailsRef.current = null; // Clear details on API/server error
        if (json.error && json.error !== faceError) setFaceError(json.error);
        else if (!json.error && res.status !== 200) setFaceError(`Detection failed (Status: ${res.status})`);
        setLivenessFeedback(null); // Clear feedback on error

      } else { // res.ok is true
        const currentFaceDetected = json.faceDetected;
        setFacePresent(currentFaceDetected); // Update general presence state

        if(currentFaceDetected && json.pose && json.smile && json.eyesOpen) {
          // Face detected with all necessary details
          faceDetailsRef.current = {
             pose: json.pose,
             smile: json.smile,
             eyesOpen: json.eyesOpen,
             confidence: json.confidence
          };
          // Clear transient errors/feedback if we now detect a face properly
          if(faceError === "No face detected. Please position your face clearly in the frame." || faceError?.startsWith("Face details incomplete")) {
              setFaceError(null);
          }
          if(livenessFeedback === "Face lost. Please reposition." || livenessFeedback === "Face details unclear. Ensure face is fully visible & centered.") {
              setLivenessFeedback(null);
          }
          setDebugPollingStatus("Check Challenge (Details OK)");
          checkLivenessChallenge(faceDetailsRef.current); // Check with fresh data

        } else if (currentFaceDetected && (!json.pose || !json.smile || !json.eyesOpen)) {
          // Face detected but key details are missing
          console.warn(`Face detected (Conf: ${json.confidence?.toFixed(1)}%) but key details (pose/smile/eyes) are missing.`);
          setDebugPollingStatus("Warn: Details Missing");
          // Don't clear faceDetailsRef here - rely on previous good data if available
          if (requiredMovements.includes(livenessStage) && !faceError) { // Avoid overwriting other errors
             setLivenessFeedback("Face details unclear. Ensure face is fully visible & centered.");
          }
           // Still call checkLivenessChallenge, using existing details if available
           if(faceDetailsRef.current) {
                console.log("Calling checkLivenessChallenge with previous details due to missing current details.");
                checkLivenessChallenge(faceDetailsRef.current);
           } else {
               console.log("Cannot call checkLivenessChallenge - missing details and no previous details available.");
                if (requiredMovements.includes(livenessStage) && !faceError) {
                    setFaceError("Face details incomplete. Adjust lighting or position.");
                }
           }

        } else { // Face NOT detected by API (currentFaceDetected is false)
          setDebugPollingStatus("No Face Detected by API");
          // *** CHANGE HERE: Don't clear faceDetailsRef during active stages ***
          if (requiredMovements.includes(livenessStage)) {
             // *** CHANGE HERE: Don't set blocking error, set feedback instead ***
             // setFaceError("No face detected. Please position your face clearly in the frame."); // REMOVED
            if (!faceError) { // Avoid overwriting other errors
                 setLivenessFeedback("Face lost. Please reposition.");
            }
            console.log("Face not detected during active liveness stage, relying on previous details if available.");
            // Still call checkLivenessChallenge - it will use the existing faceDetailsRef.current (if any)
            // The timeout mechanism will eventually trigger if the face remains undetected.
            if(faceDetailsRef.current) {
                checkLivenessChallenge(faceDetailsRef.current);
            } else {
                // If there are no previous details either, then we truly can't proceed
                console.log("Cannot call checkLivenessChallenge - face not detected and no previous details.");
                 if (!faceError) {
                     setFaceError("No face detected. Please position your face clearly in the frame.");
                 }
            }
          } else {
            // If not in an active challenge stage (e.g., 'idle', 'verifying'), it's okay to clear details if no face is detected
             faceDetailsRef.current = null;
             console.log("Face not detected and not in active challenge stage. Clearing details.");
          }
        }
      }
    } catch (e) {
      console.error("Network error during detection:", e);
      setDebugPollingStatus(`Network Error: ${e.message}`);
      setDebugLastError(`Network Error: ${e.message}`);
      setFacePresent(false);
      faceDetailsRef.current = null; // Clear on network/fetch errors
      setFaceError('Network error connecting to detection service.');
      setLivenessFeedback(null); // Clear feedback on error
    } finally {
      setDetecting(false);
    }
  };

  useEffect(() => {
    let interval;
    const isActiveLiveness = requiredMovements.includes(livenessStage);

    if (step === 'verification' && isActiveLiveness && !faceDetectionPaused) {
      console.log(`Liveness EFFECT: Setting up polling interval. Step: ${step}, Stage: ${livenessStage}, Paused: ${faceDetectionPaused}`);
      setDebugEffectStatus(`Effect: Setting Interval (Stage: ${livenessStage})`);
      setFaceError(null);
      interval = setInterval(() => {
        console.log(`Liveness INTERVAL: Fired. Stage: ${livenessStage}`);
        setDebugIntervalStatus(`Interval: Fired (Stage: ${livenessStage})`);
        if (faceVideoRef.current && faceCanvasRef.current) {
          const video = faceVideoRef.current;
          const currentReadyState = video.readyState;
          const currentStreamActive = !!(video.srcObject?.active);

          // Update debug states if they changed
          setDebugReadyState(currentReadyState);
          setDebugStreamActive(currentStreamActive);

          console.log(`Liveness Polling (${livenessStage}): Video exists, readyState=${currentReadyState}, srcObject active=${currentStreamActive}`);

          // Only proceed with drawing/detection if video is ready (readyState >= 2 means HAVE_CURRENT_DATA)
          if (currentReadyState >= 2) {
            console.log(`Liveness Polling (${livenessStage}): Video ready, attempting canvas draw...`);
            setDebugPollingStatus(`Polling: Video Ready (RS=${currentReadyState}), Drawing...`);
            try {
                const canvas = faceCanvasRef.current;
                const context = canvas.getContext("2d");
                const videoWidth = video.videoWidth;
                const videoHeight = video.videoHeight;
                if (canvas.width !== videoWidth || canvas.height !== videoHeight) {
                  canvas.width = videoWidth || 320;
                  canvas.height = videoHeight || 240;
                }
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataURL = canvas.toDataURL('image/jpeg', 0.8);
                console.log(`Liveness Polling (${livenessStage}): Canvas draw successful, initiating detection request.`);
                setDebugPollingStatus(`Polling: Draw OK, Sending Request...`);
                detectFaceAndPoseOnServer(dataURL);
            } catch (canvasError) {
                 console.error(`Liveness Polling (${livenessStage}): Error during canvas draw/capture:`, canvasError);
                 setDebugPollingStatus(`Polling: Canvas Error! ${canvasError.message}`);
                 setDebugLastError(`Canvas Error: ${canvasError.message}`);
            }
          } else {
            console.log(`Liveness Polling (${livenessStage}): Video not ready (readyState: ${currentReadyState}). Skipping frame.`);
            setDebugPollingStatus(`Polling: Video Not Ready (RS=${currentReadyState})`);
          }
        } else {
            console.log(`Liveness INTERVAL: faceVideoRef (${!!faceVideoRef.current}) or faceCanvasRef (${!!faceCanvasRef.current}) not available.`);
            setDebugIntervalStatus(`Interval: Refs Not Ready (Vid: ${!!faceVideoRef.current}, Can: ${!!faceCanvasRef.current})`);
            setDebugPollingStatus("Polling: Refs Not Ready");
        }
      }, 1000); // Adjusted interval to 1000ms to match debounce logic
    } else {
      console.log(`Liveness EFFECT: Conditions NOT met or polling stopped. Step: ${step}, Stage: ${livenessStage}, Paused: ${faceDetectionPaused}, IsActiveLiveness: ${isActiveLiveness}`);
      setDebugEffectStatus(`Effect: Conditions NOT Met (Step: ${step}, Stage: ${livenessStage}, Paused: ${faceDetectionPaused}, Active: ${isActiveLiveness})`);
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
          setLivenessFeedback(null);
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
          setLivenessFeedback(null);
        } else {
          setLivenessStage('complete');
          setFaceError(null);
          setLivenessFeedback(null);
        }
      } catch (err) {
        console.error("Face verification fetch error:", err);
        setFaceVerified(false);
        setVerificationAttempts(prev => prev + 1);
        setShowRetryOptions(true);
        setLivenessStage('failed');
        setFaceError('Network error during face verification.');
        setLivenessFeedback(null);
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
      setLivenessFeedback(null);
    }
  };

  const handleRetryVerification = () => {
    console.log("Attempting Liveness Retry...");
    stopCamera();

    setFaceVerified(null);
    setShowRetryOptions(false);
    setFaceDetectionPaused(false);
    lastDetectionTime.current = 0;
    setLivenessProgress({ center: false, blink: false, smile: false });
    setLivenessStage('center');
    setLivenessStageStartTime(Date.now()); // Start the timer for the first stage
    setFaceError(null);
    faceDetailsRef.current = null;
    setLivenessFeedback(null);
    setVerifying(false);
    setDetecting(false);
    // Reset debug states on retry
    setDebugEffectStatus("Reset on Retry");
    setDebugIntervalStatus("Reset on Retry");
    setDebugPollingStatus("Reset on Retry");
    setDebugLastError(null);
    // Clear and reset timers - Only stage timer now
    setLivenessStageStartTime(Date.now());

    // Explicitly restart the camera for the retry
    console.log("Restarting camera for retry...");
    startCamera("user", faceVideoRef);
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

  useEffect(() => {
    // --- Component Cleanup Effect ---
    return () => {
      stopCamera(); // Ensure camera stops on unmount
      // No poseHoldTimer to clear now
      // The polling interval is cleared by its own effect's cleanup
      console.log("Component Unmounting: Camera stopped.");
    };
  }, []); // Removed poseHoldTimer dependency

  const renderVerificationStepContent = () => {
    const getLivenessInstruction = () => {
      switch (livenessStage) {
        case 'idle': return 'Get ready for the liveness check.';
        case 'center': return 'Look straight ahead at the camera.';
        case 'blink': return 'Blink both eyes now.';
        case 'smile': return 'Smile naturally now.';
        case 'verifying': return 'Verifying your identity... Please hold still.';
        case 'complete': return faceVerified ? 'Identity Verified!' : 'Liveness check complete. Verification pending...';
        case 'failed': return 'Liveness check failed.';
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

        {/* --- Visual Debug Info --- */}
        <div className="text-xs text-gray-500 text-center mt-1">
            <button onClick={() => setShowDebugInfo(!showDebugInfo)} className="text-blue-600 underline text-xs">{showDebugInfo ? "Hide" : "Show"} Debug</button>
            {showDebugInfo && (
                 <div className="mt-1 p-2 border border-dashed border-gray-400 bg-gray-50 text-left space-y-0.5 overflow-x-auto">
                    <p><strong>Effect:</strong> {debugEffectStatus}</p>
                    <p><strong>Interval:</strong> {debugIntervalStatus}</p>
                    <p><strong>Polling:</strong> {debugPollingStatus}</p>
                    <p><strong>Video RS:</strong> {debugReadyState ?? 'N/A'}</p>
                    <p><strong>Stream Active:</strong> {debugStreamActive === null ? 'N/A' : String(debugStreamActive)}</p>
                    <p><strong>Face Present:</strong> {facePresent ? 'Yes' : 'No'}</p>
                    <p><strong>Detecting:</strong> {detecting ? 'Yes' : 'No'}</p>
                    <p><strong>Verifying:</strong> {verifying ? 'Yes' : 'No'}</p>
                    <p><strong>Paused:</strong> {faceDetectionPaused ? 'Yes' : 'No'}</p>
                    <p><strong>Stage:</strong> {livenessStage}</p>
                    {debugLastError && <p className="text-red-600"><strong>LAST ERROR:</strong> {debugLastError}</p>}
                 </div>
            )}
        </div>
        {/* --- End Debug Info --- */}

        {faceVerified !== true && (
           <div className="text-sm min-h-[100px] flex flex-col justify-center items-center bg-gray-50 p-3 rounded-lg border border-gray-200">
              <p className={`text-base font-medium mb-1 ${livenessStage === 'failed' || faceError ? 'text-red-600' : 'text-gray-800'}`}>
                 {getLivenessInstruction()}
              </p>

              {livenessFeedback && !faceError && (
                  <p className="text-blue-600 text-sm font-normal mt-0 mb-2 px-2">{livenessFeedback}</p>
              )}

              {faceError && <p className="text-red-600 text-sm font-semibold mt-1 mb-2 px-2">{faceError}</p>}

              {requiredMovements.includes(livenessStage) && !faceError && renderProgressIndicators()}

               {(detecting || verifying) && livenessStage !== 'failed' && !faceError && (
                   <div className="mt-2 w-5 h-5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin"></div>
               )}

               {!facePresent && requiredMovements.includes(livenessStage) && !detecting && !faceError && !livenessFeedback && (
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
                 setLivenessStageStartTime(Date.now()); // Start timer for the 'center' stage
                 setFaceError(null);
                 setLivenessFeedback(null);
                 // No poseHoldTimer to clear
                 setShowRetryOptions(false); // Hide retry options when starting
                 setLivenessProgress({ center: false, blink: false, smile: false }); // Reset progress indicators
                 console.log("Liveness: Start button clicked. Moved to stage 'center'. Timer started.");
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
