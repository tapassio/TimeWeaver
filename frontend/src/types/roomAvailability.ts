import type { AclInfo } from '@/types/curriculum'
import type { Weekday } from '@/types/room'

export interface RoomAvailability extends AclInfo {
  id?: string
  _id?: string
  roomId: string
  weekId?: string
  weekday: Weekday
  startTime: string
  endTime: string
}

export type RoomAvailabilityExport = RoomAvailability[]