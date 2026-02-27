// ===============================
// PosePilot Frontend – main.js
// ===============================

let socket        = null;
let selectedPose  = "";
let videoStream   = null;
let captureInterval = null;

// -------------------------------
// DOM Elements
// -------------------------------
const poseDropdown    = document.getElementById("pose-dropdown");
const feedbackList    = document.getElementById("feedback-list");
const recordVideo     = document.getElementById("record-video");
const liveFeedbackList = document.getElementById("live-feedback-list");

// ===============================
// DEVICE-AWARE TTS
// ===============================

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
              || window.innerWidth < 768;

let ttsEnabled = true;
let isSpeaking = false;

// Preload voices (required for iOS Safari)
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}

function speakOnPhone(text) {
  if (!isMobile)   return;
  if (!ttsEnabled) return;
  if (!text)       return;
  if (isSpeaking)  return;

  if (!('speechSynthesis' in window)) {
    console.warn("TTS not supported on this browser");
    return;
  }

  window.speechSynthesis.cancel();

  const utterance  = new SpeechSynthesisUtterance(text);
  utterance.rate   = 0.95;
  utterance.pitch  = 1.0;
  utterance.volume = 1.0;

  // Pick local English voice if available
  const voices   = window.speechSynthesis.getVoices();
  const engVoice = voices.find(v => v.lang.startsWith('en') && v.localService);
  if (engVoice) utterance.voice = engVoice;

  utterance.onstart = () => { isSpeaking = true;  };
  utterance.onend   = () => { isSpeaking = false; };
  utterance.onerror = () => { isSpeaking = false; };

  window.speechSynthesis.speak(utterance);
  console.log(`📱 Phone TTS: "${text}"`);
}

// -------------------------------
// Screen Navigation
// -------------------------------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function showRecordScreen() {
  selectedPose = poseDropdown.value;
  if (!selectedPose) {
    alert("Please select a pose first");
    return;
  }
  showScreen("record-screen");
  startCamera();
}

function backHome() {
  stopRealtime();
  showScreen("home-screen");
}

// -------------------------------
// Camera Handling
// -------------------------------
async function startCamera() {
  try {
    videoStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    });

    recordVideo.srcObject = videoStream;
    recordVideo.muted     = true;
    await recordVideo.play();

    document.getElementById("recording-view").style.display = "block";
    startRealtimeCorrection();

  } catch (err) {
    console.error(err);
    document.getElementById("permission-denied").style.display = "block";
  }
}

function stopCamera() {
  if (videoStream) {
    videoStream.getTracks().forEach(t => t.stop());
    videoStream = null;
  }
}

// -------------------------------
// WebSocket – Real-Time Correction
// -------------------------------
function startRealtimeCorrection() {
  socket = new WebSocket(
    "wss://irresponsible-inga-semiallegorically.ngrok-free.dev/ws/realtime-correction"
  );

  socket.onopen = () => {
    console.log("🟢 WebSocket connected");
    startFrameCapture();
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.status === "feedback") {
      renderLiveFeedback(data.feedback);

      // ✅ Phone speaks via Web Speech API
      // Laptop speaks via pyttsx3 on backend
      if (isMobile && data.speak_text) {
        speakOnPhone(data.speak_text);
      }
    }

    if (data.status === "warming_up") {
      renderLiveFeedback([`Analyzing posture…`]);
    }

    if (data.status === "no_pose") {
      renderLiveFeedback(["No pose detected"]);
    }

    if (data.status === "hold_still") {
      renderLiveFeedback(["🧘 Hold still for a moment…"]);
    }

    if (data.status === "detecting") {
      renderLiveFeedback(["🔍 Identifying pose…"]);
    }

    if (data.status === "ok") {
      renderLiveFeedback(["✅ Good alignment"]);
    }
  };

  socket.onclose = () => {
    console.log("🔴 WebSocket closed");
    window.speechSynthesis && window.speechSynthesis.cancel();
    isSpeaking = false;
  };

  socket.onerror = (err) => {
    console.error("WebSocket error:", err);
  };
}

// -------------------------------
// Frame Capture (5 FPS)
// -------------------------------
function startFrameCapture() {
  const canvas = document.createElement("canvas");
  const ctx    = canvas.getContext("2d");

  captureInterval = setInterval(() => {
    if (!recordVideo.videoWidth) return;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    canvas.width  = recordVideo.videoWidth;
    canvas.height = recordVideo.videoHeight;
    ctx.drawImage(recordVideo, 0, 0);

    const frameBase64 = canvas
      .toDataURL("image/jpeg", 0.6)
      .split(",")[1];

    socket.send(JSON.stringify({
      pose:  selectedPose,
      frame: frameBase64
    }));

  }, 200); // 5 FPS
}

