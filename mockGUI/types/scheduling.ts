import type { Weekday } from './room'

// Contact-study modules are only ever scheduled on these three weekdays,
// in half-day units (see CourseWeaver docs: "3 or 4 days of Kontaktstudium,
// always Thursday/Friday/Saturday").
export type ContactWeekday = Extract<Weekday, 'thursday' | 'friday' | 'saturday'>

export type Period = 'morning' | 'afternoon' | 'evening' // evening = 16–18 Uhr, nur Do/Fr, 0.25 Tage für 3-ECTS-Module

export interface HalfDaySlot {
  date: string // ISO 8601, e.g. "2027-11-04"
  weekday: ContactWeekday
  period: Period
}
