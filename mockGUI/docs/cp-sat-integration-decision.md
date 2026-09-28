# CP-SAT-Integration für CourseWeaver: Entscheidung & Vorgehen

## 1. Entscheidung in einem Satz

CP-SAT läuft **serverseitig in Node.js** (nicht im Browser), gekapselt hinter
einem eigenen Interface – Browser-Solving ist eine mögliche spätere
Zusatzfunktion, keine Voraussetzung.

## 2. Warum Node statt Browser

| | Node.js (Server) | Browser |
|---|---|---|
| Hardware | kontrolliert, einheitlich | stark unterschiedlich (Gerät des Nutzers) |
| Header/Setup | keine besonderen Anforderungen | braucht `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`, sonst scheitern WASM-Threads |
| Daten | Planungsdaten bleiben zentral | verlassen ggf. das Endgerät |
| Ergebnisse | zentral speicher-/versionierbar | pro Gerät verstreut |
| Jobs | überwachbar, abbrechbar | schwerer kontrollierbar |
| Ausnahme | – | sinnvoll für Offline-Modus, lokale Was-wäre-wenn-Simulationen, keine Serverkosten |

**Wichtig:** Solver-Läufe nicht im normalen Request-Handler ausführen, sondern
in einem **eigenen Worker Thread / Prozess** – sonst blockiert eine
Optimierung den Event Loop, und ein Speicherproblem reisst die ganze API mit.

## 3. Architektur: drei Trennungen, die eingehalten werden müssen

### 3.1 Solver hinter Interface kapseln

`or-tools-wasm` nicht direkt im Anwendungscode importieren, sondern über ein
Interface ansprechen. Das hält eine spätere zweite Implementierung (z. B.
Aufruf eines nativen Python-Service) offen, ohne den Rest der App anzufassen.

```ts
export interface TimetableSolver {
  solve(problem: TimetableProblem, options: SolveOptions): Promise<TimetableSolution>;
}

export class OrToolsWasmTimetableSolver implements TimetableSolver {
  // CP-SAT-Modellierung (siehe schedule-model.js)
}
```

### 3.2 Domänenmodell und CP-SAT-Modell trennen

```
Fachliches Stundenplanmodell
        ↓
validierter SolverInput
        ↓
CP-SAT Model Builder
        ↓
CP-SAT-Ergebnis
        ↓
fachliches Ergebnis + Erklärungen
```

Frontend-Daten dürfen **nicht** direkt zu CpModel-Variablen werden – sonst
lässt sich die mathematische Formulierung nie mehr ändern, ohne die ganze
App umzubauen. Damit das keine reine Absichtserklärung bleibt, hier jede
Stufe als konkreter Typ:

**Stufe 1 — Fachliches Domänenmodell** (das, was Menschen im Kopf haben;
entspricht `sample-data.js`, nur jetzt als Typen statt loser Objekte):

```ts
interface Program { id: string; name: string; }
interface Instructor { id: string; name: string; }
interface Room { id: string; name: string; capacity: number; }

interface OnCampusDay {
  id: string;
  date: string;          // ISO-Datum
  week: number;          // Kalenderwoche
  weekday: 'Donnerstag' | 'Freitag' | 'Samstag';
  phase: 'main' | 'final';
}

type SlotType = 'vormittag' | 'nachmittag' | 'abend';

interface Restriction {
  id: string;                       // stabile ID, siehe Constraint-Katalog (3.3)
  category: 'hard' | 'soft';
  weight?: number;                  // nur bei 'soft'
  params?: Record<string, unknown>; // z. B. { dates: ['2026-11-14'] }
}

interface Module {
  id: string;
  name: string;
  program: string;        // Program.id
  ects: 3 | 6;
  expectedStudents: number;
  instructors: string[];  // Instructor.id[]
  restrictions: Restriction[];
}
```

