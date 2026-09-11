import os
import uuid
import logging
from pathlib import Path

from flask import Flask, jsonify, request, send_file
from flask_cors import CORS


# ============================================================
# Configuration
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
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
    "PLAYER_MISSED": [
        "That was certainly a tactical decision.",
        "The alien saw that coming from another galaxy.",
        "Central Vienium has questions about that shot.",
    ],

    "ALIEN_HIT": [
        "Congratulations. You have successfully annoyed the alien.",
        "That alien definitely felt that.",
        "One less problem floating around in space.",
    ],

    "FACING_WRONG": [
        "Perhaps look at your teammate instead of the void.",
        "Your teammate is over there. Just saying.",
        "The alien recommends turning around.",
    ],

    "PLAYER_DOWN": [
        "Central Vienium is reconsidering your recruitment.",
        "That could have gone better.",
        "Your tactical situation is becoming questionable.",
    ],

    "LEVEL_COMPLETE": [
        "Against all available evidence, you survived.",
        "Central Vienium is almost impressed.",
        "Mission accomplished. Somehow.",
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