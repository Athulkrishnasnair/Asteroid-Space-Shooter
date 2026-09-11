// src/services/voice.js
// Centralized service for Flask backend communication (Whisper, Piper, AI roasts).
// Designed for high resilience: never freezes the Pixi ticker or crashes if backend is offline.

const BACKEND_URL = "http://localhost:5000";
const REQUEST_TIMEOUT_MS = 5000;

// Local fallback roasts matching Central Vienium comedic style
const LOCAL_FALLBACK_ROASTS = {
    LEVEL1_START: [
        "Custody protocol CV-07 is active. Try not to embarrass your species.",
        "Welcome to Sector CV-07. Please file all collision reports in triplicate.",
    ],
    PLAYER_MISSED: [
        "That was certainly a tactical decision.",
        "The alien saw that coming from another galaxy.",
        "Space is 99.9% empty, but you are really proving it.",
    ],
    ALIEN_HIT: [
        "Congratulations. You have successfully annoyed the alien.",
        "That alien definitely felt that.",
        "Target liquidated. Custodial fees applied.",
    ],
    POWER_UP: [
        "Emergency thrusters engaged! Running away at 175% velocity.",
        "Ion overdrive active. Try not to crash into a meteor.",
    ],
    GOLDEN_SPAWN: [
        "Priority contraband vessel detected! Neutralize it for sector clearance!",
    ],
    GOLDEN_HIT: [
        "Golden ship neutralized! Sector CV-07 custody clearance filed.",
    ],
    LEVEL1_COMPLETE: [
        "Against all available evidence, you survived Sector CV-07.",
        "Central Vienium dispatch is moderately stunned. Proceeding to evaluation.",
    ],
    MAZE_START: [
        "Welcome to the relationship maze. Try not to get lost immediately.",
        "Cooperative evaluation grid active. Eye contact is now mandatory.",
    ],
    FACING_GOOD: [
        "Remarkable. Both test subjects are acknowledging each other's existence.",
        "Optimal team alignment detected. Keep looking toward each other.",
    ],
    FACING_WRONG: [
        "Perhaps looking at your teammate would be useful.",
        "Your partner is over there. Just saying.",
        "The alien recommends turning toward each other before hitting a wall.",
    ],
    FACE_LOST: [
        "I appear to have misplaced one human. Please return to observation range.",
        "Central Vienium observation lost visual on one crew member.",
    ],
    MAZE_STUCK: [
        "This maze is not exactly advanced alien architecture.",
        "The walls do not move. You, however, are not moving either.",
    ],
    MAZE_COMPLETE: [
        "Against all available evidence, cooperation has occurred.",
        "Custody evaluation finished. You are legally allowed to tolerate each other.",
    ],
    PLAYER_DOWN: [
        "Central Vienium is reconsidering your recruitment.",
        "That could have gone better. Substantially better.",
    ],
    PLAYER_LOST: [
        "Custody enforced permanently. Better luck in the next life cycle.",
    ],
    UNKNOWN: [
        "Central Vienium has several questions about that decision.",
    ],
};

class VoiceService {
    constructor() {
        this.backendAvailable = null; // null = unverified, true/false
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recordingPromise = null;
        this.currentAudio = null;
        this.isSpeaking = false;
        this.lastRoastTimes = {};
    }

