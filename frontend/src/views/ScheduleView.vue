<template>
  <v-container fluid>
    <div class="d-flex align-center ga-3 mb-1">
      <h1 class="text-h5">Planung</h1>
      <v-chip v-if="currentSemester" size="small" variant="tonal" color="primary">
        {{ currentSemester.identifier }} · {{ currentSemester.start_date }} – {{ currentSemester.end_date }}
      </v-chip>
      <v-chip v-if="slotConflicts.length" color="error" size="small">{{ slotConflicts.length }} Konflikte</v-chip>

    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">
      On-Campus-Kalender (Do/Fr/Sa · vormittags/nachmittags). Modul aus dem Pool auf eine Zelle ziehen,
      um einen Kontaktblock anzulegen; Klick auf einen Blockchip entfernt ihn wieder.
    </p>

    <v-alert v-if="error" type="error" variant="tonal" closable class="mb-4">{{ error }}</v-alert>

    <v-row dense class="mb-4" align="center">
      <v-col cols="12" md="5">
        <v-select
          v-model="programId"
          :items="['all', ...programs.map(p => p._id)].map(v => ({
            title: v === 'all' ? 'Alle Programme' : (programById(v)?.title ?? v),
            value: v,
          }))"
          label="Programm"
          variant="outlined" density="compact" hide-details
        />
      </v-col>
      <v-col cols="12" md="5">
        <v-select
          v-model="semesterId"
          :items="semesters.map(s => ({ title: `${s.identifier} · ${s.start_date}–${s.end_date}`, value: s._id }))"
          label="Semester"
          variant="outlined" density="compact" hide-details
        />
      </v-col>
      <v-col cols="12" md="2" class="text-caption text-medium-emphasis">
        {{ weeks.length }} aktive On-Campus-Wochen
      </v-col>
    </v-row>

    <v-row v-if="weeks.length">
      <v-col cols="12" md="9">
        <v-table density="compact" class="border rounded planning-table">
          <thead>
            <tr>
              <th class="text-left" style="width:7%">KW</th>
              <th v-for="col in columns" :key="col.key" class="pa-1">{{ col.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="w in visibleWeeks" :key="w.kw" :class="{ 'row-focused': !!focused }">
              <td class="small-cell text-medium-emphasis">
                <div class="font-weight-bold">KW{{ w.kw }}</div>
                <div>{{ w.thuLabel }}</div>
              </td>
              <td
                v-for="col in columns"
                :key="col.key"
                class="drop-cell pa-1 align-start"
                :class="{
                  'cell-free': cellSlotFree(w, col),
                  'cell-full': !cellSlotFree(w, col) && visibleBlocksAt(cellKey(w, col.weekday), col.period).length > 0,
                }"
                :data-date="cellKey(w, col.weekday)"
                :data-period="col.period"
                @click="onCellClick(w, col)"
              >
                <ScheduleBlockChip
                  v-for="(block, idx) in visibleBlocksAt(cellKey(w, col.weekday), col.period)"
                  :key="block._id + '_' + idx"
                  :block="block"
                  :module-title="moduleById(block.module_id)?.title ?? block.module_id"
                  :conflict-entries="conflictsByBlock.get(block._id) ?? new Set()"
                  :room-label="block.room_id ? labelRoom(block.room_id) : ''"
                  :selected-block="selectedBlockId === block._id"
                  dense
                  @pointer-drag-start="onPointerDragStart('block-slot', block._id, {
                    date: cellKey(w, col.weekday),
                    period: col.period,
                    roomId: block.room_id,
                  }, $event)"
                  @clear-slot="removeBlock(block._id)"
                />
              </td>
            </tr>
          </tbody>
        </v-table>

        <h2 class="text-h6 mt-8 mb-2">Konflikte (je Slot)</h2>
        <v-alert v-if="slotConflicts.length === 0" type="success" variant="tonal">Keine Konflikte.</v-alert>
        <v-list lines="two" class="border rounded mb-2">
          <v-list-item
            v-for="sc in slotConflicts"
            :key="sc.blockId + '_' + sc.date + '_' + sc.period"
            style="cursor: pointer"
            :class="{ 'conflict-clicked': isFocusedEntry(sc.date, sc.period) }"
            @click="onConflictClick(sc)"
          >
            <template #prepend>
              <v-icon icon="mdi-alert" color="warning" class="me-1" />
            </template>
            <v-list-item-title>
              <b>{{ moduleTitleByBlock(sc.blockId) }}</b> ↔ {{ counterpartInfo(sc.counterpartBlockIds) }}
              — {{ sc.reasons.join(' & ') }}
            </v-list-item-title>
            <v-list-item-subtitle>
              <span v-if="sc.room_id">Raum {{ labelRoom(sc.room_id) }} · </span>{{ formatDateDE(sc.date) }} · {{ readablePeriod(sc.period) }}
              · Ziehe das konfliktierende Modul auf einen anderen Slot (Drag & Drop), um den Konflikt zu beheben.
            </v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </v-col>

      <v-col cols="12" md="3">
        <!-- Kap. Konflikt-Lösung: Dropdown-Resolver im Fokusmodus -->
        <v-card v-if="focused" variant="tonal" color="warning" class="pa-3 mb-4">
          <div class="text-subtitle-1 font-weight-bold mb-2">Konflikt Lösen</div>
          <p class="text-caption mb-2">
            Wähle Modul, neuen Termin und Raum — dann „Anwenden“ (= Block verschieben).
          </p>

          <v-select
            v-model="resolveBlockId"
            :items="resolveBlockOptions"
            label="Modul (verschieben)"
            variant="outlined" density="compact" class="mb-2"
          />
          <v-select
            v-model="resolveDate"
            :items="resolveDateOptions"
            label="Neuer Termin"
            variant="outlined" density="compact" class="mb-2"
          />
          <v-select
            v-model="resolvePeriod"
            :items="[
              { title: 'Vormittag', value: 'morning' },
              { title: 'Nachmittag', value: 'afternoon' },
              { title: 'Abend', value: 'evening' },
            ]"
            label="Periode"
            variant="outlined" density="compact" class="mb-2"
          />
          <v-select
            v-model="resolveRoomId"
            :items="roomOptions"
            label="Raum"
            variant="outlined" density="compact" class="mb-2"
          />
          <v-btn color="primary" block prepend-icon="mdi-check" :loading="saving" :disabled="!resolveBlockId || !resolveDate" @click="applyResolver">
            Anwenden
          </v-btn>
        </v-card>

        <h2 class="text-h6 mb-2">Modul-Pool ({{ poolModules.length }})</h2>
        <v-card
          v-for="m in poolModules" :key="m._id"
          variant="outlined" class="pa-2 mb-2 pool-card"
          @mousedown="onPointerDragStart('module', m._id, null, $event)"
        >
          <div class="text-body-2 font-weight-medium">{{ m.title }}</div>
          <div class="text-caption text-medium-emphasis">
            {{ m.credits }} ECTS
            <span v-if="m.is_live_case" class="ms-1 text-primary">Live Case</span>
            <span v-if="m.delivery_status === 'planned'" class="ms-1 text-warning">unbestätigt</span>
          </div>
        </v-card>
      </v-col>
    </v-row>
    <v-alert v-else type="info" variant="tonal">Kein Semester gewählt.</v-alert>
  </v-container>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  usePlanning,
  type ContactBlock,
  type WeekRow,
  type PlanningModule,
} from '@/composables/usePlanning'
import ScheduleBlockChip from '@/components/ScheduleBlockChip.vue'
import type { SlotConflict } from '@/composables/usePlanning'

