import type { AclInfo } from '@/types/curriculum'
import type { Weekday } from '@/types/room'

/**
 * One scheduled session in a calendar week. The four *Ids arrays are FK arrays;
 * empty = not yet assigned (mid-generation). All rooms/modules of one entry
 * share its weekday + time window.
 */
export interface ScheduleEntry extends AclInfo {
  id?: string
  _id?: string
  weekId: string
  moduleIds: string[]
  roomIds: string[]
  classIds: string[]
  lecturerIds: string[]
  weekday: Weekday
  startTime: string
  endTime: string
}

export type ScheduleEntryExport = ScheduleEntry[]