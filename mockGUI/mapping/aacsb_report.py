"""
Schritt G — AACSB-Fliesstext-Bericht zusammenbauen.

Aufbau:
  1. Methodik (kurz, transparent, mit Limitationen)
  2. Programm-Übersicht + Modul×Modul-Heatmap (aus Schritt F)
  3. Befunde je Modulpaar (Fliesstext-Absätze aus Schritt E)
  4. Schlussfolgerung/Massnahmen (konditional aus Daten abgeleitet)
  5. Anhang: vollständige Datentabelle aus dem JSON
  6. Sign-off (Programmleitung) — ist selbst Teil des Nachweises

Format: Markdown-Entwurf. Word/docx als separater, späterer Schritt
(siehe build_docx — bewusst nicht Teil der Analyse-Pipeline).
"""
from __future__ import annotations

import json
from datetime import date


def build_narrative_report(
    report_json: dict,
    program_name: str,
    narrative_writer,
    *,
    embedding_model: str = "bge-m3 (lokal via Ollama)",
    llm_model: str = "qwen3:8b (lokal via Ollama)",
    threshold: float = 0.78,
    threshold_calibration: str = "an 10-15 von Hand geprüften LC-Paaren durch die Programmleitung kalibriert",
    signoff_name: str = "",
    signoff_date: str = "",
) -> str:
    lines: list[str] = []
    program = report_json.get("program", "unbekannt")
    overlaps = report_json.get("overlaps", [])
    heatmap = report_json.get("moduleHeatmap") or {}

    # --- Metadaten ---
    lines.append(f"# AACSB Curriculum Mapping — Programm {program}")
    lines.append("")
    lines.append(f"*Bericht erstellt am {report_json.get('generatedAt', date.today().isoformat())}. "
                 f"Computergestützte Vorauswahl, keine abschliessende Bewertung.*")
    lines.append("")

    # --- 1. Methodik ---
    lines.append("## 1. Methodik")
    lines.append("")
    lines.append(
        f"Die inhaltliche Analyse der Learning Cycles erfolgte computergestützt in einem "
        f"zweistufigen Verfahren: Zuerst wurden alle Learning-Cycle-Beschreibungen mit dem "
        f"mehrsprachigen Embedding-Modell **{embedding_model}** zu Vektoren verarbeitet und "
        f"paarweise per Cosinus-Ähnlichkeit verglichen. Als Schwellenwert für die Vorauswahl "
        f"potenzieller Überschneidungen wurde **{threshold:.2f}** verwendet; dieser wurde "
        f"{threshold_calibration}. Alle Paare über dem Schwellenwert wurden anschliessend durch "
        f"ein generatives Sprachmodell (**{llm_model}**) einer inhaltlichen Erstbeurteilung "
        f"unterzogen, das die Art der Überschneidung einschätzt und begründet."
    )
    lines.append("")
    lines.append(
        "**Limitationen:** Die computergestützte Analyse kann sowohl falsch-positive "
        "(thematisch ähnliche, aber curricular unabhängige) als auch falsch-negative Treffer "
        "(unerkannte Überschneidungen unterhalb des Schwellenwerts) enthalten. Embeddings "
        "messen thematische Nähe, nicht das Anspruchsniveau der Lernziele. Alle Befunde sind "
        "**computergestützt vorausgewählt und nicht abschliessend bewertet** — sie wurden vor "
        "Einreichung durch die Programmleitung geprüft (siehe Sign-off)."
    )
    lines.append("")

    # --- 2. Programm-Übersicht ---
    lines.append("## 2. Programm-Übersicht")
    lines.append("")
    n_overlaps_below = sum(1 for o in overlaps if o.get("llmJudgement") in ("none",))
    n_significant = sum(1 for o in overlaps if o.get("llmJudgement") in ("partial", "high"))
    n_pairs_checked = len(overlaps)
    modules_involved = sorted({o["moduleA"] for o in overlaps} | {o["moduleB"] for o in overlaps})
    lines.append(
        f"Das Programm {program} umfasst die involvierten Module {', '.join(modules_involved) if modules_involved else '—'}. "
        f"Insgesamt wurden {n_pairs_checked} Modul/Learning-Cycle-Paare über dem Schwellenwert "
        f"vorausgewählt und einzeln geprüft: davon zeigen **{n_significant} eine teilweise oder hohe "
        f"inhaltliche Überschneidung**, bei {n_overlaps_below} wurde im Detail keine nennenswerte "
        f"Überschneidung bestätigt."
    )
    lines.append("")
    lines.append("Die folgende Heatmap zeigt die aggregierte Ähnlichkeit je Modulpaar (Mittel der besten Learning-Cycle-Gegenstücke):")
    lines.append("")
    lines.append("| Modulpaar | Ähnlichkeit |")
    lines.append("|---|---|")
    for pair_key, score in sorted(heatmap.items(), key=lambda kv: -kv[1]):
        lines.append(f"| {pair_key} | {score:.3f} |")
    lines.append("")

    # --- 3. Befunde je Modulpaar ---
    lines.append("## 3. Befunde je Modulpaar")
    lines.append("")
    # sortiert nach Programm (vereint hier), dann Modulpaar
    by_pair: dict[tuple[str, str], list[dict]] = {}
    lc_by_module: dict[str, dict] = {}
    for o in overlaps:
        by_pair.setdefault((o["moduleA"], o["moduleB"]), []).append(o)
    for (a, b), items in sorted(by_pair.items()):
        lines.append(f"### {a} ↔ {b}")
        lines.append("")
        for o in items:
            para = narrative_writer.write_pair_paragraph(
                module_a=o["moduleA"], lc_a=o["lcA"], content_a=lc_by_module.get(o["moduleA"], {}).get("content", o.get("contentA", "")),
                module_b=o["moduleB"], lc_b=o["lcB"], content_b=lc_by_module.get(o["moduleB"], {}).get("content", o.get("contentB", "")),
                similarity_score=o["similarityScore"],
                llm_judgement=o["llmJudgement"],
                explanation=o["explanation"],
            )
            lines.append(para)
            lines.append("")

    # --- 4. Schlussfolgerung/Massnahmen ---
    lines.append("## 4. Schlussfolgerung und Massnahmen")
    lines.append("")
    if n_significant == 0:
        lines.append(
            "Aufgrund der computergestützten Analyse und der Prüfung durch die Programmleitung "
            "wurden **keine unbeabsichtigten Redundanzen** zwischen den Modulen des Programms "
            "festgestellt. Es ergibt sich kein Anpassungsbedarf für das Curriculum Mapping."
        )
    else:
        pair_names = []
        for (a, b), items in sorted(by_pair.items()):
            if any(o.get("llmJudgement") in ("partial", "high") for o in items):
                pair_names.append(f"{a} ↔ {b}")
        lines.append(
            f"Für die folgenden Modulpaare wurde eine teilweise oder hohe inhaltliche Überschneidung "
            f"vorausgewählt: {', '.join(pair_names)}. Die betroffenen Module "
            f"({', '.join(pair_names)}) werden durch die Programmleitung **inhaltlich abgestimmt**: "
            f"zu klären ist je Paar, ob es sich um unbeabsichtigte Redundanz (Anpassung der "
            f"Learning Cycles) oder um bewusste Vertiefung/Wiederholung (z. B. Spiralcurriculum) "
            f"handelt. Diese Beurteilung obliegt der Programmleitung."
        )
    lines.append("")

    # --- 5. Anhang ---
    lines.append("## 5. Anhang — vollständige Datentabelle")
    lines.append("")
    lines.append("Vollständige Rohdaten der computergestützten Analyse (JSON, unverändert aus Schritt F):")
    lines.append("")
    lines.append("```json")
    lines.append(json.dumps(report_json, indent=2, ensure_ascii=False))
    lines.append("```")
    lines.append("")

    # --- Sign-off ---
    lines.append("## Review und Sign-off")
    lines.append("")
    lines.append(
        "| Rolle | Name | Datum | Anmerkung |\n"
        "|---|---|---|---|\n"
        f"| Programmleitung (Review der Befunde) | {signoff_name or '____________________'} | {signoff_date or date.today().isoformat()} | Befunde geprüft und redigiert |"
    )
    lines.append("")

    return "\n".join(lines)


def save_narrative_report(markdown_text: str, path):
    from pathlib import Path
    Path(path).write_text(markdown_text, encoding="utf-8")


def build_docx(markdown_text: str, path):
    """
    Empfohlenes Endformat: Word (AACSB-Nachweise als formatierte Dokumente).
    Bewusst SEPARATER Schritt, wird erst mit reale Modul-Daten aufgerufen.
    Benötigt `pip install python-docx` (und optional pandoc für vollwertige Konvertierung).
    """
    try:
        import docx
    except ImportError:
        raise RuntimeError("python-docx nicht installiert: pip install python-docx (separater Schritt, kein Teil der Pipeline)")

    document = docx.Document()
    for block in markdown_text.split("\n\n"):
        block = block.strip()
        if not block:
            continue
        if block.startswith("# "):
            document.add_heading(block[2:].strip(), level=1)
        elif block.startswith("## "):
            document.add_heading(block[3:].strip(), level=2)
        elif block.startswith("### "):
            document.add_heading(block[4:].strip(), level=3)
        else:
            document.add_paragraph(block)
    document.save(str(path))
