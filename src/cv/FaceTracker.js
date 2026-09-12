// src/cv/FaceTracker.js
// FilesetResolver helps MediaPipe find/load files
// FaceLandmarker: AI model to detect faces and compute smoothed head directions

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// Locations of files
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const WASM_BASE_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

// Landmark indices
const LEFT_EDGE = 234;
const RIGHT_EDGE = 454;
const NOSE_TIP = 1;
const TOP_HEAD = 10;
const CHIN = 152;

// Dead-zone and sensitivity thresholds
const HORIZONTAL_THRESHOLD = 0.14; // Horizontal turning threshold
const VERTICAL_DOWN_THRESHOLD = 0.07; // Looking down/backward
const VERTICAL_UP_THRESHOLD = -0.14; // Looking up

const FACING_DEBOUNCE_MS = 250; // Stable facing debounce
const DIRECTION_DEBOUNCE_MS = 180; // Minimum time direction must hold to flip state
const ROLLING_WINDOW_SIZE = 8; // Number of historical frames for dominant voting

function getRawDirection(landmarks) {
  const left = landmarks[LEFT_EDGE];
  const right = landmarks[RIGHT_EDGE];
  const nose = landmarks[NOSE_TIP];
  const top = landmarks[TOP_HEAD];
  const chin = landmarks[CHIN];

  if (!left || !right || !nose) return "CENTER";

  // Horizontal calculation
  const faceWidth = Math.abs(right.x - left.x);
  if (faceWidth === 0) return "CENTER";

  const midX = (left.x + right.x) / 2;
  const ratioX = (nose.x - midX) / faceWidth;

  // Prioritize clear left / right head turns
  if (ratioX > HORIZONTAL_THRESHOLD) return "RIGHT";
  if (ratioX < -HORIZONTAL_THRESHOLD) return "LEFT";

  // Vertical calculation when horizontal is centered
  if (top && chin) {
    const faceHeight = Math.abs(chin.y - top.y);
    if (faceHeight > 0) {
      const midY = (top.y + chin.y) / 2;
      const ratioY = (nose.y - midY) / faceHeight;
      if (ratioY > VERTICAL_DOWN_THRESHOLD) return "DOWN";
      if (ratioY < VERTICAL_UP_THRESHOLD) return "UP";
    }
  }

  return "CENTER";
}

class DirectionFilter {
  constructor() {
    this.history = [];
    this.stableDirection = "CENTER";
    this.pendingDirection = "CENTER";
    this.pendingSince = 0;
  }

  update(rawDir, nowMs) {
    // Maintain rolling buffer
    this.history.push(rawDir);
    if (this.history.length > ROLLING_WINDOW_SIZE) {
      this.history.shift();
    }

    // Count frequency of each direction in rolling window
    const counts = {};
    for (const d of this.history) {
      counts[d] = (counts[d] || 0) + 1;
    }

    // Find dominant direction
    let dominant = rawDir;
    let maxCount = 0;
    for (const [dir, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        dominant = dir;
      }
    }

    // Require majority (at least 60% of window) to consider state change
    const majorityThreshold = Math.ceil(this.history.length * 0.6);
    if (maxCount >= majorityThreshold) {
      if (dominant !== this.pendingDirection) {
        this.pendingDirection = dominant;
        this.pendingSince = nowMs;
      } else if (nowMs - this.pendingSince >= DIRECTION_DEBOUNCE_MS) {
        this.stableDirection = dominant;
      }
    }

    return this.stableDirection;
  }

  reset() {
    this.history = [];
    this.stableDirection = "CENTER";
    this.pendingDirection = "CENTER";
    this.pendingSince = 0;
  }
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

// Leftmost face on screen = player1, rightmost = player2
function assignPlayers(faces) {
  const sorted = [...faces].sort((a, b) => a.landmarks[NOSE_TIP].x - b.landmarks[NOSE_TIP].x);
  const player1 = sorted[0]
    ? {
        rawDirection: sorted[0].rawDirection,
        visible: true,
        landmarks: sorted[0].landmarks,
        box: sorted[0].box,
      }
    : { rawDirection: "CENTER", visible: false, landmarks: null, box: null };
  const player2 = sorted[1]
    ? {
        rawDirection: sorted[1].rawDirection,
        visible: true,
        landmarks: sorted[1].landmarks,
        box: sorted[1].box,
      }
    : { rawDirection: "CENTER", visible: false, landmarks: null, box: null };
  return { player1, player2 };
}

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

    this.filterP1 = new DirectionFilter();
    this.filterP2 = new DirectionFilter();

    this.stableFacing = false;
    this.pendingFacing = false;
    this.pendingSince = 0;
  }

  getVideoElement() {
    return this.video;
  }

  async start() {
    try {
      const filesetResolver = await FilesetResolver.forVisionTasks(WASM_BASE_URL);

      this.landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 2,
      });

      this.video = document.createElement("video");
      this.video.style.display = "none";
      this.video.playsInline = true;
      this.video.muted = true;
      document.body.appendChild(this.video);

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
      console.warn("FaceTracker initialization notice (running in manual fallback):", err);
      this.isOffline = true;
      this.offlineReason = err.name || "Camera unavailable";
      this.running = false;

      this.onResults({
        faceCount: 0,
        player1: { visible: false, direction: "CENTER", landmarks: null, box: null },
        player2: { visible: false, direction: "CENTER", landmarks: null, box: null },
        agreedDirection: null,
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
          rawDirection: getRawDirection(landmarks),
        }));

        const { player1, player2 } = assignPlayers(faces);

        // Apply rolling window direction smoothing
        player1.direction = player1.visible
          ? this.filterP1.update(player1.rawDirection, nowMs)
          : "CENTER";
        player2.direction = player2.visible
          ? this.filterP2.update(player2.rawDirection, nowMs)
          : "CENTER";

        // Compute cooperative agreement between both players
        let agreedDirection = null;
        if (player1.visible && player2.visible) {
          if (player1.direction === player2.direction) {
            agreedDirection = player1.direction; // LEFT, RIGHT, UP, DOWN, or CENTER
          } else {
            agreedDirection = "DISAGREED";
          }
        } else if (player1.visible) {
          agreedDirection = player1.direction;
        } else if (player2.visible) {
          agreedDirection = player2.direction;
        }

        const rawFacing = computeRawFacingEachOther(player1, player2);
        const facingEachOther = this._debounceFacing(rawFacing, nowMs);

        this.onResults({
          faceCount: faces.length,
          player1,
          player2,
          agreedDirection,
          facingEachOther,
          offline: false,
        });
      } catch (detectErr) {
        // Continue loop gracefully
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
    this.filterP1.reset();
    this.filterP2.reset();
  }
}
