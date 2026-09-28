"""
Vollständige Pipeline A→F als Batch-Job (Python, nicht Vue).
CourseWeaver konsumiert nur das finale JSON aus Schritt F.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from embedding_provider import EmbeddingProvider, embed_lcs
from extract_excel import extract_from_many, extract_learning_cycles
from similarity import aggregate_to_module_pairs, build_similarity_matrix
from verify_llm import LlmVerifier
from export import build_report, save_heatmap_excel, save_overlaps_excel, save_report_json


def run_pipeline(
    excel_paths: list[str],
    embedding_provider: EmbeddingProvider,
    llm_verifier: LlmVerifier | None,
    program: str | None = None,
    threshold: float = 0.78,
    cache_path: Path | None = None,
    output_dir: Path = Path("out"),
    narrative_writer=None,
    embedding_model: str = "bge-m3 (lokal via Ollama)",
    llm_model: str = "qwen3:8b (lokal via Ollama)",
    signoff_name: str = "",
) -> dict:
    # A: Extraktion
    if len(excel_paths) == 1:
        lcs = extract_learning_cycles(excel_paths[0])
    else:
        lcs = extract_from_many(excel_paths)

    if program:
        lcs = [lc for lc in lcs if lc["program"] == program]
    effective_program = program or (lcs[0]["program"] if lcs else "unknown")

    # B: Embeddings (gecacht)
    emb_dict = embed_lcs(lcs, embedding_provider, cache_path=cache_path)
    # in np arrays für C
    lc_embeddings = {k: np.array(v) for k, v in emb_dict.items()}

    # C: Ähnlichkeitsmatrix
    lc_sims = build_similarity_matrix(lc_embeddings)

    # D: Schwellenwert – Kandidatenpaare
    sorted_pairs = sorted(lc_sims.items(), key=lambda kv: -kv[1])
    candidates = [(a, b, s) for (a, b), s in sorted_pairs if s >= threshold]

    # E: LLM-Verifikation nur für Kandidaten
    lc_by_id = {lc["lcId"]: lc for lc in lcs}
    overlaps: list[dict] = []
    for (lc_a_id, lc_b_id), sim in [( (a,b), s) for a,b,s in candidates]:
        lc_a = lc_by_id[lc_a_id]
        lc_b = lc_by_id[lc_b_id]
        if llm_verifier:
            verdict = llm_verifier.verify(
                lc_a["moduleName"], lc_a["lcNumber"], f"{lc_a['lcTitle']}: {lc_a['content']}",
                lc_b["moduleName"], lc_b["lcNumber"], f"{lc_b['lcTitle']}: {lc_b['content']}",
            )
            overlap = verdict.get("overlap", "partial")
            explanation = verdict.get("explanation", "")
            confidence = float(verdict.get("confidence", 0.5))
        else:
            overlap, explanation, confidence = "partial", f"Cosine {sim:.3f} über Schwelle {threshold}", 0.6

        overlaps.append({
            "moduleA": lc_a["moduleId"],
            "moduleNameA": lc_a["moduleName"],
            "lcA": lc_a["lcNumber"],
            "moduleB": lc_b["moduleId"],
            "moduleNameB": lc_b["moduleName"],
            "lcB": lc_b["lcNumber"],
            "contentA": f"{lc_a['lcTitle']}: {lc_a['content']}",
            "contentB": f"{lc_b['lcTitle']}: {lc_b['content']}",
            "similarityScore": round(float(sim), 4),
            "llmJudgement": overlap,
            "explanation": explanation,
            "confidence": confidence,
        })

    # F: Report + Heatmap
    module_heatmap = aggregate_to_module_pairs(lcs, lc_sims)
    report = build_report(effective_program, overlaps, module_heatmap)

    output_dir.mkdir(parents=True, exist_ok=True)
    save_report_json(report, output_dir / "curriculum_mapping_report.json")
    save_heatmap_excel(module_heatmap, threshold, output_dir / "module_heatmap.xlsx")
    if overlaps:
        save_overlaps_excel(overlaps, output_dir / "overlaps.xlsx")

    # G: Fliesstext-Bericht für AACSB (nur wenn narrative_writer übergeben)
    if narrative_writer is not None:
        from aacsb_report import build_narrative_report, save_narrative_report

        # Schritt-F-JSON auf Verbrauchssicht normalisieren (Fliesstext braucht Formulierungen)
        narrative_input = {
            "program": report["program"],
            "generatedAt": report["generatedAt"],
            "moduleHeatmap": report.get("moduleHeatmap"),
            "overlaps": [
                {
                    "moduleA": o.get("moduleNameA") or o["moduleA"],
                    "moduleB": o.get("moduleNameB") or o["moduleB"],
                    "lcA": o["lcA"], "lcB": o["lcB"],
                    "contentA": o.get("contentA", ""),
                    "contentB": o.get("contentB", ""),
                    "similarityScore": o["similarityScore"],
                    "llmJudgement": o["llmJudgement"],
                    "explanation": o["explanation"],
                }
                for o in overlaps
            ],
        }
        markdown = build_narrative_report(
            narrative_input, effective_program, narrative_writer,
            embedding_model=embedding_model,
            llm_model=llm_model,
            threshold=threshold,
            signoff_name=signoff_name,
        )
        save_narrative_report(markdown, output_dir / "aacsb_curriculum_mapping.md")

    # Kalibrierungs-Hilfe: Top-Paare ausgeben
    print(f"Programm: {effective_program} | LCs: {len(lcs)} | Kandidaten >={threshold}: {len(candidates)}")
    for (a, b), s in sorted_pairs[:15]:
        print(f"  {a} <-> {b}: {s:.3f}")

    return report


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser(description="Curriculum Mapping Pipeline A-F")
    p.add_argument("excels", nargs="+", help="Excel-Dateien (ModuleID, ModuleName, Program, LC, LCTitle, LCContent)")
    p.add_argument("--program", default=None, help="Nur dieses Programm auswerten")
    p.add_argument("--threshold", type=float, default=0.78, help="Cosine-Schwelle (an echten Daten kalibrieren!)")
    p.add_argument("--cache", type=Path, default=Path("embeddings.json"))
    p.add_argument("--out", type=Path, default=Path("out"))
    p.add_argument("--fake", action="store_true", help="Fake Embeddings + Fake LLM (ohne Ollama)")
    p.add_argument("--narrative", action="store_true", help="Schritt G aktivieren: AACSB-Fliesstext-Bericht erzeugen")
    p.add_argument("--signoff", default="", help="Name der programmleitenden Person (Sign-off)")
    args = p.parse_args()

    if args.fake:
        from embedding_provider import FakeEmbeddingProvider
        from verify_llm import FakeLlmVerifier

        provider = FakeEmbeddingProvider()
        verifier = FakeLlmVerifier()
        writer = None
        if args.narrative:
            from narrative_report import FakeNarrativeWriter
            writer = FakeNarrativeWriter()
    else:
        from embedding_provider import OllamaEmbeddingProvider
        from verify_llm import OllamaLlmVerifier

        provider = OllamaEmbeddingProvider(model="bge-m3")
        verifier = OllamaLlmVerifier(model="qwen3:8b")
        writer = None
        if args.narrative:
            from narrative_report import OllamaNarrativeWriter
            writer = OllamaNarrativeWriter(model="qwen3:8b")

    run_pipeline(
        args.excels, provider, verifier,
        program=args.program, threshold=args.threshold,
        cache_path=args.cache, output_dir=args.out,
        narrative_writer=writer, signoff_name=args.signoff,
    )
