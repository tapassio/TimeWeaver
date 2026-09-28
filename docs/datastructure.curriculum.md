# Department
A department is an academic unit organized around a particular subject or discipline. Departments commonly manage programs, teach modules, conduct research, and support academic administration.
- id
- name
- description
- contact
- URL

# Program
A program is a structured course of study designed to develop knowledge and skills in a particular academic or professional area. It defines the subjects students must complete, the learning outcomes they must achieve, and the requirements for graduation. Programs may lead to different degrees or include specializations, concentrations, or pathways.
- id
- name
- description
- departmentIDs (array)
- activeCurriculumVersionId (the currently active curriculum version)
- contact
- URL

# Degree
A degree is an academic qualification awarded to a student who successfully completes the requirements of a program. Examples include a Bachelor's degree in Business Administration, a Master's degree in Psychology, or a Doctoral degree in Physics.
- id
- name
- description
- programIDs (array)
- contact
- URL

# Curriculum Version
A curriculum version captures a snapshot of a program's curriculum so existing student cohorts continue under their admitted version.
- id
- name
- description
- versionNumber
- programId
- createdAt

# Module
A module is an individual unit of study within a program, focused on a particular topic or set of learning outcomes. It usually includes teaching activities, readings, assignments, examinations, and a specified number of academic credits. Programs typically combine compulsory modules with optional or elective modules.
- id
- name
- code
- description
- degreeIDs (array)
- curriculumVersionId
- competencyIds (array)
- proofOfCompetencyIds (array)
- creditPoints
- contactHours (self-study hours are derived: ≈ 30 × creditPoints − contactHours)
- contact
- URL

# Class
A class is a student group or cohort that takes modules and pursues a degree.
- id
- name
- code
- description
- semesterId (intake semester; the curriculum version determines the program)
- curriculumVersionId
- degreeId (must be offered by the program of the curriculum version)
- moduleIDs (array)
- size (expected class size)
- contact
- URL

# Lesson
- id
- moduleId
- name
- description
- taxonomyItemIds (array)
- proofOfCompetencyIds (array)

# Semester
A semester is a scheduling period with a name, code, and start/end dates.
- id
- name
- code
- startDate
- endDate

# Week
A week is a numbered calendar week within a semester that hosts availability slots and schedule entries.
- id
- semesterId
- semesterWeek
- startDate
- endDate
- daysOff (array of dates)

# Schedule Entry
A schedule entry is one scheduled session within a calendar week. All rooms/modules of one entry share its weekday and time window; empty ID arrays mean not yet assigned (mid-generation).
- id
- weekId
- moduleIds (array)
- roomIds (array)
- classIds (array)
- lecturerIds (array)
- weekday
- startTime
- endTime

# Room Availability
- id
- roomId
- weekId
- weekday
- startTime
- endTime

# Lecturer Availability
- id
- lecturerId
- weekId
- weekday
- startTime
- endTime

# Scheduling Rule
- id
- ruleType (external constraint catalog ID)
- category (hard | soft)
- weight
- enabled
- description
- semesterId
- params (JSON)
- appliesTo (array of entity IDs)