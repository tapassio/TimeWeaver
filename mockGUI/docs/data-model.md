# CourseWeaver – data model (v4)

Aligned with the CourseWeaver project docs: terminology (Department /
Program / Degree / Module), the Location/Room export format, and the
functional requirements (role definitions, module relationships,
curriculum versioning, room planning, conflict detection).

TypeScript source of truth lives in `../types/` (im Produktiv-Projekt `src/types/`).
This file explains the structure and the reasoning; see the individual files for exact shapes.

## Hierarchy

```
Department → Program → Module → ContactBlock → Lesson
Location → Room
```

Renamed from the earlier draft to match the project's own terminology:
`Course` → `Module`, `Session` → `Lesson`. `ContactBlock` is new — it
represents one block-week booking (a set of half-day slots) for a
Module, matching the "block week" scheduling frequency mentioned in the
docs.

## Structures

| File (mockGUI) | File (Produktiv: `src/types/`) | Structure | Purpose |
|---|---|---|---|
| `../types/program.ts` | `src/types/program.ts` | Department | Academic unit (owns programs) |
| `../types/program.ts` | `src/types/program.ts` | Program | Master's program; `degree` is currently a plain string field — see open question below |
| `../types/module.ts` | `src/types/module.ts` | Module | A module/course within a program |
| `../types/module.ts` | `src/types/module.ts` | ModuleRelationship | prerequisite / corequisite / exclusion between two modules |
| `../types/lesson.ts` | `src/types/lesson.ts` | Lesson | A single teaching event within a ContactBlock |
| `../types/contact-block.ts` | `src/types/contact-block.ts` | ContactBlock | A block-week booking: half-day slots, room, instructors |
| `../types/scheduling.ts` | `src/types/scheduling.ts` | HalfDaySlot | `{ date, weekday, period }`, `weekday` limited to thursday/friday/saturday |
| `../types/instructor.ts` | `src/types/instructor.ts` | Instructor, InstructorAvailability | Teaching staff and their unavailable half-days |
| `../types/semester.ts` | `src/types/semester.ts` | Semester | Identifier, start/end, holidays, special dates |
| `../types/taxonomy.ts` | `src/types/taxonomy.ts` | Objective, Competency, Term, ProofOfCompetency, LearningMaterial | Curriculum taxonomy and assessments |
| `../types/location.ts` | `src/types/location.ts` | Location | Building/campus — from CourseWeaver docs, copied as-is |
| `../types/room.ts` | `src/types/room.ts` | Room | Full room spec (capacity, equipment, availability) — from CourseWeaver docs, copied as-is |

## Linking strategy

- **Hierarchical nesting** (`items: structureID`) – strict parent → child:
  - Department → Program → Module → ContactBlock → Lesson
  - Location → Room
  - Instructor → InstructorAvailability (1:1)

- **Loose referencing** (`items: "string"`) – flexible, many-to-many:
  - Lesson/Module Objective → Objective (program/module/lesson chain)
  - Lesson/Module → Competency
  - Lesson → Term (tagging)
  - Lesson → LearningMaterial
  - Module/Lesson → ProofOfCompetency
  - ContactBlock → Instructor (many-to-many)
  - ContactBlock → Room (many-to-many — a room hosts many blocks over a semester)
  - Module → ModuleRelationship → Module (self-referencing)
  - Module → Semester

## Room matching (new)

A Module carries `expected_students` and `required_room_features`
(plain strings, e.g. `"smartboard"`, `"video_conferencing"`). When
scheduling a ContactBlock, candidate rooms are filtered by matching
these against `Room.capacity.seats` and `Room.equipment` /
`Room.connectivity` — this is application logic, not a stored
relationship.

## Scheduling constraints (application logic, not stored fields)

- `HalfDaySlot.weekday` is restricted to `thursday | friday | saturday`
  at the type level (`ContactWeekday`)
- Instructor availability check: any slot in a `ContactBlock` matching an
  entry in the linked instructor's `unavailable_half_days` → conflict
- Instructor overlap check: same instructor linked to two ContactBlocks
  with an overlapping slot → conflict
- **Room overlap check (new)**: same room linked to two ContactBlocks
  with an overlapping slot → conflict
- **Module exclusion check (new)**: if `Module.scheduling_constraint
  .must_not_overlap_with_module_ids` includes another module, their
  ContactBlocks must not share a slot
- Implement as `checkScheduleConflicts()` in `dataClient.js`, run on
  create/edit of a ContactBlock — checks instructors, rooms, and module
  exclusions together

## Constructive alignment & Assurance of Learning (AACSB)

Two distinct questions, not to be conflated:

- **Constructive alignment**: does what's taught, practiced, and assessed
  actually match the intended competency?
- **I-R-M**: at what developmental stage is the competency built over the
  curriculum?

The full chain, now traceable through the model:

```
Program.mission_statement
  → Competency (+ rationale)          "Program Competency Goal"
    → Objective                        "Operational Learning Objective"
      → ObjectiveMapping (+ learning_activity, stage)
        → ProofOfCompetency (+ rubric_id, is_aol_measurement_point)
          → Rubric → RubricCriterion (+ target_level, objective_id)
            → AssessmentResult → RubricCriterionResult
              → ImprovementAction ("Closing the Loop")
```

Key rules this encodes:

- A module grade is **not** AoL evidence by itself — results must be captured
  per `RubricCriterion`, not per module
- Not every competency needs measuring in every module/semester/student —
  `is_aol_measurement_point` + `sampling_note` mark the designated,
  representative measurement points instead
- "Closing the loop" is now a real link: `ImprovementAction.based_on_result_id`
  points at the `AssessmentResult` that triggered it, and
  `follow_up_result_id` points at the re-measurement once it exists

## Structures (Assurance of Learning)

| File (mockGUI) | File (Produktiv) | Structure | Purpose |
|---|---|---|---|
| `../types/taxonomy.ts` | `src/types/taxonomy.ts` | Rubric, RubricCriterion | Named criteria with a target level, each optionally tied to one Objective |
| `../types/assurance-of-learning.ts` | `src/types/assurance-of-learning.ts` | AssessmentResult, RubricCriterionResult | Measured results per criterion, per semester |
| `../types/assurance-of-learning.ts` | `src/types/assurance-of-learning.ts` | ImprovementAction | The curricular change made in response, and its follow-up measurement |



- **Degree as its own structure?** Currently `Program.degree` is a plain
  string. If multiple programs need to share exact degree metadata
  (ECTS totals, accreditation body), this should become its own Term
  or dedicated structure instead.
- **Roles/permissions**: "who can create/edit taxonomy vs. map to it vs.
  view" is a real requirement but not a data structure — needs a
  `Role`/permission model, out of scope for this draft.
- **Curriculum versioning depth**: `Program.version` and
  `forked_from_program_id` are placeholders. The docs describe a full
  fork of the taxonomy/module mapping on each new version — deciding
  exactly what gets copied vs. referenced needs a separate design pass.
- **Notifications**: "notify affected personnel on changes" is a
  workflow/feature, not a stored structure.
- **Gap/duplication analysis** (Curriculum Analysis in the docs): a
  reporting feature over the Objective/Competency mapping, not a new
  structure.

## Next steps

- Confirm the exact DocPouch structure-creation API against a known
  working example (`create-swot-document.mjs`)
- Register a CourseWeaver-specific OIDC client (EduID, per the docs,
  or BFH OIDC — architecture already supports swapping the provider)
- Define the `Lesson.type` vocabulary (case_study, workshop, guest
  lecture, lecture, exam)
- Build `checkScheduleConflicts()` covering instructors, rooms, and
  module exclusions
