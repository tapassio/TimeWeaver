# CourseWeaver / TimeWeaver — Vereinheitlichtes Datenmodell & Timefold-Migration

**Status:** Entwurf zur Umsetzung
**Kontext:**
- Vorschlag "Collaborator-Modell": Commits von **BFH-JTF** (Aug./Sep. 2026, `8434332…0e180a2`), dokumentiert in `docs/courseWeaverERD.mermaid` + `docs/datastructure.curriculum.md` auf Branch `archive/combined-monolith`.
- Aktuelles Modell: das, was nach dem Split in **CourseWeaver** (Curriculum-Daten) und **TimeWeaver** (Scheduling/Solver) heute in Code + DB lebt.
- Ziel dieses Dokuments: ein gemeinsames Zielmodell festlegen, das die Stärken beider Versionen kombiniert, plus eine Umsetzungsreihenfolge für die Implementierung.

---

## 1. Leitprinzip

Die aktuelle **Pipeline-/Solver-Architektur bleibt das Rückgrat** (Excel/Konzeptdateien → Learning Cycles → Kompetenz-Alignment → Timefold-Solver). Aus dem BFH-JTF-Vorschlag werden nur die Teile übernommen, die eine echte fachliche Lücke schliessen — nicht das klassische, tabellen-persistente Campus-System-Modell als Ganzes.

---

## 2. Entscheidungstabelle je Entität

| Entität | Entscheid | Begründung |
|---|---|---|
| DEPARTMENT / PROGRAM / DEGREE | **Unverändert** | Beide Modelle stimmen praktisch überein |
| CURRICULUM_VERSION | **Unverändert im Datenmodell**, aber in UI-Flow einbauen | Existiert schon (Type + Store + CSV-Schema), wird aber nirgends benutzt |
| MODULE | **Konsolidieren**: `degreeIds` + `curriculumVersionId` übernehmen, Legacy-`studyProgramIds` auslaufen lassen; `selfStudyHours` bleibt explizites Feld (nicht ableiten) | Solver braucht die konkrete Zahl; Rest lässt sich aufräumen |
| **CLASS (Kohorte)** | 🟢 **Neu einführen** | Ersetzt implizite `program+semester`-Felder am Modul durch echte Kohorte |
| LESSON | **Nicht übernehmen** | `LearningCycle` ist semantisch reicher; eigene Entität + CRUD wäre Doppelarbeit |
| TAXONOMY_ITEM / COMPETENCY / COMPETENCY_MATRIX | **Unverändert** (Framework-Ansatz ist weiter entwickelt) | — |
| **matrixAxis** | 🔧 Attribut ergänzen | Behebt bekannten Rendering-Bug (leere Gridzeilen) |
| **PROOF_OF_COMPETENCY / ProofOfKnowledge** | 🟢 **Zusammenführen** zu einer Entität mit `answerFormats[]` | Eliminiert Doppelstruktur |
| LOCATION/ROOM, LECTURER, AVAILABILITY, SEMESTER, WEEK | **Unverändert** | Bereits identisch in TimeWeaver umgesetzt |
| SCHEDULING_RULE | **Unverändert** (Regeln am Modul + zentraler Constraint-Catalog per ID) | Eine generische Regel-Tabelle würde duplizieren, was der Timefold-`ConstraintProvider` im Code ausdrückt |
| **USER** | 🟡 **Hybrid**: ACL/OIDC bleibt Auth-Quelle + dünne `User`-Schattentabelle als Cache | Löst Eindeutigkeit externer Accounts, ohne funktionierende Claims-Logik zu ersetzen |
| SCHEDULE_ENTRY | **Nicht als relationale Tabelle**; stattdessen **Schedule-Snapshot** (ein JSON-Blob pro Semester) nach jedem akzeptierten Solver-Lauf | Historie/Nachvollziehbarkeit, ohne den Solver-Output künstlich in Einzelzeilen zurückzubauen |

---

## 3. Umsetzungsschritte für den Programmierer

Reihenfolge nach Aufwand/Nutzen, nicht nach Abhängigkeit — Schritte 1–3 sind unabhängig voneinander und können parallelisiert werden.

### Schritt 1 — `Class` (Kohorte) einführen 🟢 höchste Priorität

