export type ObjectiveLevel = 'program' | 'module' | 'lesson'

export interface Objective {
  _id?: string
  text: string
  level: ObjectiveLevel
}

// Direct outcome-to-outcome prerequisite links (Willcox et al. 2015: coherence
// comes from a prerequisite graph between individual outcomes, not from a fixed
// number of module stages). Prerequisites are transitive at query time — if A
// requires B and B requires C, A→C is not stored separately.
export type ObjectiveRelationType = 'prerequisite'

export interface ObjectiveRelationship {
  _id?: string
  objective_id: string
  related_objective_id: string
  relation_type: ObjectiveRelationType
}

// Optional I-R-M stage. Not every objective needs all three — a stage is only
// recorded where it is actually taught, never assumed or auto-filled.
export type ObjectiveStage = 'introduce' | 'reinforce' | 'master'

// Where and how an objective is taught. One objective can have several of
// these across different modules/lessons.
export interface ObjectiveMapping {
  _id?: string
  objective_id: string
  module_id: string
  lesson_id?: string
  stage?: ObjectiveStage
  // The concrete exercise/activity through which the objective is practiced
  // here — constructive alignment needs this, not just the stage label.
  learning_activity?: string
  assessment_ids?: string[] // ProofOfCompetency items that assess THIS objective HERE
}

export interface Competency {
  _id?: string
  title: string
  description?: string
  // AACSB "Program Competency Goal": why this competency matters for the
  // program's mission — the top of the constructive-alignment chain.
  rationale?: string
}

export interface Term {
  _id?: string
  title: string
  category?: string
}

export type ProofOfCompetencyType = 'exam' | 'assignment' | 'presentation' | 'project' | 'other'

// A module grade is not AoL evidence by itself — AACSB expects results at
// the level of individual rubric criteria, each tied to a specific objective.
export interface RubricCriterion {
  _id?: string
  name: string // e.g. "Evidenzqualität"
  description?: string
  objective_id?: string // which objective this specific criterion measures
  target_level?: string // e.g. "meets expectations" — free text, program-defined scale
}

export interface Rubric {
  _id?: string
  title: string
  criteria: RubricCriterion[]
}

export interface ProofOfCompetency {
  _id?: string
  title: string
  type?: ProofOfCompetencyType
  description?: string
  // Which objectives this item actually, observably assesses. A module exam
  // is not automatically a proof for every objective taught in that module —
  // this link must be set explicitly, per task/question/rubric item.
  assessed_objective_ids?: string[]
  rubric_id?: string // optional — for AACSB-grade assessments with per-criterion breakdown
  // AACSB does not require measuring every competency in every module, every
  // semester, or for every student — representative sampling is fine. This
  // flag marks the item as a designated AoL measurement point rather than an
  // ordinary graded assessment.
  is_aol_measurement_point?: boolean
  sampling_note?: string // e.g. "representative sample, not all students"
}

export interface LearningMaterial {
  _id?: string
  title: string
  url: string
}
