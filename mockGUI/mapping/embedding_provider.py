"""
Schritt B – Embeddings hinter Interface kapseln.
Kein klassisches NLP (Tokenisierung/Lemmatisierung) – Embedding-Modell frisst natürlichen Text.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Protocol

import numpy as np


class EmbeddingProvider(Protocol):
    """Austauschbar ohne Rest anzufassen: Ollama lokal vs. Voyage Cloud."""

    def embed(self, texts: list[str]) -> list[list[float]]:
        ...


class OllamaEmbeddingProvider:
    """Lokal via Ollama – Daten verlassen nie BFH. Empfehlung: bge-m3 (MIT, mehrsprachig)."""

    def __init__(self, model: str = "bge-m3", host: str = "http://localhost:11434"):
        self.model = model
        self.host = host.rstrip("/")

    def embed(self, texts: list[str]) -> list[list[float]]:
        import requests

        vectors: list[list[float]] = []
        for t in texts:
            r = requests.post(
                f"{self.host}/api/embeddings",
                json={"model": self.model, "prompt": t},
                timeout=60,
            )
            r.raise_for_status()
            vectors.append(r.json()["embedding"])
        return vectors


class VoyageEmbeddingProvider:
    """Cloud via Voyage AI (von Anthropic empfohlen) – beste Qualität DE/EN, Kosten pro Aufruf."""

    def __init__(self, api_key: str, model: str = "voyage-3"):
        self.api_key = api_key
        self.model = model

    def embed(self, texts: list[str]) -> list[list[float]]:
        import requests

        r = requests.post(
            "https://api.voyageai.com/v1/embeddings",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={"input": texts, "model": self.model},
            timeout=60,
        )
        r.raise_for_status()
        return [d["embedding"] for d in r.json()["data"]]


class FakeEmbeddingProvider:
    """Deterministisch für Tests/Pipeline-Verifikation ohne Ollama/Cloud."""

    def __init__(self, dim: int = 32, seed: int = 42):
        self.dim = dim
        self.seed = seed

    def embed(self, texts: list[str]) -> list[list[float]]:
        # Hash-basiert deterministisch: gleicher Text -> gleicher Vektor
        import hashlib

        vectors: list[list[float]] = []
        for t in texts:
            h = int(hashlib.md5(t.encode()).hexdigest()[:8], 16)
            rng = np.random.default_rng(h ^ self.seed)
            v = rng.normal(size=self.dim)
            v = v / np.linalg.norm(v)
            vectors.append(v.tolist())
        return vectors


def embed_lcs(
    lcs: list[dict],
    provider: EmbeddingProvider,
    cache_path: Path | None = None,
) -> dict[str, list[float]]:
    """
    Für jeden LC.content Titel+Inhalt gemeinsam einbetten (Titel gibt Kontext).
    Ergebnis cachen: embeddings.json mit {lcId: vector} – nicht bei jedem Lauf neu berechnen.
    """
    texts = [f"{lc['lcTitle']}: {lc['content']}" for lc in lcs]
    ids = [lc["lcId"] for lc in lcs]

    # Cache laden falls vorhanden und vollständig
    if cache_path and cache_path.exists():
        cached = json.loads(cache_path.read_text(encoding="utf-8"))
        if all(i in cached for i in ids):
            return {i: cached[i] for i in ids}

    vectors = provider.embed(texts)
    result = {lc_id: vec for lc_id, vec in zip(ids, vectors)}

    if cache_path:
        cache_path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")

    return result
