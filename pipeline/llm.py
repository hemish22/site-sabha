"""Sarvam-105B calls: structure the briefing, check permit gaps, grade answers."""
import json
import re

from .client import PROMPTS, cached, get_client

MODEL = "sarvam-105b"

_STR = {"type": "string"}

BRIEFING_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["site", "hazards", "ppe", "tasks", "emergency", "quiz"],
    "properties": {
        "site": _STR,
        "hazards": {"type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "required": ["item", "control", "source"],
            "properties": {"item": _STR, "control": _STR,
                           "source": {"type": "string", "enum": ["briefing", "permit"]}}}},
        "ppe": {"type": "array", "items": _STR},
        "tasks": {"type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "required": ["crew", "task"], "properties": {"crew": _STR, "task": _STR}}},
        "emergency": {"type": "object", "additionalProperties": False,
                      "required": ["assembly_point", "contact"],
                      "properties": {"assembly_point": _STR, "contact": _STR}},
        "quiz": {"type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "required": ["q", "expected_answer"],
            "properties": {"q": _STR, "expected_answer": _STR}}},
    },
}

GAPS_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["gaps"],
    "properties": {"gaps": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "required": ["missing", "permit_line", "severity"],
        "properties": {"missing": _STR, "permit_line": _STR,
                       "severity": {"type": "string", "enum": ["high", "med", "low"]}}}}},
}

GRADE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["verdict", "reason"],
    "properties": {
        "verdict": {"type": "string", "enum": ["understood", "partial", "not_understood"]},
        "reason": _STR,
    },
}


def _prompt(name: str, **vals) -> str:
    # Plain replace, not str.format: the templates contain literal JSON braces.
    text = (PROMPTS / f"{name}.txt").read_text()
    for k, v in vals.items():
        text = text.replace("{" + k + "}", str(v))
    return text


def _parse_json(text: str):
    text = re.sub(r"<think>.*?</think>", "", text or "", flags=re.S).strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.S)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = min((i for i in (text.find("{"), text.find("[")) if i >= 0), default=-1)
        if start < 0:
            raise
        end = max(text.rfind("}"), text.rfind("]"))
        return json.loads(text[start:end + 1])


@cached("llm")
def _chat_json(prompt: str, schema_name: str, schema: dict) -> dict:
    client = get_client()
    messages = [{"role": "user", "content": prompt}]
    fmt = {"type": "json_schema", "json_schema": {"name": schema_name, "strict": True, "schema": schema}}
    last_err = None
    for attempt in range(3):
        # Reasoning off: even "low" burns the whole max_tokens budget thinking and
        # returns empty content for the structure prompt (~67 s). Off: ~5 s, valid JSON.
        kwargs = dict(model=MODEL, messages=messages, temperature=0.2,
                      reasoning_effort=None, max_tokens=4096)
        if attempt < 2:
            kwargs["response_format"] = fmt
        try:
            r = client.chat.completions(**kwargs)
            return _parse_json(r.choices[0].message.content)
        except Exception as e:  # bad JSON or schema rejected: retry, finally without response_format
            last_err = e
    raise RuntimeError(f"sarvam-105b did not return valid JSON: {last_err}")


def structure(transcript: str, permit_text: str, glossary: list[str]) -> dict:
    out = _chat_json(
        _prompt("structure", transcript=transcript, permit=permit_text or "(no permit provided)",
                glossary=", ".join(glossary)),
        "briefing", BRIEFING_SCHEMA,
    )
    out["hazards"] = [h for h in out.get("hazards", []) if h.get("source") in ("briefing", "permit")]
    return out


def gap_check(permit_text: str, transcript: str) -> list[dict]:
    if not permit_text:
        return []
    out = _chat_json(_prompt("gap_check", permit=permit_text, transcript=transcript), "gaps", GAPS_SCHEMA)
    return out["gaps"] if isinstance(out, dict) else out


def grade(q: str, expected_answer: str, transcript: str, lang: str) -> dict:
    if not transcript.strip():
        return {"verdict": "not_understood", "reason": "No answer was heard."}
    return _chat_json(
        _prompt("grade", q=q, expected_answer=expected_answer, transcript=transcript, lang=lang),
        "grade", GRADE_SCHEMA,
    )
