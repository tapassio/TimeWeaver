# CourseWeaver — MockGUI (Daten & Analyse-Pipeline)

Ursprünglich funktionaler Prototyp (standalone), inzwischen aufgeteilt:

- **GUI-Prototyp** → `frontend/mockup/` (`mockup.html`, `useAuth.js`) — Teil des Front-Ends, direktes Öffnen im Browser.
- **Demo-/Mock-Daten** → `mockGUI/data/*.json` — **Backend-referenced**: 
  - `npm run seed` (`server/seed-mock.ts`) lädt daraus Programme/Module/Objective-Mappings/Proofs in den Entity-Store.
  - CP-SAT-Sampling: `server/solver/sample-data.ts` liest `solver-sample.json` von hier.
  - Python-Analyseesprototypen in `mockGUI/mapping/` (Extraction/Ähnlichkeit/AACSB-Report) nutzen `data/` ebenfalls.
- **types/** — TypeScript-Referenz für Modul-/Scheduling-Typen, migrät successiv in `frontend/src/types/`.
- **config/docker-compose.yml** — dedizierte DocPouch-Instanz (Port 3032) für den Prototyp.
- **docs/** — Datenmodell; Referenzen für Both Datenmodell und Analysis.

## Mapping zwischen Mock und Produktiv

| mockGUI | Produktiv |
|---|---|
| `frontend/mockup/mockup.html` | `frontend/src/views/*.vue` + `frontend/src/components/*` |
| `frontend/mockup/useAuth.js` | `frontend/src/composables/useAuth.ts` / `stores/auth.ts` |
| `types/*.ts` | `frontend/src/types/*.ts` |
| `data/*.json` | DocPouch/PostgreSQL (`entity_store`, `learning_cycle_embeddings` ...) |
| `config/docker-compose.yml` | Root `docker-compose.yml` |

## Mock-GUI starten

```bash
python -m http.server 5174 --directory frontend/mockup
# -> http://localhost:5174/mockup.html
```

`frontend/mockup/mockup.html` enthält `const DATA` als Snapshot von `mockGUI/data/*.json`; 
dynamischer Laden via `fetch('/api/...')` als Upgrade-Pattern.

## Echte Daten übernehmen

1. JSON-Dateien in `mockGUI/data/` durch DocPouch-/Postgres-Exporte ersetzen (gleiche IDs beibehalten).
2. Oder Mock auf `fetch('/api/...')` umstellen.
3. Schema in `docs/data-model.md`.