**Stufe 2 — validierter `SolverInput`** (fachlich neutral, nur noch das, was
der Solver braucht — hier gehört die bisher in `schedule-model.js` direkt
im Code verstreute Filterlogik hin, z. B. `isDayAllowed`/`isRoomAllowed`):

```ts
interface SolverSession {
  id: string;
  moduleId: string;
  slotTypes: SlotType[];      // ['vormittag'] oder ['vormittag','nachmittag'] = ganzer Tag
  expectedStudents: number;
  instructorIds: string[];
  allowedDayIds: string[];    // bereits gegen harte Restriktionen gefiltert
  allowedRoomIds: string[];   // bereits gegen Kapazität gefiltert
  softPenalties: Array<{ dayId: string; constraintId: string; weight: number }>;
}

interface SolverInput {
  sessions: SolverSession[];
  days: OnCampusDay[];
  rooms: Room[];
  weeklyBalance: { weeks: number[]; lowerPerWeek: number; upperPerWeek: number };
}

// Diese Funktion trägt die ganze fachliche Interpretation der Restriktionen.
// Der CP-SAT Model Builder (Stufe 3) kennt danach keine Restriction-Objekte mehr,
// nur noch Listen erlaubter IDs und vorgerechnete Strafkosten.
declare function buildSolverInput(
  modules: Module[],
  days: OnCampusDay[],
  rooms: Room[],
): SolverInput;
```

**Stufe 3 — CP-SAT-Ergebnis** (roh, wie es aus `schedule-model.js` kommt):

```ts
interface RawSolverResult {
  status: 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'UNKNOWN';
  objectiveValue: number;
  assignments: Array<{ sessionId: string; dayId: string; roomId: string }>;
}
```

**Stufe 4 — fachliches Ergebnis + Erklärungen** (das, was UI/Bericht zeigt):

```ts
interface ScheduledSession {
  moduleId: string;
  moduleName: string;
  day: OnCampusDay;
  room: Room;
  slotTypes: SlotType[];
}

interface RuleEvaluation {
  constraintId: string;      // dieselbe ID wie im Constraint-Katalog (3.3)
  category: 'hard' | 'soft';
  satisfied: boolean;
  cost: number;
  affectedSessionIds: string[];
}

interface TimetableSolution {
  status: RawSolverResult['status'];
  objectiveValue: number;
  schedule: ScheduledSession[];
  explanations: RuleEvaluation[];
}
```

Jede Stufe bekommt so eine eigene, testbare Funktion
(`buildSolverInput`, `OrToolsWasmTimetableSolver.solve`, `explainSolution`)
statt einer einzigen grossen Datei, die Restriktionsauswertung,
Variablenbau und Ausgabe vermischt — genau das war in `schedule-model.js`
bisher der Fall und sollte beim Ausbau als Erstes aufgelöst werden.


### 3.3 Constraint-Katalog mit stabilen IDs

Jede Regel bekommt eine ID, Kategorie und Gewicht:

```ts
type ConstraintDefinition = {
  id: string;
  category: "hard" | "soft";
  weight: number;
  enabled: boolean;
};

const constraints = {
  NO_TEACHER_OVERLAP: { category: "hard", weight: 1 },
  AVOID_FRIDAY_AFTERNOON: { category: "soft", weight: 20 },
  MINIMIZE_STUDENT_GAPS: { category: "soft", weight: 5 },
};
```

CP-SAT liefert keine automatische fachliche Erklärung wie andere
Solver-Frameworks (z. B. Timefold). **Nach dem Lösen jede Regel nochmals
gegen den fertigen Stundenplan auswerten** und einen verständlichen Bericht
erzeugen.

## 4. Risiken der Bibliothek `or-tools-wasm`

Der Solver selbst ist echter OR-Tools-Code. Das Risiko liegt in der
**Integrationsschicht**:

