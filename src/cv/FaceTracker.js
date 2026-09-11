// src/cv/FaceTracker.js
// FilesetResolver helps MediaPipe find/load files
// FaceLandmarker: AI model to detect faces and compute head direction

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// Locations of files
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const WASM_BASE_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

// Phase 2 code face landmark tracking
const LEFT_EDGE = 234;
const RIGHT_EDGE = 454;
const NOSE_TIP = 1;
const DIRECTION_THRESHOLD = 0.15; // tune if turns feel too sensitive/insensitive

const FACING_DEBOUNCE_MS = 300; // how long a state must hold before we trust it

function getDirection(landmarks) {
  const left = landmarks[LEFT_EDGE];
  const right = landmarks[RIGHT_EDGE];
  const nose = landmarks[NOSE_TIP];

  if (!left || !right || !nose) return "CENTER";

  // Game specific logic
  const faceWidth = Math.abs(right.x - left.x);
  if (faceWidth === 0) return "CENTER";

  const mid = (left.x + right.x) / 2;
  const ratio = (nose.x - mid) / faceWidth;

  if (ratio > DIRECTION_THRESHOLD) return "RIGHT";
  if (ratio < -DIRECTION_THRESHOLD) return "LEFT";
  return "CENTER";
}

function getBoundingBox(landmarks) {
  if (!landmarks || landmarks.length === 0) return null;
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    minX: Math.max(0, minX),
    maxX: Math.min(1, maxX),
    minY: Math.max(0, minY),
    maxY: Math.min(1, maxY),
    width: Math.max(0.01, maxX - minX),
    height: Math.max(0.01, maxY - minY),
  };
}

// Leftmost face on screen = player1, rightmost = player2.
// Sorting by x each frame keeps the assignment stable even if
// MediaPipe reorders faces in its result array.
function assignPlayers(faces) {
  const sorted = [...faces].sort((a, b) => a.landmarks[NOSE_TIP].x - b.landmarks[NOSE_TIP].x);
  const player1 = sorted[0]
    ? {
        direction: sorted[0].direction,
        visible: true,
        landmarks: sorted[0].landmarks,
        box: sorted[0].box,
      }
    : { direction: null, visible: false, landmarks: null, box: null };
  const player2 = sorted[1]
    ? {
        direction: sorted[1].direction,
        visible: true,
        landmarks: sorted[1].landmarks,
        box: sorted[1].box,
      }
    : { direction: null, visible: false, landmarks: null, box: null };
  return { player1, player2 };
}

// Two players facing each other:
// Standard: Player 1 (left) looks RIGHT, Player 2 (right) looks LEFT.
// Swapped/mirrored camera: Player 1 looks LEFT, Player 2 looks RIGHT.
function computeRawFacingEachOther(player1, player2) {
  if (!player1.visible || !player2.visible) return false;
  return (
    (player1.direction === "RIGHT" && player2.direction === "LEFT") ||
    (player1.direction === "LEFT" && player2.direction === "RIGHT")
  );
}

export class FaceTracker {
  constructor({ onResults } = {}) {
    this.onResults = onResults || (() => {});
    this.landmarker = null;
    this.video = null;
    this.stream = null;
    this.rafId = null;
    this.running = false;
    this.isOffline = false;
    this.offlineReason = null;
    this.stableFacing = false;
    this.pendingFacing = false;
    this.pendingSince = 0;
  }

  getVideoElement() {
    return this.video;
  }

  async start() {
    try {
      // Load MediaPipe runtime
      const filesetResolver = await FilesetResolver.forVisionTasks(WASM_BASE_URL);

      this.landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 2,
      });

      // Create a hidden <video> element to hold the webcam stream.
      this.video = document.createElement("video");
      this.video.style.display = "none";
      this.video.playsInline = true;
      this.video.muted = true;
      document.body.appendChild(this.video);

      // Request camera access
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });

      this.video.srcObject = this.stream;
      await this.video.play();

      this.running = true;
      this.isOffline = false;
      this._loop();
    } catch (err) {
      console.warn("FaceTracker camera or MediaPipe initialization notice:", err);
      this.isOffline = true;
      this.offlineReason = err.name || "Camera unavailable";
      this.running = false;

      // Broadcast offline status so HUD switches to Manual Mode gracefully
      this.onResults({
        faceCount: 0,
        player1: { visible: false, direction: null, landmarks: null, box: null },
        player2: { visible: false, direction: null, landmarks: null, box: null },
        facingEachOther: false,
        offline: true,
        offlineReason: this.offlineReason,
      });
    }
  }

  _loop = () => {
    if (!this.running) return;

    if (this.video && this.video.readyState >= 2 && this.landmarker) {
      const nowMs = performance.now();

      try {
        const result = this.landmarker.detectForVideo(this.video, nowMs);

        const faces = (result.faceLandmarks || []).map((landmarks) => ({
          landmarks,
          box: getBoundingBox(landmarks),
          direction: getDirection(landmarks),
        }));

        const { player1, player2 } = assignPlayers(faces);

        const rawFacing = computeRawFacingEachOther(player1, player2);
        const facingEachOther = this._debounceFacing(rawFacing, nowMs);

        this.onResults({
          faceCount: faces.length,
          player1,
          player2,
          facingEachOther,
          offline: false,
        });
      } catch (detectErr) {
        // Continue loop even if single frame fails
      }
    }

    this.rafId = requestAnimationFrame(this._loop);
  };

  _debounceFacing(rawFacing, nowMs) {
    if (rawFacing !== this.pendingFacing) {
      this.pendingFacing = rawFacing;
      this.pendingSince = nowMs;
    } else if (nowMs - this.pendingSince >= FACING_DEBOUNCE_MS) {
      this.stableFacing = rawFacing;
    }
    return this.stableFacing;
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.video) this.video.remove();
    this.landmarker = null;
    this.video = null;
    this.stream = null;
  }
}
