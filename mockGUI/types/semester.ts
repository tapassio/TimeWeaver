export type SpecialDateType = 'holiday' | 'event' | 'exam_period' | 'other'

export interface SpecialDate {
  date: string // ISO 8601
  title: string
  type?: SpecialDateType
}

export interface Semester {
  _id?: string
  identifier: string // e.g. "HS2027"
  start_date: string // ISO 8601
  end_date: string // ISO 8601
  special_dates?: SpecialDate[]
}