    // Helper: fetch with timeout
    async _fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timer);
            return res;
        } catch (err) {
            clearTimeout(timer);
            throw err;
        }
    }

    // Check if Flask backend is currently responsive
    async checkHealth() {
        try {
            const res = await this._fetchWithTimeout(`${BACKEND_URL}/api/health`, {}, 2000);
            if (res.ok) {
                const data = await res.json();
                this.backendAvailable = data.status === "ok";
                return this.backendAvailable;
            }
        } catch (e) {
            // Backend offline
        }
        this.backendAvailable = false;
        return false;
    }

    // Request alien commentary text from /api/roast or local fallback
    async requestRoast(event, context = {}) {
        const category = (event || "UNKNOWN").toUpperCase();

        try {
            const res = await this._fetchWithTimeout(`${BACKEND_URL}/api/roast`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ event: category, context }),
            }, 3000);

            if (res.ok) {
                const data = await res.json();
                if (data && data.text) {
                    return data.text;
                }
            }
        } catch (err) {
            // Backend unreachable, silent fallback
        }

        // Return curated local fallback roast
        const list = LOCAL_FALLBACK_ROASTS[category] || LOCAL_FALLBACK_ROASTS.UNKNOWN;
        return list[Math.floor(Math.random() * list.length)];
    }

    // Synthesize text with Piper via /api/speak and play WAV audio
    async speak(text) {
        if (!text || typeof text !== "string") return false;

        try {
            const res = await this._fetchWithTimeout(`${BACKEND_URL}/api/speak`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text }),
            }, 6000);

            if (!res.ok) {
                console.warn("Piper synthesis returned non-OK status:", res.status);
                return false;
            }

            const blob = await res.blob();
            const audioUrl = URL.createObjectURL(blob);

            // Stop any currently playing alien speech
            if (this.currentAudio) {
                this.currentAudio.pause();
                this.currentAudio = null;
            }

            const audio = new Audio(audioUrl);
            audio.volume = 0.85;
            this.currentAudio = audio;
            this.isSpeaking = true;

            return new Promise((resolve) => {
                const cleanup = () => {
                    this.isSpeaking = false;
                    URL.revokeObjectURL(audioUrl);
                    if (this.currentAudio === audio) {
                        this.currentAudio = null;
                    }
                    resolve(true);
                };

                audio.onended = cleanup;
                audio.onerror = cleanup;

                audio.play().catch((playErr) => {
                    console.warn("Audio autoplay prevented or error:", playErr);
                    cleanup();
                });
            });
        } catch (err) {
            console.warn("VoiceService.speak error (continuing without audio):", err);
            return false;
        }
    }

    // Speak commentary and return the text (so caller can update HUD simultaneously)
    async commentate(event, context = {}) {
        const text = await this.requestRoast(event, context);
        // Trigger speech asynchronously without blocking caller
        this.speak(text).catch(() => {});
        return text;
    }

    // Start 2-5s microphone recording for player speech input
    async startRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
            return true;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioChunks = [];
            this.mediaRecorder = new MediaRecorder(stream);

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.start();
            return true;
        } catch (err) {
            console.warn("Microphone access denied or unavailable:", err);
            return false;
        }
    }

    // Stop microphone recording and return audio Blob
    async stopRecording() {
        return new Promise((resolve) => {
            if (!this.mediaRecorder || this.mediaRecorder.state !== "recording") {
                resolve(null);
                return;
            }

            this.mediaRecorder.onstop = () => {
                const mimeType = this.mediaRecorder.mimeType || "audio/webm";
                const audioBlob = new Blob(this.audioChunks, { type: mimeType });
                // Clean up media tracks so recording indicator turns off
                if (this.mediaRecorder.stream) {
                    this.mediaRecorder.stream.getTracks().forEach((track) => track.stop());
                }
                this.mediaRecorder = null;
                resolve(audioBlob);
            };

            this.mediaRecorder.stop();
        });
    }

    // Transcribe audio Blob using /api/transcribe (Whisper)
    async transcribeAudio(audioBlob) {
        if (!audioBlob) return "";

        try {
            const formData = new FormData();
            formData.append("audio", audioBlob, "speech.webm");

            const res = await this._fetchWithTimeout(`${BACKEND_URL}/api/transcribe`, {
                method: "POST",
                body: formData,
            }, 8000);

            if (res.ok) {
                const data = await res.json();
                return data.text || "";
            }
        } catch (err) {
            console.warn("Transcription failed or backend offline:", err);
        }
        return "";
    }
}

export const voice = new VoiceService();