- ein einzelner Hauptmaintainer, kleine Community
- keine offizielle Unterstützung durch Google
- mögliche Verzögerung bei neuen OR-Tools-Versionen
- WASM-spezifische Fehler; einzelne Funktionen/Parameter können sich anders
  verhalten als im nativen Build (aktuell z. B. ein offener Fehler bei
  benannten Subsolver-Filtern)
- Build-/Bundler-Kompatibilität kann sich ändern

Die Stern-Zahl auf GitHub ist kein Qualitätsmerkmal. Relevanter sind:
automatisierte Tests über mehrere Laufzeiten/Bundler, nachvollziehbare
Releases, zeitnahe Synchronisation mit OR-Tools, dokumentierte
API-Abdeckung, reproduzierbare Benchmarks, Reaktionszeit auf Issues. Die
vorhandene Fixture-Matrix über Browser, Node, Bun und Deno ist ein gutes
Zeichen.

## 5. Massnahmen zur Risikominderung — Checkliste

- [ ] **Solver-Interface** wie unter 3.1 anlegen, bevor mehr Code entsteht
- [ ] **Domänenmodell/SolverInput/CP-SAT-Modell** strikt trennen (3.2)
- [ ] **Constraint-Katalog** mit ID + Gewicht führen (3.3), keine Regel „hart
      codiert" im Modell verstecken
- [ ] **Referenztest gegen nativen Solver**: identisches Modell einmal in
      `or-tools-wasm`, einmal mit offiziellem OR-Tools in Python lösen –
      gleicher Input, gleiche Constraints, Vergleich von Status, Bound und
      Objective-Wert (die konkreten Pläne müssen nicht identisch sein,
      mehrere Lösungen können gleich gut sein)
- [ ] **Abhängigkeit fixieren**: konkrete Paketversion festschreiben,
      WASM-Build als eigenes Artefakt sichern, Updates erst nach
      Regressionstests übernehmen, Fork-Option im Hinterkopf behalten
- [ ] **Benchmark-Set** mit repräsentativen Stundenplaninstanzen anlegen und
      behalten (für jeden Vergleichslauf wiederverwendbar)

## 6. Proof-of-Concept — Akzeptanzkriterien

Bevor CP-SAT/`or-tools-wasm` verbindlich für CourseWeaver festgelegt wird,
soll ein Node-basierter PoC mit diesen Grössenordnungen laufen:

| Grösse | Zielwert |
|---|---|
| Veranstaltungseinheiten | 300–1'000 |
| Zeitslots | 30–100 |
| Räume | 20–100 |
| Dozenten-/Kohortenüberschneidungen | ja, modelliert |
| Raumkapazität & Ausstattung | ja, modelliert |
| Sperrzeiten | ja, modelliert |
| gewichtete Präferenzen | 3–5 |
| Zeitlimit | 30–120 Sekunden |

**Kriterium:** Besteht das Modell diesen Test zuverlässig, gibt es keinen
zwingenden Grund, zusätzlich Java/Kotlin oder Python einzuführen.

## 7. CP-SAT vs. Timefold — wann was

| Priorität | Bessere Wahl |
|---|---|
| Alles in TypeScript entwickeln | CP-SAT via `or-tools-wasm` |
| Fachlich besonders lesbare Constraints | Timefold |
| Automatische Constraint-/Score-Analyse | Timefold |
| Optimalitätsgrenzen & Unlösbarkeitsnachweis | CP-SAT |
| Minimale Zahl verschiedener Technologien | `or-tools-wasm` |
| Offiziell gepflegte Sprachintegration | Timefold (Java/Kotlin) |
| Kein zusätzlicher Java-/Python-Service | `or-tools-wasm` |
| Laufende Umplanung mit wenigen Änderungen | Timefold etwas natürlicher, CP-SAT ebenfalls modellierbar |

**Für CourseWeaver spricht CP-SAT/`or-tools-wasm`, wenn:**
1. konsequent TypeScript verwendet werden soll,
2. die Bereitschaft besteht, Constraints mathematisch/strukturiert zu
   modellieren,
