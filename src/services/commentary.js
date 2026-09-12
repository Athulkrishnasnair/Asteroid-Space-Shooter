// src/services/commentary.js
// Centralized Alien Commentary Manager.
// Manages subtitle dispatch, speech synthesis throttling, audio queueing, and lip-sync events.

import { voice } from "./voice.js";

class CommentaryManager {
    constructor() {
        this.dialogueListeners = new Set();
        this.mouthListeners = new Set();

        this.minIntervalMs = 3500; // 3.5s minimum spacing between spoken roasts
        this.lastSpokenTime = 0;
        this.isSpeaking = false;
        this.speechQueue = [];
        this.lastSpokenText = "";
    }

    // Register a dialogue box or UI element to receive alien text subtitles
    onDialogue(callback) {
        this.dialogueListeners.add(callback);
        return () => this.dialogueListeners.delete(callback);
    }

    // Register an alien animated sprite to flap mouth during speech
    onMouthFlap(callback) {
        this.mouthListeners.add(callback);
        return () => this.mouthListeners.delete(callback);
    }

    // Dispatches subtitle text to all registered HUDs
    _emitDialogue(text, duration = 4.0) {
        for (const listener of this.dialogueListeners) {
            try {
                listener(text, duration);
            } catch (e) {
                console.warn("Dialogue listener error:", e);
            }
        }
    }

    // Toggles mouth talking animation
    _emitMouth(isTalking) {
        for (const listener of this.mouthListeners) {
            try {
                listener(isTalking);
            } catch (e) {}
        }
    }

    /**
     * Primary entry point to trigger alien commentary.
     * @param {string} text - The line of dialogue to speak and display.
     * @param {object} options - { force: boolean, textOnly: boolean, duration: number }
     */
    async say(text, options = {}) {
        if (!text || typeof text !== "string") return false;

        const trimmed = text.trim();
        if (!trimmed) return false;

        const now = Date.now();
        const duration = options.duration || 4.0;

        // 1. Always display subtitle text immediately
        this._emitDialogue(trimmed, duration);

        if (options.textOnly) {
            return true;
        }

        // 2. Prevent repeating identical line back-to-back
        if (trimmed === this.lastSpokenText && now - this.lastSpokenTime < 6000) {
            return false;
        }

        // 3. Check minimum speech interval to prevent audio spam
        if (!options.force && (this.isSpeaking || now - this.lastSpokenTime < this.minIntervalMs)) {
            return false;
        }

        this.lastSpokenTime = now;
        this.lastSpokenText = trimmed;
        this.isSpeaking = true;
        this._emitMouth(true);

        try {
            // Call Piper TTS via backend
            await voice.speak(trimmed);
        } catch (err) {
            console.warn("CommentaryManager speech synthesis error:", err);
        } finally {
            this.isSpeaking = false;
            this._emitMouth(false);
        }

        return true;
    }

    /**
     * Helper to fetch contextual roast text and speak it.
     * @param {string} eventCategory - e.g. "MAZE_START", "FACING_WRONG", "SUBWAY_JUMP"
     * @param {object} context - gameplay metadata
     * @param {object} options - say options
     */
    async roast(eventCategory, context = {}, options = {}) {
        try {
            const text = await voice.requestRoast(eventCategory, context);
            if (text) {
                return this.say(text, options);
            }
        } catch (err) {
            console.warn("CommentaryManager.roast error:", err);
        }
        return false;
    }
}

export const commentary = new CommentaryManager();
