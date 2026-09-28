/**
 * Planungs-Datenlayer (Mockup-Parität): On-Campus-Kalender, Modulpool,
 * Konfliktdetektion und Todos — alles über die generische Entity-API (/api/:table).
 * Portions der Kalender-/Konfliktlogik sind Portierungen aus frontend/mockup/mockup.html.
 */
import { computed, ref, shallowRef } from 'vue'
import { loadAppDefaults, DEFAULT_PLANNING_DAYS, type PlanningDefaults } from './useAppDefaults.js'

export interface Semester {
  _id: string
  identifier: string
  start_date: string
  end_date: string
  special_dates?: unknown[]
}
export interface PlanningModule {
  _id: string
  title: string
  program_id: string
  semester_id?: string
  credits?: number
  is_live_case?: boolean
  delivery_status?: 'planned' | 'confirmed'
  strategic_theme_ids?: string[]
  instructor_ids?: string[]
}
export interface Slot {
  date: string
  weekday: string // 'thursday' | 'friday' | 'saturday'
  period: string // 'morning' | 'afternoon' | 'evening'
  room_id?: string
}
export interface ContactBlock {
  _id: string
  module_id: string
  title: string
  slots: Slot[]
  room_id?: string
  instructor_ids?: string[]
  status?: 'planned' | 'confirmed'
}
export interface Instructor {
  _id: string
  name: string
  email?: string
  department?: string
}
export interface InstructorAvailability {
  _id: string
  instructor_id: string
  unavailable_half_days: Array<{ date: string; weekday: string; period: string }>
  external_teaching?: Array<{ date: string; period: string }>
  preferred_weekdays?: string[]
  max_days_per_block?: number
}
export interface Todo {
  _id: string
  title: string
  description?: string
  program_id?: string
  source: string
  /** 'open' für Backlog & 'bald', 'in_progress' fürs WIP-Board, 'done' erledigt */
  status: 'open' | 'in_progress' | 'done'
  created_date: string
  /** Enddatum fürs Kanban (Spalte „bald fällig“ wenn <=14 Tage) */
  due_date?: string
  related_module_id?: string
  related_competency_id?: string
}

export const DAY_LABEL: Record<string, string> = {
  thursday: 'Donnerstag',
  friday: 'Freitag',
  saturday: 'Samstag',
}
export const PERIOD_LABEL: Record<string, string> = {
  morning: 'Vormittag',
  afternoon: 'Nachmittag',
  evening: 'Abend',
}
export const PERIODS = ['morning', 'afternoon'] as const
export const DAYS = ['thursday', 'friday', 'saturday'] as const


export interface WeekRow {
  kw: number
  /** generisch jeDEFINED Voreinstellung: ISO-Datum je Wochentag (Schlüssel = 'thursday' …) */
  days: Record<string, { date: string; label: string; weekday: string }>
  /** backward compatibility Aliase — nur vorhanden, wenn der Wochentag aktiv ist! */
  thursday?: string
  friday?: string
  saturday?: string
  thuLabel?: string
  friLabel?: string
  satLabel?: string
}

