# Rules

Rules are stored as `SchedulingRule` entities per semester. Each rule references a constraint from the external constraint catalog by its stable `ruleType` ID and scopes to entity IDs via `appliesTo`.

## Structural Rules (not shown since unchangable)
Resource-conflict and feasibility rules that are true regardless of the specific school:

- No double-booking (teacher, room, class/student-group at the same time slot)
- Room capacity ≥ class size
- Room has required equipment/type (lab, gym)
- Teacher/room/class availability windows
- etc.

## Curriculum/coverage constraints
The timetable must be complete, not just conflict-free:

- Each module/subject must be scheduled exactly N times per week for each class taking the module
- Total teaching hours per teacher and day must fall within legal limits
- etc.

## Domain-specific/institutional
Arbitrary policy rules imposed by the institution, not derivable from physics:

- "Module A must not be on the same day as Module B"
- "Module X must occur before Module Y" (precedence/prerequisite ordering)
- "Class 7A and 7B must have PE at the same time" (co-scheduling/parallel constraints)
- "No single-period lectures in the last period on Fridays"
- etc.

## Specific preferences
- Preferred room/time for a module
- Max consecutive lessons, minimize gaps ("holes") in a teacher's/class's day
- etc.

## Balance objectives
- Balance "bad slots" (early morning, late Friday) evenly among teachers
- Balance workload/room usage evenly across the week


# Presets
## Layer 1 — Presets/wizard (universal, on by default)

These are rules almost every university needs regardless of faculty/department, so they belong in the initial setup wizard as toggles, pre-checked:

### Hard/structural

- No teacher/instructor double-booked across two courses at the same time
- No room double-booked
- Room capacity ≥ enrolled/expected student count
- Room type matches course need (lecture hall vs. seminar room vs. lab vs. computer lab)
- No student cohort double-booked (same-semester, same-program courses can't overlap)
- Instructor unavailability windows respected (e.g., part-time/adjunct, admin days)

### Coverage

- Each course scheduled for its required weekly contact hours (e.g., 2×90min lecture + 1×90min tutorial)
- Warnings are generated if mo

### Common preferences (bundled as one toggle, e.g. "Reasonable schedule")

- No gaps longer than X hours in a student cohort's daily timetable
- No more than N consecutive teaching hours for an instructor without a break
- Avoid back-to-back sessions in rooms on opposite sides of campus (travel-time buffer)
- Avoid last-slot-of-the-day / first-slot-of-the-day for lectures

## Layer 2 — "My rules" list (deliberately added, institution/program-specific)

These are the ones that vary by faculty, program structure, or this semester's policy — a user adds/edits them individually because they don't generalize across the whole university:

### Institutional/specific

- Cross-listed courses (e.g., a course counted for both CS and Data Science) must share the same time slot
- Core/mandatory courses within the same program and year must not overlap (so students can take all of them)
- Prerequisite chains: Course A must be scheduled in an earlier time slot/semester than Course B in the same track
- Elective courses within a track should be spread across different time slots (so students have real choice, not forced conflicts)
- Specific courses must not coincide with faculty meeting blocks / committee time
- PhD/thesis defense slots must not overlap with the supervisor's teaching obligations
- Joint-degree or dual-enrollment students' courses across two departments must not conflict
- Language/exchange program courses fixed to specific slots due to partner-institution timing

### Preferences (institution- or department-specific tuning)

- Module X should preferably be held in Room Y (has specialized equipment)
- Distribute a large lecture course's multiple sections evenly across the week rather than clustering
- Minimize the number of different rooms a given cohort visits per day
- Balance "unpopular slots" (Friday afternoon, early Monday) evenly across faculty rather than always assigning them to junior/adjunct staff
- Research-active faculty get one protected day/half-day per week with no teaching