const {
  error,
  programs, semesters, programId, semesterId,
  currentSemester, weeks,
  filteredModules, filteredBlocks,
  conflictsByBlock, slotConflicts, roomById, blocks, rooms, planningPrefsRef: planningPrefs,
  load, moduleById, programById,
} = usePlanning()

/** Markus 8 Kap: Klick auf Konflikt → Kalender NUR noch der betroffene Zeit-Slot + Counterpart + Raum. */
interface FocusedConflict { kwHint?: number
  blockId: string
  date: string
  period: string
  reasons: string[]
  counterpartBlockIds: string[]
  roomId?: string
}
const focused = ref<FocusedConflict | null>(null)

function isFocusedEntry(date: string, period: string): boolean {
  return focused.value?.date === date && focused.value?.period === period
}

/**
 * Kalender bleibt IMMER vollständig sichtbar (gesamtes Semester) — der Konflikt-
 * Modus filtert nur die Kacheln (Chips) auf die konfliktinvolvierten Module
 * (visibleBlocksAt), nicht die Wochen.
 */
const visibleWeeks = computed<WeekRow[]>(() => weeks.value)

function labelRoom(roomId?: string): string {
  if (!roomId) return ''
  const r = roomById(roomId)
  return r?.room_number ?? r?.name ?? roomId
}