3. ein Benchmark mit realistischen Hochschuldaten akzeptable Laufzeit und
   Speichernutzung zeigt.

Die grössere langfristige Herausforderung ist voraussichtlich nicht WASM,
sondern die **saubere Formulierung und Erklärbarkeit der vielen
Stundenplanregeln**.

## 8. Bezug zum aktuellen Stand

`sample-data.js` und `schedule-model.js` (bereits erstellt) sind der
Rohentwurf für Schritt 3.2/3.3 – als Nächstes: Domänenmodell/SolverInput
sauber trennen (3.2) und den Constraint-Katalog (3.3) einführen, statt
Restriktionen direkt in den Modul-Objekten zu belassen.

## 9. Outlook-Anbindung für Verfügbarkeitsprüfung (Stundenplaner)

Korrigierte und auf das CourseWeaver-Datenmodell (Abschnitt 3.2) angepasste
Fassung. Ziel: prüfen, ob Dozierende bereits Termine in den vorgesehenen
On-Campus-Slots haben, und - nach Freigabe - die geplanten Termine in Outlook
anlegen.

### 9.1 App registrieren und berechtigen

- App in Microsoft Entra ID registrieren, **Application Permissions**
  verwenden, **Admin Consent** einholen (korrekt recherchiert)
- Berechtigungen:
  - `Calendars.ReadBasic` - für `getSchedule` (Frei/Belegt-Abfrage). Laut
    aktueller Microsoft-Dokumentation die **geringstprivilegierte**
    Berechtigung für diese Aktion, auch als Application Permission - hier war
    die Recherche korrekt
  - `Calendars.ReadWrite` - um Termine im Kalender der zentralen
    Planungs-Mailbox zu erstellen
- **Korrektur:** Zugriff nicht über "Exchange Online RBAC" im allgemeinen
  Sinn einschränken, sondern über **RBAC for Applications** (Nachfolger der
  älteren *Application Access Policies*, die Microsoft aktuell schrittweise
  ablöst). Damit wird die App-weite Berechtigung (die sonst tenant-weit auf
  alle Mailboxen wirkt) auf genau die Dozierenden- und die
  Planungs-Mailbox beschränkt - das ist der Kernpunkt, den die Recherche
  richtig als notwendig erkannt, aber falsch benannt hatte.

### 9.2 Verfügbarkeit abrufen

```http
POST /users/{planningMailbox}/calendar/getSchedule
```

```json
{
  "schedules": ["lecturer@university.ch"],
  "startTime": { "dateTime": "2027-02-15T08:00:00", "timeZone": "Europe/Zurich" },
  "endTime": { "dateTime": "2027-02-19T20:00:00", "timeZone": "Europe/Zurich" },
  "availabilityViewInterval": 15
}
```

**Korrektur der Status-Werte** (Feld `status` in `scheduleItems`, laut
aktueller Microsoft-Dokumentation): `free`, `tentative`, `busy`, **`oof`**
(nicht `outOfOffice`), `workingElsewhere`, `unknown`. Die kompakte
`availabilityView`-Zeichenkette codiert dieselben Zustände pro Zeitfenster
als Ziffern (0=free, 1=tentative, 2=busy, 3=oof, 4=workingElsewhere).

Mapping für CP-SAT (inhaltlich wie recherchiert, mit korrigiertem Statusnamen):

| Graph-Status | CP-SAT-Behandlung |
|---|---|
| `free` | Slot erlaubt |
| `tentative` | Soft Penalty |
| `busy` | Slot gesperrt (hart) |
| `oof` | Slot gesperrt (hart) |
| `workingElsewhere` | Slot erlaubt (Person arbeitet, ist aber nicht im Kalender blockiert) |
| `unknown` | manuell prüfen - kein automatischer Entscheid |

