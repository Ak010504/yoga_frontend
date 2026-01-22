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
    recordVideo.muted = true;        // REQUIRED for autoplay
    await recordVideo.play();

    // ✅ SHOW the camera preview
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
  const res = await fetch("https://irresponsible-inga-semiallegorically.ngrok-free.dev/api/poses");
  const data = await res.json();

  data.poses.forEach(pose => {
    const opt = document.createElement("option");
    opt.value = pose;
    opt.innerText = pose.replace("_", " ").toUpperCase();
    poseDropdown.appendChild(opt);
  });
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
    const res = await fetch("https://irresponsible-inga-semiallegorically.ngrok-free.dev/api/process-video", {
      method: "POST",
      body: formData
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

