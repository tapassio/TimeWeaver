export type DeliveryStatus = 'planned' | 'confirmed' | 'completed'

export type ScheduleFrequency = 'block_week' | 'weekly' | 'biweekly' | 'monthly'

export interface SchedulingConstraint {
  frequency?: ScheduleFrequency
  allowed_time_frame?: { start: string; end: string } // ISO dates, within the semester
  required_instructor_ids?: string[]
  must_not_overlap_with_module_ids?: string[]
}

export interface Module {
  _id?: string
  program_id: string
  title: string
  credits: number
  description?: string
  year: number
  semester_id: string
  last_revised: string // ISO 8601
  delivery_status: DeliveryStatus
  expected_students?: number
  required_room_features?: string[] // matched against Room.equipment / Room.capacity
  scheduling_constraint?: SchedulingConstraint
}

export type ModuleExport = Module[]

export type ModuleRelationType = 'prerequisite' | 'corequisite' | 'exclusion'

// "Module B requires Module A first" / "must be taken alongside" /
// "must not be scheduled at the same time"
export interface ModuleRelationship {
  _id?: string
  module_id: string
  related_module_id: string
  relation_type: ModuleRelationType
}
