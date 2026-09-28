// AACSB "Assurance of Learning": measured results per rubric criterion,
// plus the curricular changes made in response ("Closing the Loop").

export interface RubricCriterionResult {
  criterion_id: string
  performance_summary: string // e.g. "78% meets or exceeds target"
  meets_target: boolean
}

export interface AssessmentResult {
  _id?: string
  proof_of_competency_id: string
  semester_id: string
  criterion_results: RubricCriterionResult[]
  notes?: string
}

// A curricular change made because of an AssessmentResult, and — once
// available — the re-measurement that shows whether it worked.
export interface ImprovementAction {
  _id?: string
  competency_id: string
  based_on_result_id: string
  description: string
  date: string // ISO 8601
  follow_up_result_id?: string
}