function moduleTitleByBlock(blockId: string): string {
  const block = blocks.value.find(b => b._id === blockId)
    ?? filteredBlocks.value.find(b => b._id === blockId)
  return moduleById(block?.module_id ?? '')?.title ?? blockId
}

function counterpartInfo(ids: string[]): string {
  return ids.map(id => moduleTitleByBlock(id)).join(', ')
}

function formatDateDE(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' })
}

const readablePeriod = (p: string): string => (p === 'morning' ? 'Vormittag' : p === 'afternoon' ? 'Nachmittag' : 'Abend')

const WEEKDAY_LABELS: Record<string, string> = {
  monday: 'Montag', tuesday: 'Dienstag', wednesday: 'Mittwoch', thursday: 'Donnerstag',
  friday: 'Freitag', saturday: 'Samstag', sunday: 'Sonntag',
}

const roomsById = computed(() => rooms.value)



function onConflictClick(sc: SlotConflict): void {
  // 1) Semester-Selektor automatisch auf das Semester setzen, das das Konflikt-Datum enthält
  // (Sonst ist die Konflikt-Zelle ausserhalb des sichtbaren KW-Rasters und der Kalender bleibt leer.)
  const covers = semesters.value.find(s => sc.date >= s.start_date && sc.date <= s.end_date)
  if (covers && covers._id !== semesterId.value) semesterId.value = covers._id
  const kw = weeks.value.find(w => weekForDate(w, sc.date) !== undefined)?.kw
  focused.value = {
    blockId: sc.blockId,
    date: sc.date,
    period: sc.period,
    reasons: [...sc.reasons],
    counterpartBlockIds: [...sc.counterpartBlockIds],
    roomId: sc.room_id,
    kwHint: kw,
  }
}

function weekForDate(w: WeekRow, date: string): 'thursday' | 'friday' | 'saturday' | undefined {
  if (date === w.thursday) return 'thursday'
  if (date === w.friday) return 'friday'
  if (date === w.saturday) return 'saturday'
  return undefined
}

interface Column {
  key: string
  weekday: 'thursday' | 'friday' | 'saturday'
  period: 'morning' | 'afternoon'
  label: string
}
const planningColumns = computed<Column[]>(() => {
  return planningPrefs.value.planningDays.flatMap((d: string) => [
    { key: `${d}_morning`, weekday: d as 'thursday' | 'friday' | 'saturday', period: 'morning' as const, label: `${(WEEKDAY_LABELS[d] ?? d).slice(0, 2)} · Vormittag` },
    { key: `${d}_afternoon`, weekday: d as 'thursday' | 'friday' | 'saturday', period: 'afternoon' as const, label: `${(WEEKDAY_LABELS[d] ?? d).slice(0, 2)} · Nachmittag` },
  ])
})
const columns = planningColumns

/** farbliche Anzeige: gibt es im Ziel-Slot noch einen freien Raum? */
function cellSlotFree(w: WeekRow, col: Column): boolean {
  return freeRoomInfo(cellKey(w, col.weekday), col.period).free
}

const selectedBlockId = ref<string | null>(null)

