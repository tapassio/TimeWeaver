"""
Schritt E – LLM-Verifikation NUR für Kandidatenpaare über Schwelle.
Teuer/langsam → Kosten klein halten, aber Begründung liefern die Programmleitende verstehen.
"""
from __future__ import annotations

import json
from typing import Literal, Protocol

PROMPT_TEMPLATE = """\
Du bist Experte für Curriculum-Design an einer Hochschule.
Vergleiche die folgenden zwei Learning-Cycle-Beschreibungen aus demselben
Masterprogramm und beurteile, ob sie sich inhaltlich überschneiden.

Learning Cycle A — Modul "{module_a}", LC{lc_a_num}:
"{content_a}"

Learning Cycle B — Modul "{module_b}", LC{lc_b_num}:
"{content_b}"

Antworte NUR mit folgendem JSON, ohne weiteren Text:
{{
  "overlap": "none" | "partial" | "high",
  "explanation": "ein bis zwei Sätze auf Deutsch",
  "confidence": <Zahl zwischen 0 und 1>
}}
"""


class LlmVerifier(Protocol):
    def verify(
        self, module_a: str, lc_a_num: int, content_a: str, module_b: str, lc_b_num: int, content_b: str
    ) -> dict:
        """Return {"overlap": "none|partial|high", "explanation": str, "confidence": float}"""


class OllamaLlmVerifier:
    """Lokal via Ollama – Empfehlung: qwen3:8b (Apache 2.0, mehrsprachig DE/EN)."""

    def __init__(self, model: str = "qwen3:8b", host: str = "http://localhost:11434"):
        self.model = model
        self.host = host.rstrip("/")

    def verify(self, module_a, lc_a_num, content_a, module_b, lc_b_num, content_b) -> dict:
        import requests

        prompt = PROMPT_TEMPLATE.format(
            module_a=module_a, lc_a_num=lc_a_num, content_a=content_a,
            module_b=module_b, lc_b_num=lc_b_num, content_b=content_b,
        )
        r = requests.post(
            f"{self.host}/api/chat",
            json={
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "format": "json",
                "stream": False,
            },
            timeout=120,
        )
        r.raise_for_status()
        return json.loads(r.json()["message"]["content"])


class ClaudeLlmVerifier:
    """Cloud via Anthropic Claude – beste Qualität für Erklärungstext."""

    def __init__(self, api_key: str, model: str = "claude-sonnet-4-20250514"):
        self.api_key = api_key
        self.model = model

    def verify(self, module_a, lc_a_num, content_a, module_b, lc_b_num, content_b) -> dict:
        import requests

        prompt = PROMPT_TEMPLATE.format(
            module_a=module_a, lc_a_num=lc_a_num, content_a=content_a,
            module_b=module_b, lc_b_num=lc_b_num, content_b=content_b,
        )
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": self.api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={
                "model": self.model,
                "max_tokens": 512,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=60,
        )
        r.raise_for_status()
        text = r.json()["content"][0]["text"]
        return json.loads(text)


class FakeLlmVerifier:
    """Heuristik für Tests: Überlappung nach gemeinsamer Wort-Überdeckung."""

    def verify(self, module_a, lc_a_num, content_a, module_b, lc_b_num, content_b) -> dict:
        wa = set(content_a.lower().split())
        wb = set(content_b.lower().split())
        if not wa or not wb:
            return {"overlap": "none", "explanation": "Leere Inhalte.", "confidence": 0.9}
        jaccard = len(wa & wb) / len(wa | wb)
        if jaccard > 0.35:
            return {"overlap": "high", "explanation": f"Starke Überschneidung (Jaccard {jaccard:.2f}).", "confidence": 0.8}
        if jaccard > 0.15:
            return {"overlap": "partial", "explanation": f"Teilweise Überschneidung (Jaccard {jaccard:.2f}).", "confidence": 0.65}
        return {"overlap": "none", "explanation": f"Kaum Überschneidung (Jaccard {jaccard:.2f}).", "confidence": 0.85}