### 9.3 Mapping auf das bestehende Datenmodell (Abschnitt 3.2)

Das ist der eigentliche Anpassungsschritt: `getSchedule` liefert 15-Minuten-
Raster, euer CP-SAT-Modell rechnet aber in `vormittag`/`nachmittag`/`abend`
(siehe `sample-data.js`/`schedule-model.js`). Diese Übersetzung gehört genau
in `buildSolverInput()` aus Abschnitt 3.2 - der CP-SAT Model Builder selbst
bekommt nie ein rohes `availabilityView` zu Gesicht, nur fertige
`Restriction`-Objekte:

```ts
// Grenzen der drei On-Campus-Slots in lokaler Zeit (aus sample-data.js: TIME_SLOTS)
const SLOT_BOUNDARIES: Record<SlotType, { start: string; end: string }> = {
  vormittag: { start: "08:00", end: "12:00" },
  nachmittag: { start: "13:00", end: "17:00" },
  abend: { start: "17:30", end: "20:00" },
};

// Übersetzt einen availabilityView-String (15-Min-Raster) in einen Status
// pro On-Campus-Slot eines Tages.
function slotStatusFromAvailabilityView(
  availabilityView: string,
  dayStart: Date,
  intervalMinutes: number,
  slot: SlotType,
): "free" | "tentative" | "blocked" | "unknown" {
  const { start, end } = SLOT_BOUNDARIES[slot];
  const indices = indicesForRange(dayStart, start, end, intervalMinutes);
  const codes = indices.map((i) => availabilityView[i]);

  if (codes.some((c) => c === "2" || c === "3")) return "blocked";   // busy | oof
  if (codes.some((c) => c === "1")) return "tentative";
  if (codes.every((c) => c === "0" || c === "4")) return "free";     // free | workingElsewhere
  return "unknown";
}

// Erzeugt daraus direkt die Restriction-Objekte aus Abschnitt 3.2 - der
// Model Builder verarbeitet ab hier nur noch bekannte Restriction-IDs.
function toRestrictions(
  instructorId: string,
  day: OnCampusDay,
  slot: SlotType,
  status: ReturnType<typeof slotStatusFromAvailabilityView>,
): Restriction[] {
  if (status === "blocked") {
    return [{ id: "INSTRUCTOR_OUTLOOK_BUSY", category: "hard",
               params: { instructorId, dayId: day.id, slot } }];
  }
  if (status === "tentative") {
    return [{ id: "INSTRUCTOR_OUTLOOK_TENTATIVE", category: "soft", weight: 15,
               params: { instructorId, dayId: day.id, slot } }];
  }
  if (status === "unknown") {
    return [{ id: "INSTRUCTOR_OUTLOOK_UNKNOWN", category: "soft", weight: 5,
               params: { instructorId, dayId: day.id, slot } }]; // manuelle Prüfung anstossen, nicht automatisch sperren
  }
  return [];
}
```

Diese `Restriction`-Objekte reihen sich in den bestehenden Constraint-Katalog
ein (`NO_TEACHER_OVERLAP`, `AVOID_FRIDAY_AFTERNOON` usw. aus Abschnitt 3.3) -
Outlook-Verfügbarkeit wird technisch genauso behandelt wie jede andere
Regel, nicht als Sonderfall.

### 9.4 Stundenplan berechnen

- Für jede Dozierende Person und jeden On-Campus-Tag `getSchedule` aufrufen,
  über `slotStatusFromAvailabilityView` in `Restriction`-Objekte übersetzen,
  diese in `buildSolverInput()` einspeisen (Abschnitt 3.2)
- Direkt vor der Veröffentlichung **nochmals** `getSchedule` aufrufen (korrekt
  recherchiert) - zwischen Berechnung und Publikation können Dozierende neue
  Termine eintragen

### 9.5 Unterrichtstermine erstellen

```http
POST /users/{planningMailbox}/events
```

