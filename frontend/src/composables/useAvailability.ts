import { ref } from 'vue'
import { usePostgres, EntityTables } from '@/composables/usePostgres'
import type { LecturerAvailability } from '@/types/schedule'

export const emptyLecturerAvailability: LecturerAvailability = {
  lecturerId: '',
  weekId: undefined,
  weekday: 'monday',
  startTime: '08:00',
  endTime: '12:00',
}

export function useAvailability() {
  const { fetchEntities, createEntity, updateEntity: updateDbEntity, removeEntity: removeDbEntity } = usePostgres()
  const availabilities = ref<LecturerAvailability[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchAvailabilities() {
    loading.value = true
    error.value = null
    try {
      availabilities.value = await fetchEntities<LecturerAvailability>(EntityTables.LECTURER_AVAILABILITY)
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function addAvailability(avail: LecturerAvailability) {
    loading.value = true
    error.value = null
    try {
      const created = await createEntity<LecturerAvailability>(EntityTables.LECTURER_AVAILABILITY, avail)
      availabilities.value.push(created)
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function updateAvailability(avail: LecturerAvailability) {
    const id = avail._id || avail.id
    if (!id) return
    loading.value = true
    error.value = null
    try {
      await updateDbEntity(EntityTables.LECTURER_AVAILABILITY, id, avail)
      const idx = availabilities.value.findIndex(a => (a._id || a.id) === id)
      if (idx !== -1) availabilities.value[idx] = { ...avail, _id: id, id }
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function removeAvailability(id: string) {
    loading.value = true
    error.value = null
    try {
      await removeDbEntity(EntityTables.LECTURER_AVAILABILITY, id)
      availabilities.value = availabilities.value.filter(a => (a._id || a.id) !== id)
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  return {
    availabilities,
    loading,
    error,
    fetchAvailabilities,
    addAvailability,
    updateAvailability,
    removeAvailability,
  }
}