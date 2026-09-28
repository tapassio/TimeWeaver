"""
Schritt F – Curriculum-Mapping-Report + Heatmap (CourseWeaver konsumiert nur JSON/Excel).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd


def build_report(
    program: str,
    overlaps: list[dict],
    module_heatmap: dict[tuple[str, str], float] | None = None,
) -> dict:
    return {
        "program": program,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "overlaps": overlaps,
        "moduleHeatmap": (
            {f"{a}↔{b}": round(v, 4) for (a, b), v in module_heatmap.items()}
            if module_heatmap else None
        ),
    }


def save_report_json(report: dict, path: str | Path) -> None:
    Path(path).write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")


def save_heatmap_excel(
    module_sims: dict[tuple[str, str], float],
    threshold: float,
    path: str | Path,
) -> None:
    rows = [
        {"Modul A": a, "Modul B": b, "Similarity": round(s, 4), "ueber Schwellenwert": s >= threshold}
        for (a, b), s in sorted(module_sims.items(), key=lambda kv: -kv[1])
    ]
    pd.DataFrame(rows).to_excel(path, index=False)


def save_overlaps_excel(overlaps: list[dict], path: str | Path) -> None:
    """Feingranular: jedes LC-Paar als Zeile für manuelle Prüfung."""
    pd.DataFrame(overlaps).to_excel(path, index=False)
