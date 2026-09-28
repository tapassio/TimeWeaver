import type { AclInfo } from '@/types/curriculum'

export interface Week extends AclInfo {
  id?: string
  _id?: string
  semesterId: string
  semesterWeek: number
  startDate: string
  endDate: string
  /** Array of ISO dates (YYYY-MM-DD) that fall outside the regular timetable */
  daysOff?: string[]
}

export type WeekExport = Week[]