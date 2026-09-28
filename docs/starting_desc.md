# CourseWeaver

## App Profile
- Webtool via server-based DB
- Stack:
    - NodeJS
    - PostgreSQL (with JSONB document storage)
    - Vuetify
- User auth via OIDC (e.g. EduID, docPouch, Keycloak)

## Purpose
### Role Definition
- Who can create/edit taxonomy vs. just map to it vs. only view?
- Is access structured by program, module, or lesson?
- Who can change availability times? When?

### Module Relationship Definition
- What are the interrelation between modules? (e.g., "Module B requires Module A completed first", "Module A must be taken alongside Module B", or "Module A must not be taught at the same time as Module B").

### Curriculum Mapping
- Import / Create documentation about study programs, degrees, modules,  and lessons
- Add details per module: teaching hours, credit points, contact vs. self-study time, etc.
- Import / Create documentation about teaching personnel and their availability
- Create a standard taxonomy to measure against
    - student competencies
    - learning objectives
    - proofs of competency
- Enter semester information (identifier, start/end, holidays, special dates)
- Allows for mapping taxonomy items to lessons
- Allow for mapping proofs of competency to the lessons/modules that deliver them

### Curriculum Analysis
- gap/duplication analysis

### Curriculum Versioning
- Curricula can have different version. That way students can remain in their curriculum while new students enter a new one, after changes within the curriculum.
- A new curriculum version forks the whole taxonomy/module mapping
-
### Schedule Creation
- Each module can have its own constraints, e.g.:
    - must be a block week / weekly / biweekly / monthly lessons
    - must not / must only be scheduled within these time frames
    - must be taught by a lecturer from the list
    - must (not) start/end before/after

### Room Planning
- Rooms can be defined with their size and room features
- Modules can be equipped with an expected number of students and a list of needed room features to find a fitting room

### Conflict Detection
- Double-booking of lecturers or rooms are detected and solutions are proposed.

### Export/reporting
- Reports/Exports needed for accreditation / internal reports

## Notifications
- Notify affected personnel in case of changes (??)

---

# Using existing solutions


[Ilios](https://github.com/ilios) is at its core a **curriculum-mapping system for health professions**, but its data model is generic enough to be reused for a Master's program. Here's a short overview:

## Core functionality of Ilios

- **Hierarchy**: Programs (e.g. "MD Program") → Courses → Sessions (individual teaching events)
- **Objectives mapping**: Program objectives → Competencies → Course objectives → Session objectives (all linkable, multi-level)
- **Vocabularies/Terms**: Freely definable tags for classifying content
- **Sequence Blocks**: Timing/ordering of courses and sessions within the program
- **Cohorts/Learner Groups**: Student groups by cohort year
- **Instructors & Learning Materials**: Assignment of teaching staff and materials to sessions
- **Calendar/Events**: Published schedule for students
- **REST API**: For integration with other systems (e.g. Moodle, Canvas)
- **Curriculum Inventory Report**: Export in the Medbiquitous/AAMC standard for accreditation

## Directly reusable for a business-school tool

| Feature | Adaptation needed? |
|---|---|
| Program → Course → Session structure | No — maps 1:1 to Master's → Modules → Classes |
| Objectives hierarchy (program/course/session) | No — generic, usable as-is |
| Vocabularies/Terms | No, just populate with your own tags (e.g. "Finance", "Strategy", "Leadership") |
| Cohorts/Learner Groups | No |
| Instructors, learning materials | No |
| Calendar/Events | No |
| REST API | No — reusable |

## Needs adaptation

- **Competency framework**: Ilios uses medical competency domains (e.g. ACGME) → you need your own framework, e.g. AACSB Learning Goals or a custom skill matrix for your Master's programs
- **Session types**: Default values like "Clinical", "Lab" → replace with "Case Study", "Workshop", "Guest Lecture", etc.
- **UI theming**: Ilios has a documented theming mechanism, but branding/language needs to be adapted for your school

## Needs to be built entirely from scratch

- **Curriculum Inventory Report**: Tightly bound to the Medbiquitous standard for health professions — irrelevant for a business school; would need to be replaced by your own export (only if needed at all, e.g. for AACSB/EQUIS accreditation)
- **Clinical-specific parts**: Rotations, clinical sites, preceptors — remove entirely, no equivalent needed
- **Cross-program skill-coverage dashboards**: If you want to see where a competency is covered across multiple Master's programs, you'd need to build your own reporting/views for that

