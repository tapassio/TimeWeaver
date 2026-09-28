"""
Stufe 1 Datenmodell – sauber getrennt von Analyse wie CP-SAT Domänenmodell/SolverInput.
Jede Excel-Zelle wird 1:1 hierher überführt BEVOR Ähnlichkeit berechnet wird.
"""
from dataclasses import dataclass, asdict
from typing import Literal


@dataclass(frozen=True)
class LearningCycle:
    id: str  # z.B. "mod-mba-strategy-lc3"
    moduleId: str
    number: Literal[1, 2, 3, 4, 5, 6]
    title: str
    content: str  # Beschreibungstext aus Excel – natürlicher Text, keine Bereinigung


@dataclass(frozen=True)
class Module:
    id: str
    name: str
    program: str
    learningCycles: list[LearningCycle]  # genau 6


# --- Stufe F Output ---

@dataclass(frozen=True)
class ContentOverlap:
    moduleA: str
    lcA: int
    moduleB: str
    lcB: int
    similarityScore: float  # aus Schritt C
    llmJudgement: Literal["none", "partial", "high"]  # aus Schritt E
    explanation: str
    confidence: float


@dataclass(frozen=True)
class CurriculumMappingReport:
    program: str
    generatedAt: str
    overlaps: list[ContentOverlap]
    # Optional: Modul×Modul-Heatmap als dict
    moduleHeatmap: dict[tuple[str, str], float] | None = None

    def to_dict(self) -> dict:
        return {
            "program": self.program,
            "generatedAt": self.generatedAt,
            "overlaps": [asdict(o) for o in self.overlaps],
            "moduleHeatmap": (
                {f"{a}↔{b}": v for (a, b), v in self.moduleHeatmap.items()}
                if self.moduleHeatmap else None
            ),
        }
