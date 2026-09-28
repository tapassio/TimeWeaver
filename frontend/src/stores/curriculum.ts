import { defineStore } from 'pinia'
import { ref } from 'vue'
import { usePostgres, EntityTables } from '@/composables/usePostgres'
import type { Room } from '@/types/room'
import type { Location } from '@/types/location'
import type { LecturerAvailability, SchedulingRule } from '@/types/schedule'
import type { RoomAvailability } from '@/types/roomAvailability'
import type { Week } from '@/types/week'
import type { ScheduleEntry } from '@/types/scheduleEntry'

export type { LecturerAvailability, SchedulingRule }

export interface CurriculumVersion {
  _id?: string
  id?: string
  name: string
  description?: string
  versionNumber: number
  /** @deprecated Use versionNumber instead */
  version?: number
  programId?: string
  createdAt?: string
}

export interface Semester {
  _id?: string
  id?: string
  name?: string
  code?: string
  startDate: string
  endDate: string
}

export interface Lesson {
  _id?: string
  id?: string
  moduleId: string
  name: string
  description?: string
}

export interface Lecturer {
  _id?: string
  id?: string
  name: string
  userId?: string
  departmentId?: string
  moduleIds?: string[]
}

export interface Module {
  _id?: string
  id?: string
  code?: string
  name: string
  program?: string
  semester?: number
  ects?: number
  expectedStudents?: number
  instructors?: string[]
  onCampusDays?: number
  description?: string
  contactHours?: number
  creditPoints?: number
  selfStudyHours?: number
  degreeIds?: string[]
  studyProgramIds?: string[]
}

export const useCurriculumStore = defineStore('curriculum', () => {
  const { fetchEntities } = usePostgres()

  const curriculumVersions = ref<CurriculumVersion[]>([])
  const semesters = ref<Semester[]>([])
  const lessons = ref<Lesson[]>([])
  const modules = ref<Module[]>([])
  const rooms = ref<Room[]>([])
  const locations = ref<Location[]>([])
  const lecturers = ref<Lecturer[]>([])
  const lecturerAvailabilities = ref<LecturerAvailability[]>([])
  const schedulingRules = ref<SchedulingRule[]>([])
  const roomAvailabilities = ref<RoomAvailability[]>([])
  const weeks = ref<Week[]>([])
  const scheduleEntries = ref<ScheduleEntry[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchCurriculumVersions() {
    loading.value = true
    error.value = null
    try {
      curriculumVersions.value = await fetchEntities<CurriculumVersion>(EntityTables.CURRICULUM_VERSION)
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function fetchModules() {
    loading.value = true
    error.value = null
    try {
      modules.value = await fetchEntities<Module>(EntityTables.MODULE)
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function fetchSemesters() {
    loading.value = true
    error.value = null
    try {
      semesters.value = await fetchEntities<Semester>(EntityTables.SEMESTER)
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function fetchLessons() {
    loading.value = true
    error.value = null
    try {
      lessons.value = await fetchEntities<Lesson>(EntityTables.LESSON)
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function fetchRooms() {
    loading.value = true
    error.value = null
    try {
      rooms.value = await fetchEntities<Room>(EntityTables.ROOM)
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function fetchLocations() {
    loading.value = true
    error.value = null
    try {
      locations.value = await fetchEntities<Location>(EntityTables.LOCATION)
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function fetchLecturers() {
    loading.value = true
    error.value = null
    try {
      lecturers.value = await fetchEntities<Lecturer>(EntityTables.LECTURER)
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function fetchLecturerAvailabilities() {
    loading.value = true
    error.value = null
    try {
      lecturerAvailabilities.value = await fetchEntities<LecturerAvailability>(EntityTables.LECTURER_AVAILABILITY)
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function fetchSchedulingRules() {
    loading.value = true
    error.value = null
    try {
      schedulingRules.value = await fetchEntities<SchedulingRule>(EntityTables.SCHEDULING_RULE)
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function fetchRoomAvailabilities() {
    loading.value = true
    error.value = null
    try {
      roomAvailabilities.value = await fetchEntities<RoomAvailability>(EntityTables.ROOM_AVAILABILITY)
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function fetchWeeks() {
    loading.value = true
    error.value = null
    try {
      weeks.value = await fetchEntities<Week>(EntityTables.WEEK)
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function fetchScheduleEntries() {
    loading.value = true
    error.value = null
    try {
      scheduleEntries.value = await fetchEntities<ScheduleEntry>(EntityTables.SCHEDULE_ENTRY)
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  return {
    curriculumVersions,
    modules,
    semesters,
    lessons,
    rooms,
    locations,
    lecturers,
    lecturerAvailabilities,
    schedulingRules,
    roomAvailabilities,
    weeks,
    scheduleEntries,
    loading,
    error,
    fetchCurriculumVersions,
    fetchModules,
    fetchSemesters,
    fetchLessons,
    fetchRooms,
    fetchLocations,
    fetchLecturers,
    fetchLecturerAvailabilities,
    fetchSchedulingRules,
    fetchRoomAvailabilities,
    fetchWeeks,
    fetchScheduleEntries,
  }
})