1. Neuer Type in `types/curriculum.ts`:
   ```ts
   interface Class {
     id: string
     programId: string
     semesterId: string
     curriculumVersionId: string
     size: number
     moduleIds: string[]   // M:N zu Modulen
   }
   ```
2. Neue DB-Tabelle `classes` + Join-Tabelle `class_modules`.
3. Migrationsskript: für jede bisherige `(program, semester)`-Kombination, die aktuell direkt am Modul hängt, eine `Class`-Row erzeugen und die betroffenen Module verknüpfen.
4. Den Solver-Input-Mapper (dort, wo aktuell `program`+`semester` direkt aus dem Modul gelesen werden) auf `classId` umstellen.
5. **Wichtig:** bestehende Timefold-Constraints, die Kohorten-Überschneidungen verhindern (Pattern: "Studierendengruppe kann nicht zwei Module gleichzeitig"), auf die neue `Class`-Entität matchen statt auf die alten `program+semester`-Felder.
6. Regressionstest: bestehende Stundenpläne müssen nach der Migration identische Solver-Ergebnisse liefern.

### Schritt 2 — Nachweis-Modell zusammenführen 🟢

1. Zielstruktur:
   ```ts
   interface ProofOfCompetency {
     id: string
     competencyIds: string[]
     answerFormats: ('written' | 'oral' | 'multipleChoice' | string)[]
     assignmentScope?: string
     duration?: number
   }
   ```
2. Migrationsskript: bestehende `ProofOfKnowledge`-Booleans (`written`, `oral`, `multipleChoice`) in `answerFormats[]`-Einträge konvertieren.
3. Alle UI-Komponenten (Formulare, Filter, Anzeigen), die aktuell auf die Boolean-Felder zugreifen, auf das Array umstellen.
4. Alten `ProofOfKnowledge`-Type erst entfernen, wenn alle Referenzen migriert sind (Suche im Repo nach `ProofOfKnowledge`).

### Schritt 3 — `matrixAxis`-Bugfix 🔧 kleiner Aufwand

1. Attribut `matrixAxis: 'x' | 'y'` an `MatrixCompetency` ergänzen.
2. Y-Achsen-Ableitung in der Grid-Komponente reparieren (aktuell Ursache für leere Gridzeilen).
3. Regressionstest: Competency-Matrix mit vollständig befüllten Achsen prüfen.

### Schritt 4 — `User`-Schattentabelle 🟡 mittlere Priorität

1. Neue Tabelle `local_user_cache` (nicht die bestehende `entity_acl`/OIDC-Logik ersetzen):
   ```ts
   interface UserRecord {
     localName: string
     email: string
     supplierId?: string
     roles: string[]
     timezone: string
   }
   ```
2. Sync-Mechanismus: bei jedem OIDC-Login ein Upsert in `local_user_cache`.
3. Kein Umbau der bestehenden Autorisierungslogik nötig — reine Ergänzung.

### Schritt 5 — Curriculum-Version-Flow aktivieren 🟢 geringer Aufwand

1. Kein Datenmodell-Change nötig (`CurriculumVersion` existiert bereits).
2. UI-Tab/Flow ergänzen, der aktive Kohorten einem `curriculumVersionId` zuordnet, statt das Feld nur im Hintergrund zu speichern.

### Schritt 6 — Schedule-Snapshot statt `SCHEDULE_ENTRY`-Tabelle 🟡

1. Nach jedem vom Nutzer akzeptierten Solver-Lauf: JSON-Blob mit `ScheduledSession[]` + Metadaten (Zeitstempel, Solver-Version, Score) in eine neue Tabelle `schedule_snapshots` schreiben (ein Row pro Semester/Lauf, **kein** Row-per-Session-Modell).
2. Damit ist ein veröffentlichter Stundenplan historisierbar und nachvollziehbar, ohne die Solver-Pipeline zu verlassen.

### Explizit NICHT umsetzen

- Eigenständige `LESSON`-Entität mit CRUD-Oberfläche
- Generische `SCHEDULING_RULE`-Tabelle mit `ruleType`/`params`/`appliesTo[]`
- `SCHEDULE_ENTRY` als vollrelationale Tabelle (ein Row pro Zeitslot)

Begründung jeweils: würde bestehende, bereits funktionierende Strukturen (`LearningCycle`, Constraint-Catalog im Solver-Code, Timefold-Output) duplizieren.