export function buildWeeks(semester: Semester | undefined, prefs?: PlanningDefaults): WeekRow[] {
  if (!semester) return []

  /**
   * VOLLSTÄNDIGES Raster: von der ersten KW im start_date bis zum end_date des
   * Semesters (ISO-KW je Donnerstag). Fixe KW-Grenzen (39–51 / 6–23) decken die
   * echten Semesterspannen NICHT ab — deshalb fehlten Kacheln (z.B. 03.02.)
   * und Konflikt-Zellen blieben leer.
   */
  function isoWeek(d: Date): number {
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    const day = date.getUTCDay() || 7
    date.setUTCDate(date.getUTCDate() + 4 - day) // Thursday der Woche
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
    return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  }

  const start = new Date(`${semester.start_date}T00:00:00Z`)
  const end = new Date(`${semester.end_date}T00:00:00Z`)

  // Kap. Voreinstellungen: erlaubte Wochentage + KW-Range (Aktiviert-Mechanik)
  // KW-Range: NUR clampen, wenn der User in den Einstellungen explizite Werte hinterlegt hat
  // (sonst deckt das Raster naturally start_date..end_date ab — fixe 39–51/6–23
  //  schneiden z.B. Januar/Februar-Wochen ab und Konflikt-Zellen blieben leer).
  function saneKw(v?: number | null): number | null {
    return v != null && Number.isFinite(v) && v > 0 ? Math.floor(v) : null
  }
  const cfg = {
    planningDays: prefs?.planningDays?.length ? [...prefs.planningDays] : [...DEFAULT_PLANNING_DAYS],
    startKW: saneKw(prefs?.startKW),
    endKW: saneKw(prefs?.endKW),
  }

  const weeks: WeekRow[] = []
  // FINAL kalenderraster: iterate all weeks between Monday of start_date and end_date,
  // aber NUR die durch die Voreinstellung erlaubte KW-Range und — wie jetzt Rücken weiter —
  // NUR die aktivierten On-Campus-Wochentage je KW-Zeile auswerfen.
  const cur = new Date(start)
  cur.setUTCDate(cur.getUTCDate() - ((cur.getUTCDay() || 7) - 1)) // Montag
  while (cur <= new Date(end)) {
    // die Wochen-Write-Logik bleibt: alle aktiven Tage der Woche in `days` schreiben
    const rowDays: WeekRow['days'] = {}
    const f = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.`
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    const kw = isoWeek(new Date(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate() + 3))
    // pro Tag in Woche durchgehen: für jeden aktivierten Wochentag ein Eintrag
    for (let i = 0; i < 7; i++) {
      const d = new Date(cur); d.setUTCDate(cur.getUTCDate() + i)
      const weekdayKey = ({
        1:'monday', 2:'tuesday', 3:'wednesday', 4:'thursday', 5:'friday', 6:'saturday', 0:'sunday',
      } as Record<number, string>)[d.getUTCDay()] ?? ''
      if (!(cfg.planningDays as string[]).includes(weekdayKey)) continue
      if (d < start || d > end) continue
      rowDays[weekdayKey] = { date: iso(d), label: f(d), weekday: weekdayKey }
    }
    const kwIn = (cfg.startKW == null || kw >= cfg.startKW) && (cfg.endKW == null || kw <= cfg.endKW)
    if (Object.keys(rowDays).length > 0 && kwIn) {
      weeks.push({ kw, days: rowDays, ...legacyAliases(rowDays) })
    }
    cur.setUTCDate(cur.getUTCDate() + 7)
  }
  return weeks
}

/** legacy Aliase: thursday/friday/saturday für bestehende Konsumenten (dropin kompatibel) */
function legacyAliases(rowDays: WeekRow['days']): Partial<Record<string, string>> {
  const out: Partial<Record<string, string>> = {}
  if (rowDays.thursday) { out.thursday = rowDays.thursday.date; out.thuLabel = rowDays.thursday.label }
  if (rowDays.friday) { out.friday = rowDays.friday.date; out.friLabel = rowDays.friday.label }
  if (rowDays.saturday) { out.saturday = rowDays.saturday.date; out.satLabel = rowDays.saturday.label }
  return out
}


export function getWeekForDate(dateStr: string, weeks: WeekRow[]): WeekRow | null {
  for (const w of weeks) {
    if (dateStr === w.thursday || dateStr === w.friday || dateStr === w.saturday) return w
  }
  return null
}

/** analyse falsche Konflikte je Block (gleiche Logik wie im Mockup). */
export function computeConflicts(blocks: ContactBlock[], avail: InstructorAvailability[]): Map<string, Set<string>> {
  const conflicts = new Map<string, Set<string>>()
  const add = (blockId: string, reason: string) => {
    let set = conflicts.get(blockId)
    if (!set) conflicts.set(blockId, (set = new Set()))
    set.add(reason)
  }
  const availByInstr = new Map<string, Array<{ date: string; period: string }>>()
  for (const a of avail) availByInstr.set(a.instructor_id, a.unavailable_half_days ?? [])
  const externalByInstr = new Map<string, Array<{ date: string; period: string }>>()
  for (const a of avail) {
    for (const e of a.external_teaching ?? []) {
      const list = externalByInstr.get(a.instructor_id) ?? []
      list.push({ date: e.date, period: e.period })
      externalByInstr.set(a.instructor_id, list)
    }
  }
  const instrBooking = new Map<string, Map<string, string>>()
  const roomBooking = new Map<string, Map<string, string>>()

  for (const b of blocks) {
    for (const s of b.slots ?? []) {
      const k = `${s.date}_${s.period}`
      for (const iid of b.instructor_ids ?? []) {
        let bookings = instrBooking.get(iid)
        if (!bookings) {
          bookings = new Map()
          instrBooking.set(iid, bookings)
        }
        const prior = bookings.get(k)
        if (prior && prior !== b._id) {
          add(b._id, 'Dozierende doppelt gebucht')
          add(prior, 'Dozierende doppelt gebucht')
        } else if (prior !== b._id) {
          bookings.set(k, b._id)
        }
        if ((externalByInstr.get(iid) ?? []).some((u) => u.date === s.date && u.period === s.period)) {
          let set = conflicts.get(b._id)
          if (!set) conflicts.set(b._id, (set = new Set()))
          set.add('Dozierende unterrichtet in anderem Programm')
        } else if ((availByInstr.get(iid) ?? []).some((u) => u.date === s.date && u.period === s.period)) {
          let set = conflicts.get(b._id)
          if (!set) conflicts.set(b._id, (set = new Set()))
          set.add('Dozierende nicht verfügbar')
        }
      }
      if (b.room_id) {
        let rooms = roomBooking.get(b.room_id)
        if (!rooms) {
          rooms = new Map()
          roomBooking.set(b.room_id, rooms)
        }
        const prior = rooms.get(k)
        if (prior && prior !== b._id) {
          add(b._id, 'Raum doppelt gebucht')
          add(prior, 'Raum doppelt gebucht')
        } else if (prior !== b._id) {
          rooms.set(k, b._id)
        }
      }
    }
  }
  return conflicts
}

/** Kap. 8 — Slot-Level-Konflikte: Listenelement je Konflikt-FALL (mit Gegenpart & Raum), 
 * damit die Planungsansicht beim Klick nur den betroffenen Zeit-Slot anzeigt. */
export interface SlotConflict {
  blockId: string
  date: string
  period: string
  reasons: string[]
  /** Gegenpart-Blocks die denselben Raum/Dozzent-Zeit-Slot belegen */
  counterpartBlockIds: string[]
  room_id?: string
  instructor_id?: string
}

export function computeSlotConflicts(blocks: ContactBlock[], avail: InstructorAvailability[]): SlotConflict[] {
  const roomSlots = new Map<string, SlotGroupItem>()
  const instrSlots = new Map<string, SlotGroupItem>()
  const availByInstr = new Map<string, Array<{ date: string; period: string }>>()
  const externalByInstr = new Map<string, Array<{ date: string; period: string }>>()
  for (const a of avail) {
    availByInstr.set(a.instructor_id, a.unavailable_half_days ?? [])
    for (const e of a.external_teaching ?? []) {
      const list = externalByInstr.get(a.instructor_id) ?? []
      list.push({ date: e.date, period: e.period })
      externalByInstr.set(a.instructor_id, list)
    }
  }

  const out: SlotConflict[] = []
  for (const b of blocks) {
    for (const s of b.slots ?? []) {
      const key = `${s.date}_${s.period}`
      const counterpart: string[] = []
      const reasons: string[] = []

      if (b.room_id) {
        const rk = `room_${b.room_id}_${key}`
        const item = roomSlots.get(rk)
        if (item) {
          reasons.push('Raum doppelt gebucht')
          if (!item.counterpart.includes(b._id)) item.counterpart.push(b._id)
          if (!item.counterpart.includes(item.blockId)) item.counterpart.push(item.blockId)
          counterpart.push(item.blockId)
        } else {
          roomSlots.set(rk, { blockId: b._id, counterpart: [], room_id: b.room_id, date: s.date, period: s.period })
        }
      }
      for (const iid of b.instructor_ids ?? []) {
        const pik = `${iid}_${key}`
        const item = instrSlots.get(pik)
        if (item) {
          reasons.push('Dozierende doppelt gebucht')
          if (!item.counterpart.includes(b._id)) item.counterpart.push(b._id)
          if (!item.counterpart.includes(item.blockId)) item.counterpart.push(item.blockId)
          counterpart.push(item.blockId)
        } else {
          instrSlots.set(pik, { blockId: b._id, counterpart: [], instructor_id: iid, date: s.date, period: s.period })
        }
        if ((externalByInstr.get(iid) ?? []).some(u => u.date === s.date && u.period === s.period)) {
          reasons.push('Dozierende unterrichtet in anderem Programm')
        } else if ((availByInstr.get(iid) ?? []).some(u => u.date === s.date && u.period === s.period)) {
          reasons.push('Dozierende nicht verfügbar')
        }
      }
      if (reasons.length) {
        out.push({
          blockId: b._id,
          date: s.date,
          period: s.period,
          reasons: [...new Set(reasons)],
          counterpartBlockIds: [...new Set(counterpart)].filter(id => id !== b._id),
          room_id: b.room_id,
        })
      }
    }
  }
  // bestelgte Konflikte je Slot kombinieren (falls derselbe Slot mehrfach in out ist)
  const slotMap = new Map<string, SlotConflict>()
  for (const sc of out) {
    const key = `${sc.blockId}_${sc.date}_${sc.period}`
    const existing = slotMap.get(key)
    if (existing) {
      existing.reasons = [...new Set([...existing.reasons, ...sc.reasons])]
      existing.counterpartBlockIds = [...new Set([...existing.counterpartBlockIds, ...sc.counterpartBlockIds])]
    } else slotMap.set(key, { ...sc, counterpartBlockIds: [...sc.counterpartBlockIds] })
  }
  return [...slotMap.values()]
}

interface SlotGroupItem {
  blockId: string
  room_id?: string
  instructor_id?: string
  date: string
  period: string
  counterpart: string[]
}


export function usePlanning() {
  const loading = ref(false)
  const error = ref<string | null>(null)

  const programs = shallowRef<any[]>([])
  const semesters = shallowRef<Semester[]>([])
  const modules = shallowRef<PlanningModule[]>([])
  const blocks = shallowRef<ContactBlock[]>([])
  const instructors = shallowRef<Instructor[]>([])
  const rooms = shallowRef<any[]>([])
  const locations = shallowRef<any[]>([])
  const todos = shallowRef<Todo[]>([])
  const communications = shallowRef<any[]>([])
  const instructorAvailability = shallowRef<any[]>([])

  const programId = ref<string>('all')
  const semesterId = ref<string | null>(null)
  const moduleByIdMap = new Map<string, PlanningModule>()
  const programByIdMap = new Map<string, any>()

  function moduleById(id: string): PlanningModule | undefined { return moduleByIdMap.get(id) }
  function programById(id: string): any { return programByIdMap.get(id) }

  async function load(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const fetchJson = async (table: string): Promise<any[]> => {
        const res = await fetch(`/api/${table}`)
        return res.ok ? (await res.json()) : []
      }
      const [prog, sem, mod, block, instr, avail, room, loc, todoList, comm] = await Promise.all([
        fetchJson('programs'), fetchJson('semesters'), fetchJson('modules'),
        fetchJson('contact_blocks'), fetchJson('instructors'), fetchJson('instructor_availability'),
        fetchJson('rooms'), fetchJson('locations'), fetchJson('todos'), fetchJson('communications'),
      ])
      instructorAvailability.value = avail
      const defaults = loadAppDefaults()
      if (defaults.planning) {
        planningPrefs.value = {
          planningDays: defaults.planning.planningDays ?? [],
          startKW: (defaults.planning.startKW ?? 0) > 0 ? Number(defaults.planning.startKW) : null,
          endKW: (defaults.planning.endKW ?? 0) > 0 ? Number(defaults.planning.endKW) : null,
        }
      }
      programs.value = prog
      semesters.value = sem
      modules.value = mod
      blocks.value = block
      instructors.value = instr
      rooms.value = room
      locations.value = loc
      todos.value = todoList
      communications.value = comm

      moduleByIdMap.clear()
      for (const m of mod) moduleByIdMap.set(m._id, m)
      programByIdMap.clear()
      for (const p of prog) programByIdMap.set(p._id ?? p.id, p)

      // default: nächstes zukünftiges Semester (wie Mockup)
      if (!semesterId.value) {
        const today = new Date().toISOString().slice(0, 10)
        const sorted = [...sem].sort((a, b) => a.start_date.localeCompare(b.start_date))
        const upcoming = sorted.find((s) => s.start_date > today)
        semesterId.value = upcoming?._id ?? sorted[sorted.length - 1]?._id ?? null
      }
    } catch (e: any) {
      error.value = e.message || 'Planungsdaten konnten nicht geladen werden'
    } finally {
      loading.value = false
    }
  }

  const currentSemester = computed<Semester | undefined>(() =>
    semesters.value.find((s) => s._id === semesterId.value)
  )

  // Planungs-Voreinstellungen (Tage + KW-Range) — bei jedem load() frisch laden
  const planningPrefs = ref<PlanningDefaults>({ planningDays: [...DEFAULT_PLANNING_DAYS], startKW: null, endKW: null })
  const weeks = computed<WeekRow[]>(() =>
    buildWeeks(currentSemester.value, {
      planningDays: planningPrefs.value.planningDays,
      startKW: planningPrefs.value.startKW,
      endKW: planningPrefs.value.endKW,
    }),
  )

  const filteredModules = computed<PlanningModule[]>(() =>
    modules.value.filter((m) =>
      programId.value === 'all' || m.program_id === programId.value,
    ),
  )

  const filteredBlocks = computed<ContactBlock[]>(() => {
    const modIds = new Set(filteredModules.value.map((m) => m._id))
    return blocks.value.filter((b) => modIds.has(b.module_id))
  })

  const conflictsByBlock = computed(() =>
    computeConflicts(filteredBlocks.value, [])
  )

  const openTodoCount = computed(() => todos.value.filter((t) => t.status === 'open').length)

  function roomById(id: string): { name?: string; room_number?: string } | undefined {
    return rooms.value.find((r: any) => r._id === id || r.id === id)
  }

  /** Kap-Detail: Slot-Konflikte für die *fokussierte* Kalenderansicht */
  const slotConflicts = computed<SlotConflict[]>(() =>
    computeSlotConflicts(filteredBlocks.value, []),
  )

  return {
    loading, error,
    programs, semesters, modules, blocks, instructors, rooms, locations, todos, communications,
    instructorAvailability, planningPrefsRef: planningPrefs,
    programId, semesterId, currentSemester,
    weeks,
    filteredModules, filteredBlocks,
    conflictsByBlock, openTodoCount,
    load, moduleById, programById, roomById, slotConflicts,
  }
}
