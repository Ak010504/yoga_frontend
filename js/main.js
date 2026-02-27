// ===============================
// PosePilot Frontend – main.js
// ===============================

let socket = null;
let selectedPose = "";
let videoStream = null;
let captureInterval = null;

// -------------------------------
// DOM Elements
// -------------------------------
const poseDropdown = document.getElementById("pose-dropdown");
const feedbackList = document.getElementById("feedback-list");
const recordVideo = document.getElementById("record-video");
const liveFeedbackList = document.getElementById("live-feedback-list");

// ✅ ONLY NEW CODE: Phone TTS setup
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
let isSpeaking = false;
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}
function speakOnPhone(text) {
  if (!isMobile || !text || isSpeaking) return;
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 0.95; utt.volume = 1.0;
  utt.onstart = () => { isSpeaking = true; };
  utt.onend   = () => { isSpeaking = false; };
  utt.onerror = () => { isSpeaking = false; };
  window.speechSynthesis.speak(utt);
}

// -------------------------------
// Screen Navigation (UNCHANGED)
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
    recordVideo.muted = true;
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
  socket = new WebSocket("wss://irresponsible-inga-semiallegorically.ngrok-free.dev/ws/realtime-correction");

  socket.onopen = () => {
    console.log("🟢 WebSocket connected");
    startFrameCapture();
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.status === "feedback") {
      renderLiveFeedback(data.feedback);
      speakOnPhone(data.speak_text); // ✅ ONLY NEW LINE
    }

    if (data.status === "warming_up") {
      renderLiveFeedback(["Analyzing posture…"]);
    }

    if (data.status === "no_pose") {
      renderLiveFeedback(["No pose detected"]);
    }

    if (data.status === "hold_still") {
      renderLiveFeedback(["🧘 Hold still for a moment…"]);
    }

    if (data.status === "warming_up") {
      renderLiveFeedback([`Analyzing posture… (${data.frames} frames)`]);
    }
  };

  socket.onclose = () => {
    console.log("🔴 WebSocket closed");
  };
}

// -------------------------------
// Frame Capture (5 FPS)
// -------------------------------
function startFrameCapture() {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  captureInterval = setInterval(() => {
    if (!recordVideo.videoWidth) return;

    canvas.width = recordVideo.videoWidth;
    canvas.height = recordVideo.videoHeight;
    ctx.drawImage(recordVideo, 0, 0);

    const frameBase64 = canvas
      .toDataURL("image/jpeg", 0.6)
      .split(",")[1];

    socket.send(JSON.stringify({
      pose: selectedPose,
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

  stopCamera();
}

// -------------------------------
// Feedback Rendering
// -------------------------------
function renderLiveFeedback(feedbackArray) {
  if (!liveFeedbackList) return;

  liveFeedbackList.innerHTML = "";

  feedbackArray.forEach(text => {
    const item = document.createElement("div");
    item.className = "live-feedback-item";
    item.innerText = text;
    liveFeedbackList.appendChild(item);
  });
}

// -------------------------------
// Pose Dropdown Init
// -------------------------------
async function loadPoses() {
  try {
    const API_BASE = "https://irresponsible-inga-semiallegorically.ngrok-free.dev";

    const res = await fetch(`${API_BASE}/api/poses`, {
      headers: {
        "ngrok-skip-browser-warning": "true"
      }
    });

    console.log("Status:", res.status);
    console.log("Content-Type:", res.headers.get("content-type"));

    const text = await res.text();
    console.log("Raw response:", text);

    const data = JSON.parse(text);

    data.poses.forEach(pose => {
      const opt = document.createElement("option");
      opt.value = pose;
      opt.innerText = pose.replace("_", " ").toUpperCase();
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

let mediaRecorder = null;
let recordedChunks = [];
let recordedBlob = null;

// -------------------------------
// Upload screen navigation
// -------------------------------
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
  mediaRecorder = new MediaRecorder(videoStream, {
    mimeType: "video/webm"
  });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    recordedBlob = new Blob(recordedChunks, { type: "video/webm" });
    showRecordedPreview();
  };

  mediaRecorder.start();

  document.getElementById("start-record-btn").style.display = "none";
  document.getElementById("stop-record-btn").style.display = "inline-block";

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
  document.getElementById("stop-record-btn").style.display = "none";

  console.log("⏹️ Recording stopped");
}

// -------------------------------
// Show playback preview
// -------------------------------
function showRecordedPreview() {
  stopRealtime();

  const playback = document.getElementById("playback-video");
  playback.src = URL.createObjectURL(recordedBlob);

  document.getElementById("recording-view").style.display = "none";
  document.getElementById("recorded-view").style.display = "block";
}

// -------------------------------
// Discard recording
// -------------------------------
function discardRecording() {
  recordedBlob = null;
  document.getElementById("recorded-view").style.display = "none";
  document.getElementById("recording-view").style.display = "block";
  startCamera();
}

// -------------------------------
// Analyze recorded video (UPLOAD)
// -------------------------------
async function analyzeRecordedVideo() {
  if (!recordedBlob) return;

  showScreen("loading-screen");

  const formData = new FormData();
  formData.append("video", recordedBlob, "recorded.webm");
  formData.append("pose", selectedPose);

  try {
    const API_BASE = "https://irresponsible-inga-semiallegorically.ngrok-free.dev";
    const res = await fetch(`${API_BASE}/api/process-video`, {
      method: "POST",
      body: formData,
      headers: {
        "ngrok-skip-browser-warning": "true"
      }
    });

    const result = await res.json();
    showResults(result);
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
  video.src = URL.createObjectURL(recordedBlob);
}
