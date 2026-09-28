/**
 * 9 — Outlook-Anbindung (nur serverseitig über Microsoft Graph):
 *   POST /api/outlook/availability  — Frei/Belegt je DozierendemMailbox für einen On-Campus-Tag
 *   POST /api/outlook/publish       — geplante Termine als Events anlegen (NUR nach Freigabe)
 *
 * Konfiguration via .env: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
 * (Produktiv: Zertifikat oder Managed Identity + RBAC for Applications).
 */
import { Router, Request, Response } from 'express'
import { OutlookGraphClient } from '../outlook/graphClient.js'
import { OutlookPublisher, type PublishEntry } from '../outlook/outlookPublisher.js'
import { slotStatusFromAvailabilityView, toRestrictions } from '../outlook/availability.js'
import type { OnCampusDay, SlotType } from '../solver/domain.js'

export const outlookRouter = Router()

function getClient(): OutlookGraphClient {
  const planningMailbox = process.env.OUTLOOK_PLANNING_MAILBOX
  if (!planningMailbox) throw new Error('OUTLOOK_PLANNING_MAILBOX fehlt (zentrale Planungs-Mailbox)')
  return new OutlookGraphClient({
    planningMailbox,
    tenantId: process.env.AZURE_TENANT_ID,
    clientId: process.env.AZURE_CLIENT_ID,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
  })
}

const publisher = () => new OutlookPublisher(getClient())

/** POST /api/outlook/availability
 * Body: { instructorMails: string[], date: string (YYYY-MM-DD), slots?: SlotType[] }
 * -> Slot-Status + Restriction-Entwurf je Instructor/Slot (9.2/9.3)
 */
outlookRouter.post('/availability', async (req: Request, res: Response) => {
  try {
    const { instructorMails, date, slots } = req.body as {
      instructorMails?: string[]
      date?: string
      slots?: SlotType[]
    }
    if (!instructorMails?.length || !date) {
      res.status(400).json({ error: 'instructorMails und date erforderlich' })
      return
    }
    const slotList: SlotType[] = slots ?? ['vormittag', 'nachmittag', 'abend']

    const day: OnCampusDay = { id: date, date, week: 0, weekday: 'Donnerstag', phase: 'main' } // weekday hier nicht massgebend
    const client = getClient()
    const res2 = await client.getSchedule({
      instructorMails,
      startTime: { dateTime: `${date}T00:00:00`, timeZone: 'Europe/Zurich' },
      endTime: { dateTime: `${date}T23:59:00`, timeZone: 'Europe/Zurich' },
      availabilityViewInterval: 15,
    })

    const dayStart = new Date(`${date}T00:00:00`)
    const instructorSchedules = res2.value?.map((sched) => {
      const statuses = slotList.map((slot) => ({
        slot,
        status: slotStatusFromAvailabilityView(sched.availabilityView, dayStart, 15, slot),
      }))
      const restrictions = statusRestrictions(sched.scheduleId, day, statuses)
      return { scheduleId: sched.scheduleId, statuses, restrictions }
    })

    res.json({ date, instructorSchedules })
  } catch (err: any) {
    console.error('[outlook/availability] error', err)
    res.status(500).json({ error: err.message || 'Verfügbarkeitsprüfung fehlgeschlagen' })
  }
})

/**
 * Übersetzt die Slot-Status eines Instructors (scheduleId = Mail) direkt in die
 * Restriction-Objekte aus 9.3 — gleiche IDs wie im Constraint-Katalog (3.3).
 */
function statusRestrictions(
  scheduleId: string,
  day: OnCampusDay,
  statuses: Array<{ slot: SlotType; status: ReturnType<typeof slotStatusFromAvailabilityView> }>,
) {
  const out = [] as ReturnType<typeof toRestrictions>
  for (const { slot, status } of statuses) {
    out.push(...toRestrictions(scheduleId, day, slot, status))
  }
  return out
}

/** POST /api/outlook/publish
 * Body: { solution: TimetableSolution, approved: boolean,
 *         instructorEmailById: Record<string,string>, roomEmailById: Record<string,string>,
 *         existingEventIds?: Record<string,string> }
 * Erst ERNEUTES getSchedule (Recheck, 9.4), danach — nur bei approved:true — Event-Erstellung (9.5).
 */
outlookRouter.post('/publish', async (req: Request, res: Response) => {
  try {
    const { solution, approved, instructorEmailById, roomEmailById, existingEventIds } = req.body as {
      solution?: Parameters<OutlookPublisher['publish']>[0]
      approved?: boolean
      instructorEmailById?: Record<string, string>
      roomEmailById?: Record<string, string>
      existingEventIds?: Record<string, string>
    }
    if (!solution) {
      res.status(400).json({ error: 'solution erforderlich' })
      return
    }
    const report = await publisher().publish(solution, {
      approved: approved === true,
      mapping: {
        instructorEmailById: new Map(Object.entries(instructorEmailById ?? {})),
        roomEmailById: new Map(Object.entries(roomEmailById ?? {})),
        existingEventIds: new Map(Object.entries(existingEventIds ?? {})),
      },
    })
    res.json(report)
  } catch (err: any) {
    console.error('[outlook/publish] error', err)
    res.status(403).json({ error: err.message || 'Veröffentlichung fehlgeschlagen' })
  }
})