// -------------------------------
// Stop Everything
// -------------------------------
function stopRealtime() {
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
  }

  if (socket) {
    socket.close();
    socket = null;
  }

  window.speechSynthesis && window.speechSynthesis.cancel();
  isSpeaking = false;

  stopCamera();
}

// -------------------------------
// Feedback Rendering
// -------------------------------
function renderLiveFeedback(feedbackArray) {
  if (!liveFeedbackList) return;

  liveFeedbackList.innerHTML = "";

  feedbackArray.forEach(text => {
    const item       = document.createElement("div");
    item.className   = "live-feedback-item";
    item.innerText   = text;
    liveFeedbackList.appendChild(item);
  });
}

function renderFeedback(feedbackArray) {
  if (!feedbackList) return;

  feedbackList.innerHTML = "";

  feedbackArray.forEach(text => {
    const item     = document.createElement("div");
    item.className = "feedback-item";
    item.innerText = text;
    feedbackList.appendChild(item);
  });
}

// -------------------------------
// Pose Dropdown Init
// -------------------------------
async function loadPoses() {
  try {
    const API_BASE = "https://irresponsible-inga-semiallegorically.ngrok-free.dev";

    const res = await fetch(`${API_BASE}/api/poses`, {
      headers: { "ngrok-skip-browser-warning": "true" }
    });

    const text = await res.text();
    const data = JSON.parse(text);

    data.poses.forEach(pose => {
      const opt     = document.createElement("option");
      opt.value     = pose;
      opt.innerText = pose.replace(/_/g, " ").toUpperCase();
      poseDropdown.appendChild(opt);
    });

  } catch (err) {
    console.error("❌ loadPoses failed:", err);
  }
}

loadPoses();

// ===============================
// Recording Logic (MediaRecorder)
// ===============================

let mediaRecorder  = null;
let recordedChunks = [];
let recordedBlob   = null;

function showUploadScreen() {
  showScreen("upload-screen");
}

// -------------------------------
// Start recording
// -------------------------------
function startRecording() {
  if (!videoStream) {
    alert("Camera not started");
    return;
  }

  recordedChunks = [];
  mediaRecorder  = new MediaRecorder(videoStream, { mimeType: "video/webm" });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    recordedBlob = new Blob(recordedChunks, { type: "video/webm" });
    showRecordedPreview();
  };

  mediaRecorder.start();

  document.getElementById("start-record-btn").style.display = "none";
  document.getElementById("stop-record-btn").style.display  = "inline-block";

  console.log("🎥 Recording started");
}

// -------------------------------
// Stop recording
// -------------------------------
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }

  document.getElementById("start-record-btn").style.display = "inline-block";
  document.getElementById("stop-record-btn").style.display  = "none";

  console.log("⏹️ Recording stopped");
}

// -------------------------------
// Show playback preview
// -------------------------------
function showRecordedPreview() {
  stopRealtime();

  const playback = document.getElementById("playback-video");
  playback.src   = URL.createObjectURL(recordedBlob);

  document.getElementById("recording-view").style.display = "none";
  document.getElementById("recorded-view").style.display  = "block";
}

// -------------------------------
// Discard recording
// -------------------------------
function discardRecording() {
  recordedBlob = null;
  document.getElementById("recorded-view").style.display  = "none";
  document.getElementById("recording-view").style.display = "block";
  startCamera();
}

// -------------------------------
// Analyze recorded video
// -------------------------------
async function analyzeRecordedVideo() {
  if (!recordedBlob) return;

  showScreen("loading-screen");

  const formData = new FormData();
  formData.append("video", recordedBlob, "recorded.webm");
  formData.append("pose",  selectedPose);

  try {
    const API_BASE = "https://irresponsible-inga-semiallegorically.ngrok-free.dev";
    const res = await fetch(`${API_BASE}/api/process-video`, {
      method:  "POST",
      body:    formData,
      headers: { "ngrok-skip-browser-warning": "true" }
    });

    const result = await res.json();
    showResults(result);

    // ✅ Phone TTS for video upload results too
    if (isMobile && result.speak_text) {
      speakOnPhone(result.speak_text);
    }

  } catch (err) {
    alert("Failed to analyze video");
    console.error(err);
  }
}

// -------------------------------
// Show results
// -------------------------------
function showResults(result) {
  showScreen("results-screen");

  document.getElementById("result-pose").innerText = result.pose || selectedPose;

  renderFeedback(result.feedback || ["Good alignment. Hold the pose."]);

  const video = document.getElementById("result-video");
  video.src   = URL.createObjectURL(recordedBlob);
}
