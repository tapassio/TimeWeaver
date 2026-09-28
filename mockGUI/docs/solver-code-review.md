# Code-Review: Solver-Implementierung (`server.zip`)

Die Architektur folgt der Projekt-Doku sehr genau (Domain → SolverInput →
CP-SAT Model Builder → Explain, Constraint-Katalog mit stabilen IDs,
Worker-Thread-Kapselung). Das ist die richtige Struktur. Es gibt allerdings
einen kritischen funktionalen Bug und zwei Zuverlässigkeitsprobleme, die vor
produktivem Einsatz behoben werden sollten.

## 🔴 Kritisch

### 1. Ein Modul = eine Session — Mehrtägigkeit geht komplett verloren

**Datei:** `solver/domain.ts`, `solver/solverInput.ts` (Zeile 161-200)

Das `Module`-Interface hat kein `requiredSlots`/`ects`-basiertes Splitting
mehr. `buildSolverInput()` erzeugt **genau eine** `SolverSession` pro Modul:

```ts
// solverInput.ts, Zeile 161
const sessions: SolverSession[] = modules.map((mod) => {
  // ...
  return { id: `session-${mod.id}`, moduleId: mod.id, slotTypes, ... }
})
```

Das bedeutet: Ein 6-ECTS-Modul wird **einmal** an **einem** Tag verplant —
nicht an drei On-Campus-Days, wie ursprünglich festgelegt ("Module haben
normalerweise 3 On-Campus Days für einen 6 ECTS oder 1.5 Tage für 3 ECTS").
Diese Anforderung war schon in `sample-data.js`/`schedule-model.js` über
`requiredSlots` korrekt abgebildet — sie ist bei der Portierung nach
TypeScript verloren gegangen. Das ist keine Kleinigkeit, sondern der Kern
dessen, was der Solver eigentlich lösen soll.

**Fix-Richtung:** `Module` braucht wieder ein Feld für die Anzahl
On-Campus-Days (oder `requiredSlots: Record<SlotType, number>` wie im
Original), und `buildSolverInput()` muss daraus **mehrere** `SolverSession`s
pro Modul erzeugen (`session-${mod.id}-day0`, `-day1`, `-day2`), so wie es
`schedule-model.js` bereits vorgemacht hat. Ohne diesen Fix ist der Solver
für den eigentlichen Anwendungsfall nicht einsatzbereit — das würde ich vor
allem anderen beheben.

## 🟠 Ernst

### 2. Worker-Thread-Isolation läuft vermutlich nie wirklich

**Datei:** `solver/solverService.ts`, Zeile 44-49

```ts
const tryPaths = [
  path.join(__dirname, 'worker', 'solverWorker.ts'),
  workerPath, // .js — wird nie benutzt
]
const workerFile = tryPaths[0] // immer .ts
```

Der `.js`-Fallback-Pfad wird berechnet, aber nie verwendet — es wird immer
der `.ts`-Pfad genommen. In einem kompilierten/produktiven Deployment (ohne
`tsx`) existiert diese Datei nicht, der `Worker`-Konstruktor scheitert. Dazu
kommt: Node vererbt den `tsx`-Loader **nicht automatisch** an Worker Threads
— dafür bräuchte es explizit `execArgv: process.execArgv` beim
`new Worker(...)`-Aufruf, was hier fehlt. In der Praxis heisst das
vermutlich: Der Worker startet in Produktion nie erfolgreich, und jede
Solver-Anfrage landet über den Fallback synchron im Hauptprozess — genau der
Zustand, den Kapitel 2 der Doku ausdrücklich vermeiden wollte ("Solver-Läufe
nicht im normalen Request-Handler ausführen").

**Fix-Richtung:** `execArgv: process.execArgv` beim `Worker`-Konstruktor
setzen, und den kompilierten `.js`-Pfad tatsächlich als Fallback probieren
(z. B. `existsSync`-Check statt hartkodiert `tryPaths[0]`).

### 3. Worker-Fehler fallen automatisch zurück auf synchrones In-Prozess-Solving

**Datei:** `solver/solverService.ts`, Zeile 93-112

Sowohl `worker.on('error', ...)` als auch `worker.on('exit', ...)` bei
Fehlercode lösen einen **erneuten, synchronen** Solve-Lauf im Hauptprozess
aus. Das bedeutet: Wenn der Worker aus irgendeinem Grund zuverlässig
scheitert (z. B. wegen Bug #2), wird **jede** Solver-Anfrage am Ende doch
synchron im Hauptprozess gelöst — inklusive der Rechenlast eines
möglicherweise grossen CP-SAT-Modells. Damit wird der Fehler nicht sichtbar
(kein Alarm, kein Log-Eintrag, der auf ein strukturelles Problem hinweist,
nur eine `console.warn`-Zeile), sondern *maskiert*, während genau das
Risiko eintritt, das Worker-Threads verhindern sollten (Event Loop blockiert,
Speicherproblem reisst die API mit).

**Fix-Richtung:** Bei Worker-Fehler einen Fehler an den Aufrufer
zurückgeben (oder maximal einen begrenzten Retry im Worker selbst), aber
nicht automatisch und unbegrenzt auf synchrones In-Prozess-Solving
ausweichen. Der In-Prozess-Pfad (`solveInProcess`) ist für Tests/kleine
Instanzen gedacht, nicht als stiller Produktions-Fallback.

### 4. Datenbankfehler werden verschluckt → stiller Datenverlust möglich

**Datei:** `db.ts`, `saveEntity()` Zeile 129-156, `getAllEntities()`/
`getEntityById()` Zeile 74-127

```ts
if (isConnected && pool) {
  try {
    await pool.query(/* INSERT ... ON CONFLICT ... */)
    return { ...cleanData, updated_at: now }
  } catch (err) {
    console.error(`[Database] Error saving to ${tableName}:`, err)
    // kein throw — fällt durch zum In-Memory-Fallback
  }
}
const table = getMemoryTable(tableName)
// ...
```

Schlägt eine Postgres-Query fehl (nicht die Verbindung, sondern z. B. eine
einzelne Query — Constraint-Verletzung, zu grosse Payload, Timeout), wird
der Fehler nur geloggt und die Funktion schreibt/liest still aus dem
**In-Memory-Fallback**. Die API antwortet mit `200`/`201`, als wäre alles
gespeichert — tatsächlich ist der Datensatz nur im flüchtigen Speicher und
verschwindet beim nächsten Neustart. Bei Lesezugriffen (`getAllEntities`)
bedeutet ein Query-Fehler analog: Der Aufrufer bekommt eine (vermutlich
leere) In-Memory-Liste zurück, ohne zu wissen, dass die echten Daten in
Postgres eigentlich vorhanden wären, nur die Abfrage fehlgeschlagen ist.

**Fix-Richtung:** Nach einem Verbindungsfehler ist der In-Memory-Fallback
sinnvoll (bewusster Degraded-Modus). Ein Fehler bei einer einzelnen Query
trotz bestehender Verbindung sollte dagegen den Fehler weiterwerfen, damit
die Route mit `500` antwortet — nicht still auf einen möglicherweise leeren
Fallback wechseln.

## 🟡 Sollte behoben werden

### 5. Keine Authentifizierung/Autorisierung

**Datei:** `index.ts`

`cors()` ohne Optionen (erlaubt jeden Origin), `apiRouter` unter `/api/:entity`
erlaubt beliebige Tabellennamen ohne Allowlist, kein Auth-Middleware
irgendwo sichtbar. Damit kann jeder, der den Server erreicht, beliebige
Entitäten lesen/schreiben/löschen — inklusive der als "nicht für die
Öffentlichkeit" gekennzeichneten Moduldaten und der geplanten
Outlook-Verfügbarkeitsdaten von Dozierenden. Falls das absichtlich hinter
einem separaten Auth-Gateway/Reverse-Proxy läuft, der nicht im ZIP enthalten
ist, bitte das explizit gegenprüfen — sonst ist das ein offener Zugriff.

### 6. Ungebremster `timeLimitSeconds` vom Client

**Datei:** `routes/timetable.ts`, Zeile 45, 79

`options?.timeLimitSeconds` wird ungeprüft übernommen. Ein Client kann einen
beliebig langen Solve anfordern und damit (besonders in Kombination mit
Punkt #3) einen Worker oder sogar den Hauptprozess lange blockieren. Eine
serverseitige Obergrenze (z. B. 120s, passend zum PoC-Akzeptanzkriterium)
würde das entschärfen.

### 7. "Early-Date"-Tie-Breaker ist nicht skaliert

**Datei:** `solver/OrToolsWasmTimetableSolver.ts`, Zeile 140-153

```ts
let earlyTerm = dayVars[0].times(1)
for (let i = 1; i < dayVars.length; i++) earlyTerm = earlyTerm.plus(dayVars[i])
if (objective) {
  objective = objective.plus(earlyTerm)
}
```

Der Kommentar sagt, das sei als kleiner Tie-Breaker gedacht (Gewicht 1 vs.
Soft-Gewichte 10-20). Da hier aber der **rohe Tagesindex** jeder Session
aufsummiert wird (Wertebereich bis `numDays-1`, z. B. 30-40 bei einem
Semester), kann diese Summe bei vielen Sessions schnell in die gleiche
Grössenordnung wie die eigentlichen Strafgewichte kommen oder sie
übersteigen — der "Tie-Breaker" verzerrt dann die beabsichtigte Priorisierung
der echten Soft-Constraints, statt nur bei Gleichstand zu entscheiden.

**Fix-Richtung:** Die echten Soft-Penalties mit einem grossen Faktor
skalieren (z. B. ×1000) und den Tie-Breaker unskaliert lassen, statt
umgekehrt — dann kann der Tie-Breaker nie dominieren, unabhängig von
Sessionanzahl oder Tagesanzahl.

### 8. Keine echten Solver-Unit-Tests

**Datei:** `test/api.test.ts`

Das ist ein manuelles Skript (kein Jest/Vitest, `process.exit()` mitten im
Testlauf), das nur die generische CRUD-API prüft. Für `buildSolverInput`,
`OrToolsWasmTimetableSolver` und `explainSolution` — den eigentlich
komplexen und fehleranfälligen Teil — existieren keine Unit-Tests. Der in
der Architektur-Doku vorgesehene "Referenztest gegen nativen Solver"
(identisches Modell in `or-tools-wasm` und offiziellem Python-OR-Tools
lösen, Status/Bound/Objective vergleichen) wurde ebenfalls noch nicht
umgesetzt.

### 9. Hartkodiertes Datenbank-Passwort als Default

**Datei:** `db.ts`, Zeile 26

```ts
const password = process.env.POSTGRES_PASSWORD || 'courseweaver'
```

Ein funktionierendes, aber schwaches Default-Passwort im Quellcode. Besser:
ohne gesetzte Umgebungsvariable laut fehlschlagen, statt still mit einem
erratbaren Passwort weiterzumachen.

## 🟢 Nachrangig

- **Wochenbalance zählt aktuell "Sessions pro Woche"**, was durch Bug #1
  zufällig mit "Tage pro Woche" übereinstimmt. Sobald #1 behoben ist, muss
  die Wochenbalance-Logik mit überarbeitet werden, damit sie weiterhin die
  ursprünglich geforderte gleichmässige Verteilung der On-Campus-*Tage*
  abbildet, nicht die Anzahl der (dann mehreren) Sessions.
- Die paarweisen O(n²)-Schleifen für Dozierenden-/Raum-Konflikte sind beim
  aktuell benchmarkten Umfang (bis 300 Module) unproblematisch, aber bei
  Skalierung Richtung 1'000 Einheiten (PoC-Zielgrösse) im Auge behalten.
- `solver/benchmarks/poc.ts` lässt den grossen 300er-Fall standardmässig
  aus (nur `run.ts` deckt ihn ab) — kein Bug, aber leicht verwirrend, dass
  es zwei Benchmark-Skripte mit unterschiedlicher Abdeckung gibt.

## Priorisierung

1. **#1 zuerst** — ohne Mehrtägigkeit pro Modul funktioniert der Solver nicht
   für den eigentlichen Anwendungsfall.
2. **#2 + #3 zusammen** — sie hängen ursächlich zusammen; die
   Worker-Isolation aus der Architektur-Doku ist aktuell vermutlich
   wirkungslos.
3. **#4** — bevor echte Daten reinkommen, da sonst stiller Datenverlust
   möglich ist.
4. **#5** — vor jedem Zugriff von ausserhalb eines vertrauenswürdigen Netzes.
5. Rest nach Kapazität.