- Zentrale Planungs-Mailbox als Organisator (korrekt)
- Dozierende als `required` Attendees, Räume als `resource` Attendees
  (korrekt - `attendeeType` kennt genau diese drei Werte: `required`,
  `optional`, `resource`)
- Stabile `transactionId` je Unterrichtseinheit setzen, um Duplikate bei
  wiederholten Aufrufen zu verhindern (korrekt)
- Graph-Event-ID zusammen mit der internen Unterrichtseinheit-ID speichern
  (z. B. als Feld an `ScheduledSession` aus Abschnitt 3.2), damit spätere
  Änderungen das bestehende Event aktualisieren statt ein zweites anzulegen

### 9.6 Architektur (bestätigt, ergänzt)

- Microsoft Graph nur serverseitig aufrufen (korrekt)
- Client Secret durch Zertifikat oder Managed Identity ersetzen (korrekt -
  zusätzlich: RBAC for Applications statt Client Secret allein reduziert das
  Schadenspotenzial eines kompromittierten Secrets zusätzlich)
- Optimierung (CP-SAT) und Veröffentlichung (Graph-Event-Erstellung) als
  getrennte Prozesse implementieren (korrekt - deckt sich mit der
  Solver-Kapselung aus Abschnitt 3.1: der `TimetableSolver` kennt Graph gar
  nicht, ein separater `OutlookPublisher` übernimmt das Schreiben)
- Termine erst nach manueller Freigabe versenden (korrekt)

## 10. Externe Referenz: ITC-2019-Timetabling-Projekt (GitHub)

