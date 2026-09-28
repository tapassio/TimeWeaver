import { ref } from 'vue'
import { usePostgres, EntityTables } from '@/composables/usePostgres'
import type { ScheduleEntry } from '@/types/scheduleEntry'
import { WEEKDAY_OPTIONS } from '@/types/schedule'

export function emptyScheduleEntry(): ScheduleEntry {
  return {
    weekId: '',
    moduleIds: [],
    roomIds: [],
    classIds: [],
    lecturerIds: [],
    weekday: 'monday',
    startTime: '08:00',
    endTime: '12:00',
  }
}

export function useScheduleEntries() {
  const { fetchEntities, createEntity, updateEntity: updateDbEntity, removeEntity: removeDbEntity } = usePostgres()
  const scheduleEntries = ref<ScheduleEntry[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

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

  async function addScheduleEntry(item: ScheduleEntry) {
    error.value = null
    try {
      await createEntity<ScheduleEntry>(EntityTables.SCHEDULE_ENTRY, item)
      scheduleEntries.value = await fetchEntities<ScheduleEntry>(EntityTables.SCHEDULE_ENTRY)
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  async function updateScheduleEntry(item: ScheduleEntry) {
    const id = item.id
    if (!id) return
    error.value = null
    try {
      await updateDbEntity(EntityTables.SCHEDULE_ENTRY, id, item)
      const idx = scheduleEntries.value.findIndex(s => s.id === id)
      if (idx !== -1) scheduleEntries.value[idx] = item
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  async function removeScheduleEntry(id: string) {
    error.value = null
    try {
      await removeDbEntity(EntityTables.SCHEDULE_ENTRY, id)
      scheduleEntries.value = scheduleEntries.value.filter(s => s.id !== id)
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  return {
    scheduleEntries,
    loading,
    error,
    emptyScheduleEntry,
    weekdayOptions: WEEKDAY_OPTIONS,
    fetchScheduleEntries,
    addScheduleEntry,
    updateScheduleEntry,
    removeScheduleEntry,
  }
}