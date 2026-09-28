/**
 * 9.4–9.6 — OutlookPublisher: bewusst getrennter Prozess vom Solver
 * (Stufenkapselung aus 3.1). Der TimetableSolver kennt Graph NICHT.
 *
 * Zuständigkeiten:
 *   - finaler Verfügbarkeitscheck: ERNEUTES getSchedule direkt vor der
 *     Veröffentlichung, da dozierende Personen zwischen Berechnung und
 *     Publikation neue Termine eintragen können (9.4)
 *   - Event-Erstellung in der zentralen Planungs-Mailbox — ausschliesslich
 *     nach manueller Freigabe (approved: true, 9.6)
 *   - Idempotenz: stabile transactionId je Unterrichtseinheit; existierende
 *     Graph-Event-IDs werden per PATCH aktualisiert statt ein zweites Event
 *     anzulegen. Das Mapping graphEventId/outlookTransactionId -> interne
 *     sessionId wird über den Rückgabewert an die Persistenz der
 *     ScheduledSessions zurückgegeben (9.5).
 */
import type { TimetableSolution } from '../solver/types.js'
import { SLOT_BOUNDARIES, slotStatusFromAvailabilityView, type SlotStatus } from './availability.js'
import type { OutlookGraphClient } from './graphClient.js'

export interface PublishEntry {
  sessionId: string
  moduleId: string
  moduleName: string
  dayId: string
  date: string
  slotTypes: string[]
  instructorIds: string[]
  roomId: string
}

export interface PublishedRef {
  transactionId: string
  graphEventId?: string
  sessionId: string
}

export interface AvailabilityFinding {
  instructorId: string
  date: string
  slot: string
  status: SlotStatus
}

export interface PublishReport {
  /** freigegebene Ereignisse (oder Update auf bestehendes Event) */
  published: Array<PublishedRef & { updated: boolean }>
  /** nicht veröffentlicht — harter Outlook-Konflikt (busy/oof) im Recheck */
  blocked: Array<{ entry: PublishEntry; reason: string }>
  /** Slot-Status aus dem finalen Recheck */
  checked: AvailabilityFinding[]
}

export interface PublishMapping {
  instructorEmailById: Map<string, string>
  roomEmailById: Map<string, string>
  /** Persistenz-Hook — JSONB ScheduledSession anreichern */
  onPublished?: (ref: PublishedRef, entry: PublishEntry) => void | Promise<void>
  /** bestehende Zuordnung transactionId -> graphEventId (Update statt Duplikat) */
  existingEventIds?: Map<string, string>
}

export interface PublishOptions {
  approved: boolean
  mapping: PublishMapping
}

function mergeSlotBoundaries(slotTypes: string[]): { start: string; end: string } {
  const wanted = slotTypes.filter((s) => s in SLOT_BOUNDARIES) as (keyof typeof SLOT_BOUNDARIES)[]
  if (wanted.length === 0) throw new Error('keine On-Campus-Slot-Typen vorhanden')
  let start = SLOT_BOUNDARIES[wanted[0]!].start
  let end = SLOT_BOUNDARIES[wanted[0]!].end
  for (const s of wanted) {
    const b = SLOT_BOUNDARIES[s]
    if (b.start < start) start = b.start
    if (b.end > end) end = b.end
  }
  return { start, end }
}

function toLocalIso(date: string, time: string): string {
  return `${date}T${time}:00`
}

export class OutlookPublisher {
  constructor(
    private readonly client: OutlookGraphClient,
    private readonly timeZone: string = 'Europe/Zurich',
  ) {}

