"""
Schritt G — Fliesstext-Bericht für AACSB aus bereits erzeugten Daten.

WICHTIG: Das LLM formuliert hier NUR Text aus Schritt-E-Ergebnissen — es trifft
keine neue fachliche Bewertung und ersetzt nicht die Prüfung durch die
Programmleitung. Pro Kandidatenpaar ein Absatz (nicht das ganze Dokument auf
einmal, sonst verliert das LLM den Bezug zu den Fakten).
"""
from __future__ import annotations

import json
from typing import Protocol

NARRATIVE_PROMPT_TEMPLATE = """\
Du hilfst, einen Abschnitt für einen Akkreditierungsbericht
(AACSB Curriculum Mapping) zu formulieren. Ton: sachlich, akademisch.

Computergestützt ermittelte inhaltliche Überschneidung zwischen zwei
Modulen desselben Masterprogramms:

Modul A: "{module_a}" (Learning Cycle {lc_a}): "{content_a}"
Modul B: "{module_b}" (Learning Cycle {lc_b}): "{content_b}"
Ähnlichkeitswert: {similarity_score}
Einschätzung: {llm_judgement} — {explanation}

Formuliere daraus einen kurzen Absatz (3-5 Sätze), der:
- die Art der Überschneidung sachlich beschreibt
- KEINE abschliessende Wertung vornimmt (das entscheidet die Programmleitung)
- offenlässt, ob es sich um unbeabsichtigte Redundanz oder bewusste
  inhaltliche Vertiefung/Wiederholung handelt

Antworte NUR mit dem Absatztext, ohne Überschriften oder Markdown.
"""


class NarrativeWriter(Protocol):
    def write_pair_paragraph(
        self,
        module_a: str, lc_a: int, content_a: str,
        module_b: str, lc_b: int, content_b: str,
        similarity_score: float,
        llm_judgement: str,
        explanation: str,
    ) -> str:
        """Liefert 3-5 Sätze Fliesstext für ein Paar, ohne Wertung."""


class OllamaNarrativeWriter:
    def __init__(self, model: str = "qwen3:8b", host: str = "http://localhost:11434"):
        self.model = model
        self.host = host.rstrip("/")

    def write_pair_paragraph(self, module_a, lc_a, content_a, module_b, lc_b, content_b,
                             similarity_score, llm_judgement, explanation) -> str:
        import requests

        prompt = NARRATIVE_PROMPT_TEMPLATE.format(
            module_a=module_a, lc_a=lc_a, content_a=content_a,
            module_b=module_b, lc_b=lc_b, content_b=content_b,
            similarity_score=similarity_score,
            llm_judgement=llm_judgement, explanation=explanation,
        )
        r = requests.post(
            f"{self.host}/api/chat",
            json={
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "stream": False,
                "options": {"temperature": 0.3},  # sachlich, wenig Kreativität
            },
            timeout=120,
        )
        r.raise_for_status()
        return r.json()["message"]["content"].strip()


class ClaudeNarrativeWriter:
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-20250514"):
        self.api_key = api_key
        self.model = model

    def write_pair_paragraph(self, module_a, lc_a, content_a, module_b, lc_b, content_b,
                             similarity_score, llm_judgement, explanation) -> str:
        import requests

        prompt = NARRATIVE_PROMPT_TEMPLATE.format(
            module_a=module_a, lc_a=lc_a, content_a=content_a,
            module_b=module_b, lc_b=lc_b, content_b=content_b,
            similarity_score=similarity_score,
            llm_judgement=llm_judgement, explanation=explanation,
        )
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": self.api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": self.model, "max_tokens": 512, "messages": [{"role": "user", "content": prompt}]},
            timeout=60,
        )
        r.raise_for_status()
        return r.json()["content"][0]["text"].strip()


class FakeNarrativeWriter:
    """Deterministisch für Tests: baut Absatz rein aus den Fakten, ohne LLM."""

    def write_pair_paragraph(self, module_a, lc_a, content_a, module_b, lc_b, content_b,
                             similarity_score, llm_judgement, explanation) -> str:
        judgement_map = {
            "high": "eine hohe inhaltliche Überschneidung",
            "partial": "eine teilweise inhaltliche Überschneidung",
            "none": "keine nennenswerte inhaltliche Überschneidung",
        }
        art = judgement_map.get(llm_judgement, "eine computergestützt ermittelte Überschneidung")
        return (
            f"Die computergestützte Analyse weist zwischen dem Modul \u00ab{module_a}\u00bb "
            f"(Learning Cycle {lc_a}) und dem Modul \u00ab{module_b}\u00bb (Learning Cycle {lc_b}) "
            f"{art} aus. Der gemessene Ähnlichkeitswert beträgt {similarity_score:.2f} "
            f"(Cosinus-Ähnlichkeit der Embeddings); die automatisierte inhaltliche Einschätzung "
            f"lautet: {explanation} Ob es sich dabei um unbeabsichtigte Redundanz oder um eine "
            f"bewusste inhaltliche Vertiefung bzw. Wiederholung handelt, wird hier bewusst "
            f"offengelassen und ist durch die Programmleitung zu beurteilen."
        )
