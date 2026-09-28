# Constraint-Erfassung: Umsetzung in Vue

Diese Datei beschreibt den [Design-Entwurf](https://claude.ai/artifact/AR8aq5Tqtw6ioLgfQ994Wm)
(zwei Screens: Übersicht + Neue-Regel-Dialog) so, dass ein:e
Vue-Entwickler:in ihn direkt nachbauen kann — Komponenten, Datenfluss,
Design-Tokens, nichts vom Mockup-Code selbst (der ist reines HTML/CSS zum
Anschauen, keine Vue-Vorlage).

## 1. Komponenten-Aufteilung

```
components/constraints/
├── ConstraintsOverviewPage.vue   ← Screen 1 "Übersicht"
├── ConstraintCategoryList.vue    ← linke Sidebar (Kategorie-Filter)
├── ConstraintRow.vue             ← eine Zeile in der Regel-Liste
├── SystemRuleRow.vue             ← eine Zeile im "Systemregeln"-Block
├── NewConstraintDialog.vue       ← Screen 2 "Neue Regel" (als Dialog/Modal)
├── ConstraintTypeCard.vue        ← ein auswählbarer Regeltyp im Dialog
└── details/
    ├── NoWeekdayFields.vue       ← Detail-Formular je Regeltyp
    ├── ExcludeDatesFields.vue
    ├── RoomCapacityFields.vue
    ├── PrerequisiteFields.vue
    └── GenericSoftFields.vue     ← Fallback für alle weichen Regeln ohne Spezialfall
```

Jede Datei entspricht genau einem visuell abgegrenzten Block im Mockup —
das macht die Zuordnung eindeutig, wenn man das Bild neben den Code legt.

## 2. Datenmodell

Im Mockup sind die Regeln als feste JS-Arrays hinterlegt (`RULES`, `TYPES`)
— das war nur Platzhalter-Beispieldaten für die Darstellung. In der echten
App kommen sie vom Backend, in der Form, die `constraintCatalog.ts` und
`domain.ts` (Solver-Teil) bereits definieren:

```ts
interface ConstraintCategory {
  id: 'zeitfenster' | 'raum' | 'reihenfolge' | 'verteilung'
  label: string
}

interface ConstraintTypeDef {
  id: string            // z.B. 'no_weekday', 'prerequisite'
  category: ConstraintCategory['id']
  name: string
  desc: string
  hard: boolean          // fest pro Typ, nicht durch die Person wählbar
}

interface ConstraintInstance {
  id: string
  typeId: string
  moduleId: string        // Bezug auf Module.id aus domain.ts
  weight?: number         // nur bei weichen Regeln (hard: false)
}
```

Die Liste der `ConstraintTypeDef` ist im Grunde `constraintCatalog.ts` als
UI-taugliche Liste statt eines Objekts mit stabilen Keys — am einfachsten:
eine kleine Transformationsfunktion, die aus dem bestehenden Katalog genau
dieses Array baut, statt die Typen zweimal zu pflegen.

## 3. Zustand (State)

Mit der Composition API reichen wenige `ref`/`computed`:

```ts
// ConstraintsOverviewPage.vue
const selectedCategory = ref<string>('all')
const rules = ref<ConstraintInstance[]>([])      // vom Backend geladen
const ruleTypes = ref<ConstraintTypeDef[]>([])    // aus dem Constraint-Katalog

const visibleRules = computed(() =>
  selectedCategory.value === 'all'
    ? rules.value
    : rules.value.filter(r => typeOf(r).category === selectedCategory.value)
)

function typeOf(rule: ConstraintInstance) {
  return ruleTypes.value.find(t => t.id === rule.typeId)!
}
```

Im Mockup war das Filtern eine reine JS-`.filter()`-Berechnung bei jedem
Render — das ist genau das, was `computed()` in Vue macht, nur dass Vue es
automatisch neu berechnet, wenn `selectedCategory` sich ändert.

```ts
// NewConstraintDialog.vue
const isOpen = defineModel<boolean>('open')          // steuert Sichtbarkeit
const selectedCategory = ref<string>('zeitfenster')
const selectedType = ref<string | null>(null)

const typesInCategory = computed(() =>
  ruleTypes.value.filter(t => t.category === selectedCategory.value)
)

// Kategorie wechseln setzt die Typ-Auswahl zurück — im Mockup dieselbe Logik
function selectCategory(id: string) {
  selectedCategory.value = id
  selectedType.value = null
}
```

## 4. Wie die Detail-Felder wechseln (Schritt 3 im Dialog)

Im Mockup habe ich das mit mehreren `<sc-if>`-Blöcken gelöst (die
HTML/CSS-Vorschau kennt kein Vue). In Vue gibt es dafür die sauberere
Lösung: eine Zuordnungstabelle Typ-ID → Komponente, dann
**`<component :is="...">`** statt eine lange `v-if`/`v-else-if`-Kette:

```ts
import NoWeekdayFields from './details/NoWeekdayFields.vue'
import ExcludeDatesFields from './details/ExcludeDatesFields.vue'
import RoomCapacityFields from './details/RoomCapacityFields.vue'
import PrerequisiteFields from './details/PrerequisiteFields.vue'
import GenericSoftFields from './details/GenericSoftFields.vue'

const DETAIL_COMPONENTS: Record<string, Component> = {
  no_weekday: NoWeekdayFields,
  exclude_dates: ExcludeDatesFields,
  room_capacity: RoomCapacityFields,
  prerequisite: PrerequisiteFields,
}

const activeDetailComponent = computed(
  () => DETAIL_COMPONENTS[selectedType.value ?? ''] ?? GenericSoftFields,
)
```

```html
<component :is="activeDetailComponent" v-model="formValues" />
```

**Warum das besser ist als die `v-if`-Kette aus dem Mockup:** Wenn später
ein neuer Regeltyp dazukommt (z. B. aus der Tag-basierten Generalisierung,
die wir in der Solver-Doku diskutiert haben), reicht ein neuer Eintrag in
`DETAIL_COMPONENTS` — keine wachsende `v-else-if`-Kette, die man immer
wieder anfassen muss.

## 5. Badge-Styling (Hart/Weich) als eine Stelle, nicht pro Zeile

Im Mockup wird die Badge-Farbe pro Regel berechnet. In Vue macht man das am
saubersten als eine Hilfsfunktion, die überall (Übersicht + Dialog)
denselben Code benutzt, statt die Farblogik zweimal zu pflegen:

```ts
// utils/constraintStyles.ts
export function badgeClasses(hard: boolean) {
  return hard
    ? 'bg-[#FBEAE7] text-[#9A3324]'   // Hart
    : 'bg-[#E8F1EE] text-[#2B6E63]'   // Weich
}
```

(Beispiel mit Tailwind-Klassen; genauso gut als normales CSS-Modul, falls
ihr kein Tailwind nutzt.)

## 6. Design-Tokens

| Element | Wert |
|---|---|
| Schrift Überschriften | "Fraunces" (Google Fonts), 500–700 |
| Schrift Fliesstext/UI | "IBM Plex Sans" (Google Fonts), 400–600 |
| Hintergrund Seite | `#F6F4EE` |
| Hintergrund Karten/Panels | `#FFFFFF` |
| Rahmenfarbe | `#E3DFD3` |
| Text primär | `#1E211D` |
| Text sekundär | `#63665F` |
| Akzent (Buttons, aktiver Filter) | `#2B6E63` |
| Badge "Hart" | Hintergrund `#FBEAE7`, Text `#9A3324` |
| Badge "Weich" | Hintergrund `#E8F1EE`, Text `#2B6E63` |
| Badge "Neu" | Hintergrund `#FBF3D9`, Text `#8A6D1F` |
| Eckenradius Karten | 10px |
| Eckenradius Buttons/Chips | 8px (Buttons), 999px (Chips/Badges) |

Am einfachsten legt ihr diese Werte einmal als CSS-Variablen oder
Tailwind-Theme-Erweiterung an (`--color-accent: #2B6E63` usw.), statt Hex-Werte
direkt in den Komponenten zu verstreuen — dann lässt sich die Farbgebung
später an einer Stelle anpassen.

## 7. Verhalten, das im Mockup nur angedeutet ist (für die echte Umsetzung ergänzen)

Das Mockup zeigt einen "Glücksfall"-Zustand (alles ausgefüllt, alles
sichtbar) — folgendes fehlt bewusst und muss beim Bauen ergänzt werden:

- **"Regel speichern"-Button**: im Mockup immer aktiv. In der echten App:
  deaktiviert, solange Pflichtfelder des gewählten Regeltyps leer sind
  (z. B. `computed(() => selectedType.value && isValid(formValues.value))`)
- **Löschen-Button** in der Übersicht: im Mockup ohne Funktion. Sollte eine
  Bestätigung anfordern, bevor die Regel wirklich entfernt wird
- **Leerer Zustand**: was die Übersicht zeigt, wenn eine Kategorie null
  Regeln hat (im Mockup kommt das nicht vor, da immer mind. eine Regel pro
  Kategorie existiert)
- **Laden/Fehler**: die Regel- und Typ-Listen kommen vom Backend — Mockup
  zeigt nur den fertig geladenen Zustand

## 8. Zusammenhang mit dem Solver

Wichtig für die Zuordnung: Die editierbaren Regeln (Übersicht,
oberer Teil) entsprechen den `Restriction`-Objekten pro Modul
(`constraintCatalog.ts`). Der "Systemregeln"-Block unten (Raum-,
Dozierenden-, Kohorten-Konflikt) entspricht dagegen den Constraints, die
`OrToolsWasmTimetableSolver.ts` fest für **jedes** Modul einbaut, unabhängig
von individuellen `Restriction`-Einträgen — deshalb ist dieser Block bewusst
nicht editierbar. Diese Unterscheidung sollte auch im Code sichtbar bleiben:
zwei getrennte Datenquellen, nicht eine gemeinsame Liste mit einem
"editable"-Flag.
