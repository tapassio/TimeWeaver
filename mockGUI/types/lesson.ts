export interface Lesson {
  _id?: string
  contact_block_id: string
  title: string
  type: string // e.g. "case_study", "workshop", "guest_lecture", "lecture", "exam"
  date: string // ISO 8601
  start_time: string // HH:mm
  end_time: string // HH:mm
}
