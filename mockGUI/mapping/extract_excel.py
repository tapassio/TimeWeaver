"""Schritt A – Excel-Extraktion (keine Textbereinigung, natürlicher Text für Embeddings)."""
import json
import pandas as pd
from pathlib import Path


def extract_learning_cycles(excel_path: str) -> list[dict]:
    """Erwartet eine Zeile pro Learning Cycle mit den Spalten:
    ModuleID, ModuleName, Program, LC, LCTitle, LCContent
    """
    df = pd.read_excel(excel_path)

    required_cols = {"ModuleID", "ModuleName", "Program", "LC", "LCTitle", "LCContent"}
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"Fehlende Spalten in {excel_path}: {missing}")

    records = []
    for _, row in df.iterrows():
        # Keine Lowercase/Stopword-Entfernung – Embedding-Modelle brauchen natürlichen Text
        records.append({
            "lcId": f"{row['ModuleID']}-lc{int(row['LC'])}",
            "moduleId": row["ModuleID"],
            "moduleName": row["ModuleName"],
            "program": row["Program"],
            "lcNumber": int(row["LC"]),
            "lcTitle": str(row["LCTitle"]).strip(),
            "content": str(row["LCContent"]).strip(),
        })
    return records


def extract_from_many(excel_paths: list[str]) -> list[dict]:
    """Mehrere Excels (z.B. eines pro Modul) zusammenführen."""
    all_lcs: list[dict] = []
    for p in excel_paths:
        all_lcs.extend(extract_learning_cycles(p))
    return all_lcs


if __name__ == "__main__":
    import sys
    paths = sys.argv[1:] if len(sys.argv) > 1 else ["module_beschreibungen.xlsx"]
    if len(paths) == 1:
        lcs = extract_learning_cycles(paths[0])
    else:
        lcs = extract_from_many(paths)
    Path("learning_cycles.json").write_text(json.dumps(lcs, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"{len(lcs)} Learning Cycles extrahiert -> learning_cycles.json")
    for lc in lcs:
        print(" -", lc["lcId"], "|", lc["lcTitle"])
