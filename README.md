# TimeWeaver

**TimeWeaver** ist die eigenständige **Scheduling-App** (zeitliche Studienplanung, Räume, Verfügbarkeiten, Constraint-Katalog). Sie wurde aus dem gemeinsamen Vorläufer (Monolith) extrahiert und ist das Schwesterprojekt von **CourseWeaver** (Curriculum Mapping).

Herzstück ist der Open-Source-Optimierungs-Solver **[Timefold Solver](https://github.com/TimefoldAI/timefold-solver)** (Java, Apache 2.0), der als eigenständiger REST-Service läuft:

```
Vue/Vuetify Frontend ──HTTP──► Node/Express API ──REST──► Timefold-Solver (Java/Spring Boot)
         │                                          SolverInput (Problem) / RawSolverResult
         └──────────── PostgreSQL (entity_store JSONB) ◄──── Fallback-Engine: cp-sat-ts → or-tools-wasm
```

## Schnellstart (Docker)

```bash
docker compose up -d
# App/API:        http://localhost:3001
# Timefold:       http://localhost:8085/api/health
```

Der Node-Server ruft den Java-Solver über `TIMEFOLD_URL` (siehe `.env`) auf. Ist Timefold nicht erreichbar, fällt die API transparent auf die lokale Hybrid-Engine (cp-sat-ts → or-tools-wasm) zurück — beide Seiten benutzen dieselben stabilen Constraint-Katalog-IDs.

## REST-Solver-Contract

`POST {TIMEFOLD_URL}/api/solve` (Spiegelbild von `SolverInput`, server/solver/solverInput.ts):

```jsonc
{
  "sessions": [{
    "id": "sess-1", "moduleId": "mod-a", "program": "prog-dba", "semester": 1,
    "slotTypes": ["vormittag"], "expectedStudents": 20, "instructorIds": ["instr-1"],
    "allowedDayIds": [], "allowedRoomIds": [],
    "softPenalties": [{ "dayId": "d1", "constraintId": "INSTRUCTOR_OUTLOOK_TENTATIVE", "weight": 15 }]
  }],
  "days": [{ "id": "d1", "date": "2027-03-04", "week": 10, "weekday": "Donnerstag", "phase": "main" }],
  "rooms": [{ "id": "r1", "name": "A 101", "capacity": 40 }],
  "prerequisites": [{ "dependentModuleId": "mod-b", "prerequisiteModuleId": "mod-a" }],
  "weeklyBalance": { "weeks": [10], "lowerPerWeek": 0, "upperPerWeek": 2 },
  "options": { "timeLimitSeconds": 30 }
}
```

Antwort (`RawSolverResult`-kompatibel): `{ status, objectiveValue, assignments: [{ sessionId, dayId, roomId }], score: { hard, soft }, solveTimeMs }`.

Portierte Regeln (stabile Catalog-IDs, server/solver/constraintCatalog.ts):

| Kategorie | Constraint-IDs |
|---|---|
| Hard | `SAME_MODULE_DISTINCT_DAYS`, `NO_TEACHER_OVERLAP`, `COHORT_CONFLICT`, `ROOM_OCCUPANCY`, `ROOM_CAPACITY`, `MODULE_PREREQUISITE_ORDER`, `WEEKLY_BALANCE`, `ALLOWED_DAY_FILTER`, `ALLOWED_ROOM_FILTER` |
| Soft | `TEACHER_ROOM_STABILITY` (10), `TEACHER_MAKESPAN` (5), `SOFT_PENALTY_PREFERENCE` (Outlook / Day-Tags, Skalierung 1000), `PREFER_EARLY_DATES` (unskalierter Tie-Breaker) |

## Timefold-Solver bauen & testen

```bash
mvn -q -f solver-java package    # Build (Docker-Analog: image maven:3.9-eclipse-temurin-21)
mvn -f solver-java test          # JUnit-End-to-End-Tests des Solvers
docker build -t timeweaver-solver ./solver-java && docker run -d -p 8085:8080 timeweaver-solver
```

## Lokale Entwicklung (ohne Docker)

```bash
npm install --legacy-peer-deps
npm run dev          # Express (server/) + Vite (frontend/) concurrently
npm run test         # csvImport + api + solver + timefold-Mapping-Tests
npm run typecheck    # vue-tsc + tsc server
```

Ohne `TIMEFOLD_URL` bleibt die lokale Fallback-Kette aktiv — identische Ergebnisse, keine Java-Runtime nötig.

## Verfügbare Skripte

| Skript | Beschreibung |
|---|---|
| `npm run dev` | Dev-Server + Vite parallel |
| `npm run test` | CSV-Import-, API-, Solver- und Timefold-Tests |
| `npm run typecheck` | Frontend + Server |
| `npm run solver:java(test)` | Maven package / Tests des Java-Solvers |
| `npm run seed` | Demo-Daten in Postgres |
| `npm run poc:timetable` / `npm run solver:bench` | CP-SAT-Benchmarks |

## Projektstruktur

```
frontend/            Vue 3 + Vuetify (Schedule, Availability, Rooms, Constraints, Admin)
server/              Express API + DB-Abstraktion + Solver-Orchestrierung
server/solver/       Engine-Auswahl: Timefold → cp-sat-ts → or-tools-wasm
solver-java/         Timefold-Solver-Service (Spring Boot 3, Java 21, ai.timefold.solver 2.7.0)
vendor/              cp-sat-typescript (Fallback-Engine)
mockGUI/             Design-/Prototyp-Unterlagen
docs/                ERD, Datenstrukturen, Outlook-Check
```

## Authentifizierung

OIDC über docPouch (analog CourseWeaver): Konfiguration in der Settings-View; Admin-Bootstrap via `BOOTSTRAP_ADMIN_SECRET` bzw. Entity-ACL (aus dem auth/ACL-Teil des Monoliths übernommen).

## Lizenz

Open Source. Beiträge willkommen — bitte die Solver-Konventionen einhalten (stabile Catalog-IDs, `RawSolverResult`-Formen).
