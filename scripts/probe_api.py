"""One tiny live call per Sarvam product; prints response shapes. Bypasses the cache."""
import base64
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.client import get_client  # noqa: E402

c = get_client()

r = c.text.translate(input="Wear your helmet.", source_language_code="en-IN",
                     target_language_code="od-IN", model="sarvam-translate:v1")
print("translate:", r.translated_text)

t = c.text_to_speech.convert(text=r.translated_text, language_code="od-IN", model="bulbul:v3",
                             speaker="shubh", output_audio_codec="wav")
wav = base64.b64decode(t.audios[0])
print("tts: n_audios", len(t.audios), "bytes", len(wav), "header", wav[:4])

s = c.speech_to_text.transcribe(file=("a.wav", wav, "audio/wav"), model="saaras:v4",
                                mode="transcribe", language_code="od-IN")
print("stt:", s.transcript, s.language_code)

m = c.chat.completions(model="sarvam-105b", reasoning_effort="low",
                       messages=[{"role": "user", "content": 'Reply with JSON {"ok": true}'}],
                       response_format={"type": "json_schema", "json_schema": {
                           "name": "ok", "strict": True, "schema": {
                               "type": "object", "additionalProperties": False, "required": ["ok"],
                               "properties": {"ok": {"type": "boolean"}}}}})
print("chat:", repr(m.choices[0].message.content), m.usage)
print("OK")
