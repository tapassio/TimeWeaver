export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

export const WEEKDAY_OPTIONS: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

export interface LecturerAvailability {
  _id?: string
  id?: string
  lecturerId: string
  weekId?: string
  weekday: Weekday
  startTime: string
  endTime: string
  created_at?: string
  updated_at?: string
}

export type ConstraintCategory = 'hard' | 'soft'

export interface SchedulingRule {
  _id?: string
  id?: string
  ruleType: string
  category: ConstraintCategory
  weight: number
  enabled: boolean
  description?: string
  params?: Record<string, unknown>
  appliesTo?: string[]
  semesterId?: string
  created_at?: string
  updated_at?: string
}