---

## 4. Prinzipielle Unterschiede CP-SAT → Timefold

Für den Programmierer, der den Solver-Teil umbaut — diese Punkte betreffen die **Architektur des Solver-Service**, nicht nur den Constraint-Code:

1. **Keine native TypeScript/JavaScript-Anbindung.** Timefold bietet offiziell nur Java/Kotlin sowie eine Python-Variante (aktuell Beta, PyPI-Paket `timefold`, Version 1.24.0b0, Python ≥ 3.10). Der Solver muss also weiterhin als eigener Service laufen, der über `TIMEFOLD_URL` per REST angesprochen wird — genau wie aktuell bei CP-SAT. Es ändert sich also **nicht**, dass es ein separater Prozess ist, aber die Sprache dieses Prozesses (Java/Kotlin vs. Python) beeinflusst die Performance spürbar.

2. **Anderes Modellierungsprinzip.** CP-SAT arbeitet mit mathematischen Variablen (z. B. einer 0/1-Matrix Raum × Zeit × Kurs). Timefold modelliert direkt die Domänenobjekte (`Class`, `Room`, `Lecturer` als annotierte Klassen mit `@planning_entity`/`@PlanningEntity` und Planning-Variablen). Das bestehende Solver-Datenmodell lässt sich nicht 1:1 übersetzen, sondern muss als Domänenmodell neu aufgebaut werden — hier ist die neue `Class`-Entität aus Abschnitt 3 ein guter Ankerpunkt.

3. **Andere Constraint-Syntax.** Statt Ungleichungen/linearer Ausdrücke werden Constraints als "Constraint Streams" geschrieben (`for_each`, `join`, `filter`, `group_by`, `penalize`). Die bereits vorhandene Regeln-Tabelle (Raum nicht doppelt buchen, Dozent nur an einem Ort gleichzeitig, Kohorte nicht doppelt verplant) lässt sich inhaltlich 1:1 übertragen, der Code aber komplett neu schreiben.

4. **Kein Optimalitätsbeweis mehr.** CP-SAT kann bei ausreichend Zeit beweisen, dass eine Lösung optimal ist, oder dass gar keine existiert (`OPTIMAL`/`INFEASIBLE`). Timefold nutzt lokale Suche (Tabu Search, Simulated Annealing) und liefert innerhalb der Zeitvorgabe eine gute, aber nicht nachweislich optimale Lösung. Falls ein Optimalitätsnachweis für Stakeholder wichtig war, muss das kommuniziert werden.

5. **Score-Modell statt gewichteter Zielfunktion.** Harte/weiche Regeln laufen über `HardSoftScore` bzw. `HardMediumSoftScore` und werden standardmässig **lexikografisch** priorisiert (harte Verstösse zählen immer schwerer als weiche), nicht additiv wie bisher im CP-SAT-Objective.

6. **Aktuell Beta-Status.** Das alte, separate Repo `timefold-solver-python` wurde im Oktober 2025 archiviert; der Python-Support liegt jetzt im Haupt-Repo `TimefoldAI/timefold-solver`. Ältere Tutorials/Links, die auf das alte Repo verweisen, können veraltet sein. Die API kann sich vor Erreichen von Version 1.0 noch ändern.

7. **Lizenz.** Die Community Edition ist Apache-2.0 und kostenlos, ohne dokumentierte Grössenbeschränkung. Für sehr grosse Datenmengen oder Zusatzfeatures (Score-Analyse, Constraint-Profiling) gibt es eine kostenpflichtige Enterprise Edition — für den aktuellen BFH-Umfang voraussichtlich nicht nötig.

---

## 5. Offene Fragen für das Team

- Soll `Class` in CourseWeaver (Curriculum-Seite) oder TimeWeaver (Scheduling-Seite) verwaltet werden? (Empfehlung: CourseWeaver, da es eine Stammdaten-Entität ist, die der Solver nur liest.)
- Wird der Timefold-Solver-Service in Java/Kotlin oder Python umgesetzt? Performance-Unterschied laut Doku "signifikant" — sollte vor Schritt 1 geklärt werden, da es die Deployment-Pipeline betrifft.
- Migrationsfenster für die `ProofOfKnowledge` → `ProofOfCompetency`-Umstellung (Schritt 2): Big-Bang oder parallel mit Feature-Flag?
