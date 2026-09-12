import os
import wave
import logging
import threading
from pathlib import Path

logger = logging.getLogger(__name__)

_voice_lock = threading.Lock()
_voice_instance = None

BASE_DIR = Path(__file__).resolve().parent.parent

DEFAULT_MODEL_PATH = BASE_DIR / "models" / "piper" / "en_US-lessac-medium.onnx"
DEFAULT_CONFIG_PATH = BASE_DIR / "models" / "piper" / "en_US-lessac-medium.onnx.json"


def get_voice():
    """
    Lazily loads and returns the PiperVoice singleton instance.
    Uses PIPER_MODEL_PATH and PIPER_CONFIG_PATH environment variables if set.
    """
    global _voice_instance
    if _voice_instance is not None:
        return _voice_instance

    with _voice_lock:
        if _voice_instance is not None:
            return _voice_instance

        model_path = os.getenv("PIPER_MODEL_PATH", str(DEFAULT_MODEL_PATH))
        config_path = os.getenv("PIPER_CONFIG_PATH", str(DEFAULT_CONFIG_PATH))

        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Piper model not found at: {model_path}")
        if not os.path.exists(config_path):
            raise FileNotFoundError(f"Piper config not found at: {config_path}")

        logger.info("Loading Piper model from %s", model_path)
        import piper

        _voice_instance = piper.PiperVoice.load(model_path, config_path)
        logger.info("Piper voice model loaded successfully.")
        return _voice_instance


def synthesize(text: str, output_wav_path: str) -> None:
    """
    Synthesizes speech text into a WAV file at output_wav_path.
    """
    voice = get_voice()
    output_path = Path(output_wav_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with _voice_lock:
        with wave.open(str(output_path), "wb") as wav_file:
            voice.synthesize_wav(text, wav_file)

    logger.info("Speech synthesis complete: %s (%d bytes)", output_wav_path, output_path.stat().st_size)