Analyse von [WideSu/University_Timetabling](https://github.com/WideSu/University_Timetabling)
— ein Hochschulprojekt, das die *International Timetabling Competition 2019*
mit MIP und Constraint Programming gelöst hat. Vier Punkte sind relevant.

### 10.1 Übernehmenswert: Prerequisite-Constraint (fehlt aktuell komplett)

Deren Constraint H4 ("Nimmst du AI Planning, musst du auch Algorithmen
belegen") gibt es bei euch nirgends — weder im `constraintCatalog.ts` noch
in `ModuleConstraint` (`stores/curriculum.ts`, Typ `requires | corequisite |
forbids` existiert als *Datenfeld*, wird aber vom Solver nicht ausgewertet).
Für ein mehrsemestriges Programm wie DBA ist das aber genau der Fall, den
ihr modelliert: Module mit Voraussetzungen müssen so verplant werden, dass
die On-Campus-Days des Voraussetzungs-Moduls **vor** denen des
abhängigen Moduls liegen.

**Fix-Richtung:** neuer Eintrag im Constraint-Katalog
(`MODULE_PREREQUISITE_ORDER`, hart), der für jedes Session-Paar mit
Prerequisite-Beziehung erzwingt, dass alle Tage des Voraussetzungsmoduls vor
allen Tagen des abhängigen Moduls liegen — technisch ähnlich zur
bestehenden Dozierenden-Konflikt-Prüfung (`addAtMostOne` pro Zeitfenster),
hier aber eine Reihenfolge- statt Exklusivitätsbedingung
(`dayIndex(A) < dayIndex(B)` für alle Sessions von A und B).

### 10.2 Übernehmenswert (als Testfall, nicht als neue Architektur)

Die zentrale Erkenntnis des Projekts — zuerst eine garantiert machbare
Lösung sichern, dann iterativ verbessern — ist bei `or-tools-wasm`/CP-SAT
bereits eingebaut: Der Solver liefert bei Zeitlimit-Ablauf den besten bisher
gefundenen Status `FEASIBLE` zurück, nicht "kein Ergebnis". Das sollte aber
**explizit getestet** werden, nicht nur angenommen — ergänzt Punkt 8 aus
der Solver-Review (fehlende Unit-Tests): ein Testfall, der ein sehr kurzes
`timeLimitSeconds` erzwingt und prüft, dass trotzdem ein gültiger,
wenn auch nicht optimaler Stundenplan zurückkommt.

### 10.3 Übernehmenswert: öffentliche Benchmark-Instanzen

Die [ITC-2019-Datensätze](https://www.itc2019.org/instances/all) sind reale,
extern validierte Timetabling-Probleme unterschiedlicher Grösse — geeignet
als zusätzliche Testfälle neben den eigenen synthetischen Benchmarks
(`benchmarks/run.ts`), um den Solver auch gegen von euch unabhängig erstellte
Probleminstanzen zu prüfen. Erfordert einen Konverter von deren XML-Format in
euren `SolverInput` — ähnlicher Aufwand wie deren eigenes
`01_data_extraction.ipynb`.

### 10.4 Nicht übertragbar

- **"MIP schlägt CP"** — die dortige Erkenntnis bezieht sich auf einen
  Vergleich zwischen einem "reinen" CP-Solver und einem MIP-Solver (z. B.
  CPLEX). `or-tools-wasm`/CP-SAT ist selbst bereits ein Hybrid aus
  Constraint Programming und linearer Relaxation (Lazy Clause Generation) —
  der Vergleich aus dem Projekt lässt sich nicht direkt auf eure
  Solver-Wahl übertragen und ist kein Grund, diese zu überdenken.
- **Student-Sectioning** — die ITC-Probleme ordnen zusätzlich einzelne
  Studierende mit individueller Kurswahl den Klassen zu und prüfen
  Konflikte auf Studierendenebene. Bei euch durchlaufen ganze Kohorten
  gemeinsam die Module eines Semesters — diese zusätzliche Modellebene
  bringt für CourseWeaver keinen Mehrwert und sollte nicht übernommen
  werden.

## 11. Externe Referenz: Timefold Quickstarts (GitHub)

Analyse von [TimefoldAI/timefold-quickstarts](https://github.com/TimefoldAI/timefold-quickstarts)
— Referenzimplementierungen für den Solver Timefold (Java/Kotlin, Fork von
OptaPlanner). Relevant sind vor allem zwei Quickstarts: *School Timetabling*
(sehr nah am eigenen Problem) und *Conference Scheduling* (deutlich
reichhaltigerer Constraint-Katalog). Die Bibliothek selbst ist nicht
übertragbar (Java/Kotlin, widerspricht der TypeScript-Entscheidung aus
Kap. 7) — die **Constraint-Modellierung** ist es sehr wohl, unabhängig von
der konkreten Solver-Bibliothek.

### 11.1 Kritisch: fehlende Kohorten-Konflikt-Prüfung

School-Timetabling-Constraint "Student group conflict" (hart): *"A student
group cannot attend two lessons at the same time."* Das gibt es in
`OrToolsWasmTimetableSolver.ts` nicht — dort werden nur Raum- und
Dozierenden-Konflikte geprüft (siehe Solver-Review, `solver-code-review.md`).
Zwei Module **desselben Programms und Semesters** könnten also theoretisch
gleichzeitig an verschiedenen Orten landen, obwohl dieselbe Kohorte beide
besuchen muss.

**Fix-Richtung:** neuer Eintrag im Constraint-Katalog
(`COHORT_CONFLICT`, hart), analog zur bestehenden
Dozierenden-Konflikt-Prüfung (`addAtMostOne` pro Zeitfenster), hier
gruppiert nach `(program, semester)` statt nach `instructorId` — sobald
Bug #1 aus der Solver-Review (ein Modul = eine Session) behoben ist, muss
diese Prüfung über alle Sessions eines Kohorten-Zeitfensters laufen, nicht
nur über einzelne Modul-Tage.

### 11.2 Übernehmenswert: Tag-basierte Constraint-Generalisierung

Conference-Scheduling nutzt ein generisches Tag-System statt einzelner
Spezialregeln: Talks und Timeslots/Räume tragen Tags, und vier
Beziehungstypen prüfen sie gegeneinander — *required*, *prohibited*,
*preferred*, *undesired* (z. B. "Speaker required timeslot tags", "Talk
prohibited room tags"). Das ist eine deutlich elegantere Generalisierung als
unser aktueller Ansatz in `constraintCatalog.ts`, wo jede neue Regel
(`noFriday`, `excludeDates`, `requiresRoomCapacity`, ...) eine eigene,
bespoke Implementierung braucht.

**Fix-Richtung (mittelfristig, kein Muss):** `OnCampusDay` bekommt Tags
(`weekday:friday`, `week:odd`, `phase:final`), `Module`/`Session` bekommt
`requiredDayTags` / `prohibitedDayTags` / `preferredDayTags` /
`undesiredDayTags`. Ein einziger generischer Constraint-Builder deckt dann
alle vier Beziehungstypen ab, statt für jede neue Restriktion eine neue
Funktion in `isDayAllowed`/`buildSolverInput` zu schreiben. Reduziert
Code-Duplikation erheblich, sobald mehr als eine Handvoll Regeln existieren.

### 11.3 Übernehmenswert: zweite unabhängige Bestätigung für Prerequisite-Constraints

Conference-Scheduling hat "Talk prerequisite talks" (hart): *"A talk can
only be scheduled after all its prerequisite talks."* — bestätigt
unabhängig den Befund aus Kap. 10.1 (ITC-Projekt). Zwei verschiedene,
ausgereifte Scheduling-Systeme behandeln Voraussetzungs-Reihenfolgen als
Standard-Hard-Constraint. Stärkt die Priorität von
`MODULE_PREREQUISITE_ORDER` aus Kap. 10.1.

### 11.4 Übernehmenswert: zwei zusätzliche Soft-Constraint-Ideen

- **Teacher room stability** ("A teacher should teach all their lessons in
  the same room") — auf euer Modell übertragen: ein Modul (bzw. eine
  Dozierende Person) sollte über die Sessions hinweg möglichst im selben
  Raum bleiben, nicht bei jeder Session neu zugewiesen werden. Reduziert
  Logistikaufwand, den ihr aktuell nicht bewertet.
- **Speaker makespan** / **Teacher time efficiency** (Zeitspanne bzw. Lücken
  im Terminplan einer Person minimieren) — relevant, wenn Dozierende in
  mehreren Modulen/Programmen eingesetzt sind (siehe `sample-data.js`,
  Prof. Aeschbacher/Egger lehren in mehreren Programmen) — ihr Gesamtplan
  über alle Module hinweg könnte unnötig zerstreut sein, auch wenn jedes
  einzelne Modul für sich optimal verplant ist.

### 11.5 Validierung, keine neue Erkenntnis

Die Conference-Scheduling-Tabelle nennt "Justifications" als Solver-Konzept
— Timefold erklärt automatisch, welche Regel warum wie viel zum Score
beigetragen hat. Das ist genau das, was `explainSolution.ts` (Kap. 3.3/9)
von Hand nachbaut, weil `or-tools-wasm`/CP-SAT das nicht mitliefert
(bereits in Kap. 7 festgehalten). Kein neuer Befund, aber eine gute
Bestätigung, dass dieser Teil eurer Architektur ein echtes, von etablierten
Systemen anerkanntes Bedürfnis abdeckt statt Überengineering zu sein.

### 11.6 Nicht übertragbar

- Timefold selbst (Java/Kotlin, Quarkus-Webapp, teils kommerzielle
  Lizenzstufen) — widerspricht der TypeScript-Entscheidung, keine
  Kursänderung notwendig
- "Crowd control" (Talks mit Publikums-Risiko dürfen sich nicht mit zu
  vielen anderen Risiko-Talks überschneiden) — hat keine Entsprechung im
  Curriculum-Kontext
