import type { HalfDaySlot, ContactWeekday } from './scheduling'

export interface Instructor {
  _id?: string
  name: string
  email: string
  department_id?: string
}

export type InstructorExport = Instructor[]

export interface InstructorAvailability {
  _id?: string
  instructor_id: string
  unavailable_half_days: HalfDaySlot[]
  preferred_weekdays?: ContactWeekday[]
  max_days_per_block?: number
}
