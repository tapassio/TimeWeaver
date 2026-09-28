export interface Department {
  _id?: string
  name: string
  description?: string
}

export interface Program {
  _id?: string
  department_id: string
  title: string
  degree: string // e.g. "Master of Science" — see docs/data-model.md open questions
  description?: string
  version?: string
  forked_from_program_id?: string // set when this is a new curriculum version
  mission_statement?: string // top of the AACSB constructive-alignment chain
}
