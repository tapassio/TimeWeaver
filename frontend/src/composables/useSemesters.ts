import { ref } from 'vue'
import { usePostgres, EntityTables } from '@/composables/usePostgres'
import type { Semester } from '@/stores/curriculum'

export const emptySemester: Semester = {
  name: '',
  startDate: '',
  endDate: '',
}

export function useSemesters() {
  const { fetchEntities, createEntity, updateEntity: updateDbEntity, removeEntity: removeDbEntity } = usePostgres()
  const semesters = ref<Semester[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

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

  async function addSemester(semester: Semester) {
    error.value = null
    try {
      await createEntity<Semester>(EntityTables.SEMESTER, semester)
      semesters.value = await fetchEntities<Semester>(EntityTables.SEMESTER)
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  async function updateSemester(semester: Semester) {
    const id = semester._id || semester.id
    if (!id) return
    error.value = null
    try {
      await updateDbEntity(EntityTables.SEMESTER, id, semester)
      const idx = semesters.value.findIndex(s => (s._id || s.id) === id)
      if (idx !== -1) semesters.value[idx] = semester
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  async function removeSemester(id: string) {
    error.value = null
    try {
      await removeDbEntity(EntityTables.SEMESTER, id)
      semesters.value = semesters.value.filter(s => (s._id || s.id) !== id)
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  return {
    semesters,
    loading,
    error,
    fetchSemesters,
    addSemester,
    updateSemester,
    removeSemester,
    emptySemester,
  }
}