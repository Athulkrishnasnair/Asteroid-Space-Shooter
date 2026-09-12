import os
import logging
import threading
from pathlib import Path

logger = logging.getLogger(__name__)

_whisper_lock = threading.Lock()
_whisper_instance = None


def get_whisper_model():
    """
    Lazily loads and returns the Faster-Whisper singleton instance.
    Uses WHISPER_MODEL_SIZE, WHISPER_DEVICE, WHISPER_COMPUTE_TYPE, WHISPER_MODEL_DIR.
    """
    global _whisper_instance
    if _whisper_instance is not None:
        return _whisper_instance

    with _whisper_lock:
        if _whisper_instance is not None:
            return _whisper_instance

        model_size = os.getenv("WHISPER_MODEL_SIZE", "tiny.en")
        device = os.getenv("WHISPER_DEVICE", "cpu")
        compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
        download_root = os.getenv("WHISPER_MODEL_DIR", None)

        logger.info(
            "Loading Whisper model (size=%s, device=%s, compute_type=%s)",
            model_size,
            device,
            compute_type,
        )
        from faster_whisper import WhisperModel

        _whisper_instance = WhisperModel(
            model_size,
            device=device,
            compute_type=compute_type,
            download_root=download_root,
        )
        logger.info("Whisper model loaded successfully.")
        return _whisper_instance


def transcribe_audio(file_path: str) -> str:
    """
    Transcribes an audio file into text using faster-whisper.
    Returns stripped string (or empty string if nothing detected).
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Audio file not found: {file_path}")

    model = get_whisper_model()

    with _whisper_lock:
        segments, info = model.transcribe(
            file_path,
            beam_size=1,
            language="en",
            vad_filter=True,
        )
        texts = [segment.text for segment in segments]
        transcribed_text = " ".join(texts).strip()

    logger.info("Transcribed audio '%s' -> '%s'", file_path, transcribed_text)
    return transcribed_text
