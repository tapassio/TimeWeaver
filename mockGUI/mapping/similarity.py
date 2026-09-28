"""Cosine-Similarity zwischen allen Learning-Cycle-Paaren, aggregiert auf Modulebene."""
import json
import numpy as np
from itertools import combinations

def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

def build_similarity_matrix(lc_embeddings: dict[str, np.ndarray]) -> dict[tuple[str, str], float]:
    """lc_embeddings: { lcId: vector }. Gibt Similarity für jedes Paar zurück."""
    ids = list(lc_embeddings.keys())
    sims = {}
    for a, b in combinations(ids, 2):
        sims[(a, b)] = cosine_similarity(lc_embeddings[a], lc_embeddings[b])
    return sims

def aggregate_to_module_pairs(lcs: list[dict], lc_sims: dict[tuple[str, str], float]) -> dict[tuple[str, str], float]:
    """Für jedes Modulpaar: Durchschnitt der jeweils besten LC-Matches
    (bestes Gegenstueck je LC in Modul A -> Modul B, und umgekehrt gemittelt)."""
    by_module = {}
    for lc in lcs:
        by_module.setdefault(lc["moduleId"], []).append(lc["lcId"])

    def sim(a, b):
        return lc_sims.get((a, b)) or lc_sims.get((b, a)) or 0.0

    module_ids = list(by_module.keys())
    result = {}
    for m1, m2 in combinations(module_ids, 2):
        lcs1, lcs2 = by_module[m1], by_module[m2]
        best_per_lc1 = [max(sim(l1, l2) for l2 in lcs2) for l1 in lcs1]
        best_per_lc2 = [max(sim(l1, l2) for l1 in lcs1) for l2 in lcs2]
        result[(m1, m2)] = float(np.mean(best_per_lc1 + best_per_lc2))
    return result


if __name__ == "__main__":
    lcs = json.loads(open("learning_cycles.json", encoding="utf-8").read())

    # Simulierte Embeddings NUR zum Testen der Rechenlogik (echte kommen von Ollama/bge-m3).
    # LC1 der beiden Module ist bewusst sehr ähnlich (beide behandeln SWOT), LC2 weniger.
    rng = np.random.default_rng(42)
    base_swot = rng.normal(size=8)
    fake_embeddings = {
        "mod-mba-strategy-lc1": base_swot + rng.normal(scale=0.05, size=8),
        "mod-im-tech-lc1": base_swot + rng.normal(scale=0.05, size=8),
        "mod-mba-strategy-lc2": rng.normal(size=8),
        "mod-im-tech-lc2": rng.normal(size=8),
    }

    lc_sims = build_similarity_matrix(fake_embeddings)
    print("LC-Paar-Similarities:")
    for (a, b), s in lc_sims.items():
        print(f"  {a} <-> {b}: {s:.3f}")

    module_sims = aggregate_to_module_pairs(lcs, lc_sims)
    print("\nModul-Paar-Similarities (aggregiert):")
    for (a, b), s in module_sims.items():
        print(f"  {a} <-> {b}: {s:.3f}")