const dateOf = {
  monday: (w: WeekRow) => w.days.monday?.date,
  tuesday: (w: WeekRow) => w.days.tuesday?.date,
  wednesday: (w: WeekRow) => w.days.wednesday?.date,
  thursday: (w: WeekRow) => w.days.thursday?.date,
  friday: (w: WeekRow) => w.days.friday?.date,
  saturday: (w: WeekRow) => w.days.saturday?.date,
  sunday: (w: WeekRow) => w.days.sunday?.date,
} as const

function cellKey(w: WeekRow, weekday: keyof typeof dateOf): string {
  return dateOf[weekday](w) ?? ''
}

/** Blocks, die an diesem Kalenderdatum (KW-Tag) einen Slot haben. */
function visibleBlocksAt(dateStr: string, period: string): ContactBlock[] {
  // Fokusmodus (Lösungsansicht): NUR die Beteiligten des angeklickten Konflikts
  // (Modul + Counterpart-BMods) — aber aus dem FULLEN Bestand, nicht der
  // programmfilterten Liste (damit auch über Programm-Grenzen sichtbar bleiben).
  if (!focused.value) return blocksAt(dateStr, period)
  const involved = new Set<string>([focused.value.blockId, ...focused.value.counterpartBlockIds])
  return blocks.value.filter((b: any) => {
    if (!involved.has(b._id)) return false
    return (b.slots ?? []).some((s: any) => s.date === dateStr && (s.period ?? 'morning') === period)
  })
}

function blocksAt(dateStr: string, period: string): ContactBlock[] {
  return filteredBlocks.value.filter(b =>
    (b.slots ?? []).some(s => s.date === dateStr && (s.period ?? 'morning') === period),
  )
}

const poolModules = computed<PlanningModule[]>(() =>
  filteredModules.value.filter(m => !hasAnyBlockForModule(m._id)),
)

function hasAnyBlockForModule(moduleId: string): boolean {
  // true, sobald das Modul überhaupt einen Block hat
  return filteredBlocks.value.some(b => b.module_id === moduleId)
}

/** Klick-Modus (Fallback, wenn HTML5-Drag in Tabellen zickt): Chip anklicken → Ziel-Zelle anklicken. */
function onCellClick(w: WeekRow, col: Column): void {
  if (!selectedBlockId.value) return
  const blockId = selectedBlockId.value
  selectedBlockId.value = null
  void moveBlockTo(blockId, dateOf[col.weekday](w) ?? '', col.period)
}

/**
 * Konflikt-Lösung durch Verschieben: Delta vom ersten Slot des Blocks zum
 * Ziel-Datum rechnen und ALLE Slots mit demselben Tages-Verschieb anwenden,
 * so dass das Slot-Muster erhalten bleibt. Bei delta === 0 wird die Periode geändert.
 */
async function moveBlockTo(blockId: string, targetDate: string, targetPeriod: string): Promise<void> {
  const block = blocks.value.find(b => b._id === blockId)
  if (!block) return
  const slots = [...(block.slots ?? [])].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const first = slots[0]
  if (!first) return
  const delta = Math.round(
    (new Date(`${targetDate}T00:00:00Z`).getTime() - new Date(`${first.date}T00:00:00Z`).getTime()) / 86400000,
  )
  let newSlots
  if (delta === 0) {
    // gleicher Tag: Periode der Slots am Ziel-Datum ändern (Raum bleibt)
    newSlots = (block.slots ?? []).map(sl =>
      sl.date === targetDate ? { ...sl, period: targetPeriod } : sl,
    )
    if (isSameSlots(newSlots, block.slots)) return
  } else {
    newSlots = (block.slots ?? []).map(sl => {
      const d = new Date(`${sl.date}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() + delta)
      return { ...sl, date: d.toISOString().slice(0, 10), weekday: weekdayOfNum(d.getUTCDay()) }
    })
  }
  await fetch(`/api/contact_blocks/${encodeURIComponent(blockId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...block, slots: newSlots, status: 'planned' }),
  })
  await load()
  focused.value = null
}

function isSameSlots(a: ContactBlock['slots'], b: ContactBlock['slots']): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}



function weekdayOfNum(n: number): string {
  switch (n) {
    case 4: return 'thursday'
    case 5: return 'friday'
    case 6: return 'saturday'
    case 0: return 'sunday'
    case 1: return 'monday'
    case 2: return 'tuesday'
    default: return 'wednesday'
  }
}


async function createBlockAt(moduleId: string, cell: { date: string; period: string }): Promise<void> {
  const block = {
    module_id: moduleId,
    title: `Block · ${moduleById(moduleId)?.title ?? moduleId}`,
    slots: [{ date: cell.date, weekday: weekdayOfNumByDate(cell.date), period: cell.period }],
    status: 'planned',
  }
  await fetch('/api/contact_blocks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(block),
  })
  await load()
  focused.value = null
}