  /**
   * 9.4 — getSchedule je On-Campus-Tag (availabilityView startet bei Mitternacht
   * lokale Zeit) und Übersetzung in Slot-Status via slotStatusFromAvailabilityView.
   */
  async checkAvailability(
    entries: PublishEntry[],
    instructorEmailById: Map<string, string>,
  ): Promise<{ checked: AvailabilityFinding[]; blocked: Array<{ entry: PublishEntry; reason: string }> }> {
    const checked: AvailabilityFinding[] = []
    const blocked: Array<{ entry: PublishEntry; reason: string }> = []

    const days = new Map<string, PublishEntry[]>()
    for (const e of entries) {
      const list = days.get(e.date) ?? []
      list.push(e)
      days.set(e.date, list)
    }

    for (const [date, dayEntries] of days) {
      const instructorIds = [...new Set(dayEntries.flatMap((e) => e.instructorIds))]
      const emailById = new Map(instructorIds.map((id) => [id, instructorEmailById.get(id) ?? id]))
      const idByMail = new Map([...emailById.entries()].map(([id, mail]) => [mail, id]))

      const res = await this.client.getSchedule({
        instructorMails: [...emailById.values()],
        startTime: { dateTime: toLocalIso(date, '00:00'), timeZone: this.timeZone },
        endTime: { dateTime: toLocalIso(date, '23:59'), timeZone: this.timeZone },
        availabilityViewInterval: 15,
      })

      const viewByInstructorId = new Map<string, string>()
      for (const sched of res.value ?? []) {
        const id = idByMail.get(sched.scheduleId)
        if (id) viewByInstructorId.set(id, sched.availabilityView)
      }

      const dayStart = new Date(`${date}T00:00:00`)
      for (const entry of dayEntries) {
        for (const slot of entry.slotTypes) {
          const slotKey = slot as keyof typeof SLOT_BOUNDARIES
          if (!(slotKey in SLOT_BOUNDARIES)) continue
          for (const instructorId of entry.instructorIds) {
            const view = viewByInstructorId.get(instructorId)
            const status: SlotStatus = view ? slotStatusFromAvailabilityView(view, dayStart, 15, slotKey) : 'unknown'
            checked.push({ instructorId, date, slot, status })
            if (status === 'blocked') {
              blocked.push({
                entry,
                reason: `${instructorId} ist am ${date} im Slot ${slot} busy/oof laut Outlook`,
              })
            }
          }
        }
      }
    }
    return { checked, blocked }
  }

  /** 9.4/9.5 — Recheck und (nur bei Freigabe) Event-Erstellung/Update. */
  async publish(solution: TimetableSolution, options: PublishOptions): Promise<PublishReport> {
    if (!options.approved) {
      throw new Error('Veröffentlichung nicht freigegeben — Termine werden erst nach manueller Freigabe versendet (9.6)')
    }

    const entries = this.toEntries(solution)
    const { checked, blocked } = await this.checkAvailability(entries, options.mapping.instructorEmailById)
    const blockedEntryKeys = new Set(blocked.map((b) => `${b.entry.sessionId}@${b.entry.date}`))

    const published: (PublishedRef & { updated: boolean })[] = []

    for (const entry of entries) {
      if (blockedEntryKeys.has(`${entry.sessionId}@${entry.date}`)) continue

      const { start, end } = mergeSlotBoundaries(entry.slotTypes)
      const transactionId = this.transactionIdFor(entry)
      const startTs = { dateTime: toLocalIso(entry.date, start), timeZone: this.timeZone }
      const endTs = { dateTime: toLocalIso(entry.date, end), timeZone: this.timeZone }

      const existingEventId = options.mapping.existingEventIds?.get(transactionId)
      let ref: PublishedRef & { updated: boolean }

      if (existingEventId) {
        // bestehendes Event aktualisieren statt ein neues anzulegen
        await this.client.updateEvent(existingEventId, { subject: entry.moduleName, start: startTs, end: endTs })
        ref = { transactionId, graphEventId: existingEventId, sessionId: entry.sessionId, updated: true }
      } else {
        const created = await this.client.createEvent({
          subject: `Modul: ${entry.moduleName}`,
          start: startTs,
          end: endTs,
          // Dozierende = required attendees, Räume = resource attendees (9.5)
          requiredAttendees: entry.instructorIds.map((id) => options.mapping.instructorEmailById.get(id) ?? id),
          roomResources: [options.mapping.roomEmailById.get(entry.roomId) ?? entry.roomId],
          transactionId,
        })
        ref = { transactionId, graphEventId: created?.id, sessionId: entry.sessionId, updated: false }
      }
      published.push(ref)
      await options.mapping.onPublished?.(ref, entry)
    }

    return { published, blocked, checked }
  }

  /** stabile transactionId je Unterrichtseinheit (9.5) */
  transactionIdFor(entry: PublishEntry): string {
    return `cw_${entry.sessionId}_${entry.dayId}`
  }

  toEntries(solution: TimetableSolution): PublishEntry[] {
    const entries: PublishEntry[] = []
    for (const sess of solution.schedule) {
      if (sess.slotTypes.length === 0) continue
      entries.push({
        sessionId: sess.sessionId,
        moduleId: sess.moduleId,
        moduleName: sess.moduleName,
        dayId: sess.day.id,
        date: sess.day.date,
        slotTypes: sess.slotTypes,
        instructorIds: sess.instructorIds ?? [],
        roomId: sess.room.id,
      })
    }
    return entries
  }
}
