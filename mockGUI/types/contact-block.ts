import type { HalfDaySlot } from './scheduling'

export type ContactBlockStatus = 'planned' | 'confirmed'

export interface ContactBlock {
  _id?: string
  module_id: string
  title?: string
  slots: HalfDaySlot[]
  room_id?: string
  instructor_ids: string[]
  status: ContactBlockStatus
}