function weekdayOfNumByDate(iso: string): string {
  return weekdayOfNum(new Date(`${iso}T00:00:00Z`).getUTCDay())
}

async function removeBlock(blockId: string): Promise<void> {
  await fetch(`/api/contact_blocks/${encodeURIComponent(blockId)}`, { method: 'DELETE' })
  await load()
}


/** Klick auf Konflikt → erste betroffene Woche hervorheben + Hinweis auf weitere Wochen. */
const saving = ref(false)


interface PointerDrag {
  kind: 'module' | 'block-slot'
  id: string
  startX: number
  startY: number
  active: boolean
  hovered?: { date: string; period: string; roomId?: string }
  /** ausgehender Slot (nur bei Kachel eines Blocks: Ursprungs-Datum/Periode/Raum) */
  origin?: { date: string; period: string; roomId?: string }
}

let pointerDrag: PointerDrag | null = null
let ghostEl: HTMLDivElement | null = null

/** Kap-Detail — Pointer-Drag: mousedown am Chip/Pool-Karte (kein HTML5-Drag, zuverlässig in Tabellen). */
function onPointerDragStart(
  kind: 'module' | 'block-slot',
  id: string,
  origin: { date: string; period: string; roomId?: string } | null,
  evt: MouseEvent,
): void {
  if (evt.button !== 0) return
  pointerDrag = {
    kind,
    id,
    startX: evt.clientX,
    startY: evt.clientY,
    active: false,
    origin: origin ?? undefined,
  }
  document.addEventListener('mousemove', onDocMouseMove)
  document.addEventListener('mouseup', onDocMouseUp)
}

function onDocMouseMove(evt: MouseEvent): void {
  if (!pointerDrag) return
  const dist = Math.hypot(evt.clientX - pointerDrag.startX, evt.clientY - pointerDrag.startY)
  if (!pointerDrag.active && dist < 5) return
  pointerDrag.active = true
  createGhost()
  const cell = hoveredCellFromPoint(evt.clientX, evt.clientY)
  pointerDrag.hovered = cell ?? undefined
  let text = pointerDrag.kind === 'module'
    ? `Modul: ${moduleById(pointerDrag.id)?.title ?? pointerDrag.id} ablegen`
    : `Modul: ${moduleTitleByBlock(pointerDrag.id)} verschieben`
  if (cell) {
    const dateDE = formatDateDE(cell.date)
    const periodDE = readablePeriod(cell.period)
    text += ` → ${dateDE} · ${periodDE}`
    // Kap: Ziel-Slot-Besetzung anzeigen (anderes Modul belegt denselben Raum/Zeit-Slot)
    const occupied = documentOccupancyIn({ date: cell.date, period: cell.period })
    if (occupied.length) {
      const occupant = documentOccupiedTitles(occupied).join(', ')
      const room = occupied[0]!.room_id ? ` (Raum ${labelRoom(occupied[0]!.room_id)})` : ''
      text += `\n⚠ Belegt von: ${occupant}${room}`
    }
  }
  updateGhost(evt.clientX, evt.clientY, text)
}

