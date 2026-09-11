import os
import sys
import uuid
import logging
from pathlib import Path

from flask import Flask, jsonify, request, send_file
from flask_cors import CORS

# ============================================================
# Configuration
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

TEMP_DIR = BASE_DIR / "temp"


# Make sure temporary files have somewhere to go.
TEMP_DIR.mkdir(parents=True, exist_ok=True)


# ============================================================
# Flask application
# ============================================================

app = Flask(__name__)

# Vite normally runs on localhost:5173.
# CORS allows the browser frontend to communicate with Flask.
CORS(app)


# Basic server-side logging.
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============================================================
# Health check
# ============================================================

@app.get("/api/health")
def health():
    """
    Used by the frontend and us to verify that Flask is alive.
    """

    return jsonify({
        "status": "ok",
        "service": "alien-game-backend"
    })


# ============================================================
# Speech-to-text
# ============================================================

@app.post("/api/transcribe")
def transcribe():
    """
    Receive a short microphone recording and send it to Whisper.

    Request:
        multipart/form-data
        audio=<audio file>

    Response:
        {
            "text": "recognized speech"
        }
    """

    if "audio" not in request.files:
        return jsonify({
            "error": "No audio file provided"
        }), 400

    audio_file = request.files["audio"]

    if not audio_file.filename:
        return jsonify({
            "error": "Empty audio filename"
        }), 400

    # Give the uploaded file a random name so simultaneous
    # requests cannot overwrite each other.
    filename = f"{uuid.uuid4()}.webm"
    audio_path = TEMP_DIR / filename

    try:
        audio_file.save(audio_path)

        logger.info("Audio received: %s", filename)

        # Claude will implement this service.
        from services.whisper_service import transcribe_audio

        text = transcribe_audio(str(audio_path))

        if text is None:
            text = ""

        text = str(text).strip()

        return jsonify({
            "text": text
        })

    except ImportError:
        logger.exception("Whisper service is not installed yet.")

        return jsonify({
            "error": "Whisper service is not configured yet"
        }), 503

    except Exception:
        logger.exception("Whisper transcription failed.")

        return jsonify({
            "error": "Transcription failed"
        }), 500

    finally:
        # Microphone recordings are temporary.
        # Do not keep user audio after transcription.
        try:
            if audio_path.exists():
                audio_path.unlink()
        except Exception:
            logger.exception("Could not delete temporary audio file.")


# ============================================================
# Text-to-speech
# ============================================================

@app.post("/api/speak")
def speak():
    """
    Convert text into speech using Piper.

    Request:
        {
            "text": "Alien commentary goes here"
        }

    Response:
        WAV audio.
    """

    data = request.get_json(silent=True)

    if not data:
        return jsonify({
            "error": "JSON body required"
        }), 400

    text = data.get("text")

    if not isinstance(text, str):
        return jsonify({
            "error": "text must be a string"
        }), 400

    text = text.strip()

    if not text:
        return jsonify({
            "error": "Text cannot be empty"
        }), 400

    # Keep accidental huge requests away from Piper.
    if len(text) > 500:
        return jsonify({
            "error": "Text is too long"
        }), 400

    filename = f"{uuid.uuid4()}.wav"
    output_path = TEMP_DIR / filename

    try:
        logger.info("Generating speech.")

        # Claude will implement this service.
        from services.piper_service import synthesize

        synthesize(text, str(output_path))

        if not output_path.exists():
            logger.error("Piper did not create the WAV file.")

            return jsonify({
                "error": "Speech generation failed"
            }), 500

        # The file is deleted after Flask finishes sending it.
        response = send_file(
            output_path,
            mimetype="audio/wav",
            as_attachment=False
        )

        @response.call_on_close
        def cleanup():
            try:
                if output_path.exists():
                    output_path.unlink()
            except Exception:
                logger.exception(
                    "Could not delete generated audio."
                )

        return response

    except ImportError:
        logger.exception("Piper service is not installed yet.")

        return jsonify({
            "error": "Piper service is not configured yet"
        }), 503

    except Exception:
        logger.exception("Piper synthesis failed.")

        # Make sure a failed request doesn't leave audio behind.
        try:
            if output_path.exists():
                output_path.unlink()
        except Exception:
            pass

        return jsonify({
            "error": "Speech generation failed"
        }), 500


# ============================================================
# Alien roast / AI commentary
# ============================================================

