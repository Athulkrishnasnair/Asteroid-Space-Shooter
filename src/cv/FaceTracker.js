// FilesetResolver helps Mediapipe find/load files
// FaceLandmarker: AI model to detect face

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
 
//   Game specific logic
  const faceWidth = Math.abs(right.x - left.x);
  const mid = (left.x + right.x) / 2;
  const ratio = (nose.x - mid) / faceWidth;
 
//   Inject here for tuning
  if (ratio > DIRECTION_THRESHOLD) return "RIGHT";
  if (ratio < -DIRECTION_THRESHOLD) return "LEFT";
  return "CENTER";
}

// End of phase 2 later on

// Start of phase 3

// Leftmost face on screen = player1, rightmost = player2.
// Sorting by x each frame keeps the assignment stable even if
// MediaPipe reorders faces in its result array.

// Sort by nose x position

function assignPlayers(faces) {
  const sorted = [...faces].sort((a, b) => a.landmarks[NOSE_TIP].x - b.landmarks[NOSE_TIP].x);
  const player1 = sorted[0]
    ? { direction: sorted[0].direction, visible: true }
    : { direction: null, visible: false };
  const player2 = sorted[1]
    ? { direction: sorted[1].direction, visible: true }
    : { direction: null, visible: false };
  return { player1, player2 };
}

// Two players facing each other means player1 (left) looks RIGHT
// toward player2, and player2 (right) looks LEFT toward player1.
function computeRawFacingEachOther(player1, player2) {
  if (!player1.visible || !player2.visible) return false;
  return player1.direction === "RIGHT" && player2.direction === "LEFT";
}

//  constructor accepts options object
export class FaceTracker {
  constructor({ onResults } = {}) {

    // If onResults are given use it or not
    this.onResults = onResults || (() => {});
    this.landmarker = null;
    this.video = null;
    this.stream = null;
    this.rafId = null;
    this.running = false;
    this.stableFacing = false;
    this.pendingFacing = false;
    this.pendingSince = 0;
  }

//   Setup Fn
  async start() {

    // Load MediaPipe runtime
    const filesetResolver = await FilesetResolver.forVisionTasks(WASM_BASE_URL);

    // configures how detection behaves.
    this.landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "GPU", // falls back to CPU automatically if GPU isn't available
      },
      runningMode: "VIDEO", // we're feeding a continuous webcam stream, not single images
      numFaces: 2,          // we only ever care about 2 players
    });

    // Create a hidden <video> element to hold the webcam stream.
    // We don't need to show it to the player — PixiJS renders the game,
    // this is just the raw feed MediaPipe reads from.
    this.video = document.createElement("video");
    this.video.style.display = "none";
    this.video.playsInline = true;
    document.body.appendChild(this.video);

    // Tell broswer can i acess camera
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();

    this.running = true;
    this._loop();
  }

  // The detection loop: grabs the current video frame, runs the model,
  // hands results to whoever is listening, then schedules the next frame.
 _loop = () => {
  if (!this.running) return;

  if (this.video.readyState >= 2) {

    const nowMs = performance.now();

    const result =
      this.landmarker.detectForVideo(this.video, nowMs);

    const faces = result.faceLandmarks.map((landmarks) => ({
      landmarks,
      direction: getDirection(landmarks),
    }));

    const { player1, player2 } = assignPlayers(faces);

    const rawFacing =
      computeRawFacingEachOther(player1, player2);

    const facingEachOther =
      this._debounceFacing(rawFacing, nowMs);

    this.onResults({
      faceCount: faces.length,
      player1,
      player2,
      facingEachOther,
    });
  }

  this.rafId = requestAnimationFrame(this._loop);
};

  // Only flips stableFacing once rawFacing has held steady for
  // FACING_DEBOUNCE_MS, so one bad frame doesn't trigger a roast.
  _debounceFacing(rawFacing, nowMs) {
    if (rawFacing !== this.pendingFacing) {
      this.pendingFacing = rawFacing;
      this.pendingSince = nowMs;
    } else if (nowMs - this.pendingSince >= FACING_DEBOUNCE_MS) {
      this.stableFacing = rawFacing;
    }
    return this.stableFacing;
  }


  // Stops the loop and releases the camera. Call this when leaving
  // Level 2 / unmounting, so the webcam light turns off.
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

// Phase 2