function onDocMouseUp(evt: MouseEvent): void {
  const pd = pointerDrag
  pointerDrag = null
  document.removeEventListener('mousemove', onDocMouseMove)
  document.removeEventListener('mouseup', onDocMouseUp)
  removeGhost()
  if (!pd || !pd.active) return
  const cell = hoveredCellFromPoint(evt.clientX, evt.clientY)
  if (!cell) return
  if (pd.kind === 'module') {
    void createBlockAt(pd.id, cell)
  } else {
    // Kap: Einzelkachel-Verschiebung — nur der Ursprungs-Slot wandert auf Ziel-Datum/Periode
    void moveSingleSlotTo(pd.id, pd.origin!, cell)
  }
}

/**
 * Einzelkachel-Verschiebung: NUR der Ursprungs-Slot (Datum/Periode) wird auf das
 * Zieldatum (-Periode) umgebucht — die übrigen Slots des Blocks bleiben unverändert.
 */
async function moveSingleSlotTo(
  blockId: string,
  origin: { date: string; period: string; roomId?: string },
  target: { date: string; period: string },
): Promise<void> {
  const block = blocks.value.find(b => b._id === blockId)
  if (!block) return
  const matches = (s: ContactBlock['slots'][number]) =>
    s.date === origin.date && (s.period ?? 'morning') === origin.period
  if (!(block.slots ?? []).some(matches)) return
  // No-op: Ziel = Ursprung
  if (origin.date === target.date && (origin.period ?? 'morning') === target.period) return
  let changed = false
  const newSlots = (block.slots ?? []).map((sl: ContactBlock['slots'][number]) => {
    if (!matches(sl)) return sl
    changed = true
    return {
      ...sl,
      date: target.date,
      weekday: weekdayOfNum(new Date(`${target.date}T00:00:00Z`).getUTCDay()),
      period: target.period,
      room_id: sl.room_id ?? origin.roomId,
    }
  })
  if (!changed) return
  await fetch(`/api/contact_blocks/${encodeURIComponent(blockId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...block, slots: newSlots, status: 'planned' }),
  })
  await load()
  focused.value = null
}

function hoveredCellFromPoint(x: number, y: number): { date: string; period: string } | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null
  if (!el) return null
  const td = el.closest('td[data-date]') as HTMLElement | null
  if (!td) return null
  const date = td.getAttribute('data-date') ?? ''
  if (!date) return null
  return { date, period: td.getAttribute('data-period') ?? 'morning' }
}

/** Blöcke, die in einem Ziel-Slot belegen (ausser dem gezogenen Block) — Kap: „Belegt“-Warnung */
function documentOccupancyIn(cell: { date: string; period: string }): ContactBlock[] {
  return blocks.value.filter((b: ContactBlock) =>
    b._id !== (pointerDrag as PointerDrag | null)?.id &&
    (b.slots ?? []).some((s: ContactBlock['slots'][number]) => s.date === cell.date && (s.period ?? 'morning') === cell.period),
  )
}

/** freie Räume in einem Ziel-Slot (Kap: farbliche Anzeige freier Time-Slots) */
function freeRoomInfo(date: string, period: string): { free: boolean; takenCount: number; totalRooms: number } {
  const taken = new Set<string>()
  for (const b of blocks.value) {
    for (const s of b.slots ?? []) {
      const roomId = s.room_id || b.room_id
      if (s.date === date && (s.period ?? 'morning') === period && roomId) taken.add(roomId)
    }
  }
  const total = rooms.value.length
  if (total === 0) return { free: true, takenCount: taken.size, totalRooms: 0 }
  const free = rooms.value.some(r => !taken.has((r._id ?? r.id) as string))
  return { free, takenCount: taken.size, totalRooms: total }
}

function documentOccupiedTitles(occupied: ContactBlock[]): string[] {
  return occupied.map((o: ContactBlock) => moduleTitleByBlock(o._id as string))
}

function createGhost(): void {
  if (ghostEl) return
  ghostEl = document.createElement('div')
  ghostEl.className = 'dnd-ghost'
  ghostEl.style.cssText = [
    'position:fixed', 'z-index:9999', 'pointer-events:none',
    'background:rgba(255,255,255,0.97)', 'border:1px dashed rgba(25,118,210,0.7)',
    'border-radius:6px', 'padding:6px 10px', 'font-size:12px',
    'box-shadow:0 4px 12px rgba(0,0,0,0.2)', 'white-space:pre-line',
  ].join(';')
  document.body.appendChild(ghostEl)
}

function updateGhost(x: number, y: number, text: string): void {
  createGhost()
  if (!ghostEl) return
  if (ghostEl.textContent !== text) ghostEl.textContent = text
  ghostEl.style.left = `${x + 14}px`
  ghostEl.style.top = `${y + 10}px`
}

function removeGhost(): void {
  if (ghostEl) { ghostEl.remove(); ghostEl = null }
}


onMounted(() => {
  void load()
})

// ------------------- Dropdown-Resolver (rechte Spalte, Fokusmodus) -------------------

const resolveBlockId = ref('')
const resolveDate = ref<string>('')
const resolvePeriod = ref('morning')
const resolveRoomId = ref<string>('')

const resolveBlockOptions = computed(() => {
  if (!focused.value) return []
  const desired = new Set<string>([focused.value.blockId, ...focused.value.counterpartBlockIds])
  return [...desired].map(id => {
    const block = blocks.value.find(b => b._id === id)
    return { value: id, title: moduleById(block?.module_id ?? '')?.title ?? id }
  })
})

const resolveDateOptions = computed(() => {
  const out: Array<{ title: string; value: string }> = []
  for (const w of weeks.value) {
    for (const [day, info] of Object.entries(w.days)) {
      out.push({ title: `KW ${w.kw} · ${WEEKDAY_LABELS[day] ?? day} ${info.label}`, value: info.date })
    }
  }
  return out
})

const roomOptions = computed(() =>
  roomsById.value.map((r: any) => ({ value: r._id ?? r.id, title: r.name ?? r.room_number ?? r._id })),
)

/* Preselects: bei Fokus auf den betroffenen Block/Datum defaulted */
watch(focused, (f) => {
  if (!f) return
  resolveBlockId.value = f.blockId
  // Vorschlag: Datum = Konflikt-Datum (oder erste Woche danach)
  resolveDate.value = f.date
  resolvePeriod.value = f.period
  resolveRoomId.value = ''
})

/** Anwenden — Blockdatum & Periode & Raum ändern, Slot(s) ganz konsolidiert neu schreiben. */
async function applyResolver(): Promise<void> {
  const blockId = resolveBlockId.value
  if (!blockId || !resolveDate.value) return
  saving.value = true
  try {
    const block = blocks.value.find(b => b._id === blockId)
    if (!block) return
    const slots = [...(block.slots ?? [])].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    const first = slots[0]
    if (!first) return
    const delta = Math.round(
      (new Date(`${resolveDate.value}T00:00:00Z`).getTime() -
        new Date(`${first.date}T00:00:00Z`).getTime()) / 86400000,
    )
    const shifted = (block.slots ?? []).map((sl) => {
      const d = new Date(`${sl.date}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() + delta)
      const roomToUse = (resolveRoomId.value || sl.room_id || block.room_id) as string | undefined
      // gleiche Periode für alle Slots — oder delta===0: Legal nur der gezielte Slot zur Periode
      const period = delta === 0 ? resolvePeriod.value : (sl.period ?? 'morning')
      return { ...sl, date: d.toISOString().slice(0, 10), weekday: weekdayOfNum(d.getUTCDay()), period, room_id: roomToUse }

    })
    await fetch(`/api/contact_blocks/${encodeURIComponent(blockId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...block, slots: shifted, status: 'planned' }),
    })
    await load()
    focused.value = null
  } finally {
    saving.value = false
  }
}

</script>

<style scoped>
.planning-table td.drop-cell { min-width: 130px; min-height: 46px; }
.planning-table td.drop-cell:hover { outline: 2px dashed #1976d2; background: rgba(25,118,210,0.07); }
tr.row-focused { outline: 2px solid #1976d2; background: rgba(25,118,210,0.08); }
.drop-target { outline: 2px dashed var(--v-anchor-base, #933); background: rgba(25,118,210,.06); }
td.small-cell { white-space: nowrap; }
</style>
