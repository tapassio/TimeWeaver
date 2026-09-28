import { ref } from 'vue'
import { usePostgres, EntityTables } from '@/composables/usePostgres'
import type { Week } from '@/types/week'

export function emptyWeek(): Week {
  return {
    semesterId: '',
    semesterWeek: 1,
    startDate: '',
    endDate: '',
    daysOff: [],
  }
}

export function useWeeks() {
  const { fetchEntities, createEntity, updateEntity: updateDbEntity, removeEntity: removeDbEntity } = usePostgres()
  const weeks = ref<Week[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

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

  async function addWeek(item: Week) {
    error.value = null
    try {
      await createEntity<Week>(EntityTables.WEEK, item)
      weeks.value = await fetchEntities<Week>(EntityTables.WEEK)
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  async function updateWeek(item: Week) {
    const id = item.id
    if (!id) return
    error.value = null
    try {
      await updateDbEntity(EntityTables.WEEK, id, item)
      const idx = weeks.value.findIndex(w => w.id === id)
      if (idx !== -1) weeks.value[idx] = item
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  async function removeWeek(id: string) {
    error.value = null
    try {
      await removeDbEntity(EntityTables.WEEK, id)
      weeks.value = weeks.value.filter(w => w.id !== id)
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  return {
    weeks,
    loading,
    error,
    emptyWeek,
    fetchWeeks,
    addWeek,
    updateWeek,
    removeWeek,
  }
}