FALLBACK_ROASTS = {
    "LEVEL1_START": [
        "Custody protocol CV-07 is active. Try not to embarrass your species.",
        "Welcome to Sector CV-07. Please file all collision reports in triplicate.",
        "Your vessel is unauthorized. Interception will be swift and sarcastic.",
    ],

    "PLAYER_MISSED": [
        "That was certainly a tactical decision.",
        "The alien saw that coming from another galaxy.",
        "Central Vienium has questions about that shot.",
        "Space is 99.9% empty, but you are really proving it.",
    ],

    "ALIEN_HIT": [
        "Congratulations. You have successfully annoyed the alien.",
        "That alien definitely felt that.",
        "One less unregistered organism in Sector CV-07.",
        "Target liquidated. Custodial fees have been applied.",
    ],

    "POWER_UP": [
        "Emergency thrusters engaged! Speed limits were merely polite suggestions.",
        "Running away at 175% velocity. Very brave.",
        "Ion overdrive active. Try not to crash into a meteor.",
    ],

    "GOLDEN_SPAWN": [
        "Priority contraband vessel detected! Neutralize it for sector clearance!",
        "Golden interceptor incoming! This is your ticket out of here.",
    ],

    "GOLDEN_HIT": [
        "Golden ship neutralized! Triplicate clearance filed.",
        "Flagship down! Central Vienium dispatch is moderately stunned.",
    ],

    "LEVEL1_COMPLETE": [
        "Against all available evidence, you survived the airspace.",
        "Central Vienium is reconsidering your threat level from zero to minimal.",
        "Sector cleared. Do not celebrate too early.",
    ],

    "MAZE_START": [
        "Welcome to the relationship maze. Try not to get lost immediately.",
        "Entering cooperative evaluation grid. Eye contact is now mandatory.",
        "Two humans enter. Hopefully two humans exit with working teamwork.",
    ],

    "FACING_GOOD": [
        "Remarkable. Both test subjects are acknowledging each other's existence.",
        "Optimal team alignment detected. Keep looking toward each other.",
        "Eye contact maintained. Central Vienium metrics look surprisingly adequate.",
    ],

    "FACING_WRONG": [
        "Perhaps looking at your teammate would be useful.",
        "Your partner is over there. Just saying.",
        "The alien recommends turning toward each other before you run into a wall.",
        "Your teamwork has entered experimental territory.",
    ],

    "FACE_LOST": [
        "I appear to have misplaced one human. Did someone wander off?",
        "Player tracking interrupted. Please remain in visual range.",
        "Central Vienium observation lost visual on one crew member.",
    ],

    "MAZE_STUCK": [
        "This maze is not exactly advanced alien architecture.",
        "The walls do not move. You, however, are not moving either.",
        "Navigation assistance is not available under current budget constraints.",
    ],

    "MAZE_COMPLETE": [
        "Against all available evidence, cooperation has occurred.",
        "Custody evaluation finished. You are legally allowed to tolerate each other.",
        "Relationship protocol satisfied. Central Vienium certifies your survival.",
    ],

    "PLAYER_DOWN": [
        "Central Vienium is reconsidering your recruitment.",
        "That could have gone better. Substantially better.",
        "Hull integrity compromised. That will not buff out easily.",
    ],

    "PLAYER_LOST": [
        "Custody enforced permanently. Better luck in the next life cycle.",
        "Mission failed. Central Vienium sends its minimal condolences.",
    ],

    "UNKNOWN": [
        "The alien has no comment. Yet.",
        "Interesting. Very interesting.",
        "I have several questions about that decision.",
    ],
}



@app.post("/api/roast")
def roast():
    """
    Return alien commentary.

    IMPORTANT:
    The backend does NOT decide game outcomes.

    Game.js decides whether something happened.
    This endpoint only supplies commentary.

    Later, this function can call an LLM instead of using
    the fallback dictionary without changing the frontend API.
    """

    data = request.get_json(silent=True) or {}

    event = data.get("event", "UNKNOWN")

    if not isinstance(event, str):
        event = "UNKNOWN"

    event = event.upper()

    # For now we use deterministic fallback commentary.
    # Claude/another integration can replace this with an LLM.
    import random

    choices = FALLBACK_ROASTS.get(
        event,
        FALLBACK_ROASTS["UNKNOWN"]
    )

    selected = random.choice(choices)

    return jsonify({
        "text": selected
    })


# ============================================================
# Error handlers
# ============================================================

@app.errorhandler(404)
def not_found(error):
    return jsonify({
        "error": "Endpoint not found"
    }), 404


@app.errorhandler(405)
def method_not_allowed(error):
    return jsonify({
        "error": "Method not allowed"
    }), 405


@app.errorhandler(500)
def internal_error(error):
    logger.exception("Internal server error.")

    return jsonify({
        "error": "Internal server error"
    }), 500


# ============================================================
# Development server
# ============================================================

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )