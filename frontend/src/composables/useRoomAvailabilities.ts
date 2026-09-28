import { ref } from 'vue'
import { usePostgres, EntityTables } from '@/composables/usePostgres'
import type { RoomAvailability } from '@/types/roomAvailability'

function emptyRoomAvailability(): RoomAvailability {
  return {
    roomId: '',
    weekId: undefined,
    weekday: 'monday',
    startTime: '08:00',
    endTime: '12:00',
  }
}

export function useRoomAvailabilities() {
  const { fetchEntities, createEntity, updateEntity: updateDbEntity, removeEntity: removeDbEntity } = usePostgres()
  const roomAvailabilities = ref<RoomAvailability[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

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

  async function addRoomAvailability(item: RoomAvailability) {
    error.value = null
    try {
      const saved = await createEntity<RoomAvailability>(EntityTables.ROOM_AVAILABILITY, item)
      item.id = saved.id
      roomAvailabilities.value = await fetchEntities<RoomAvailability>(EntityTables.ROOM_AVAILABILITY)
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  async function updateRoomAvailability(item: RoomAvailability) {
    const id = item.id
    if (!id) return
    error.value = null
    try {
      await updateDbEntity(EntityTables.ROOM_AVAILABILITY, id, item)
      const idx = roomAvailabilities.value.findIndex(r => r.id === id)
      if (idx !== -1) roomAvailabilities.value[idx] = item
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  async function removeRoomAvailability(id: string) {
    error.value = null
    try {
      await removeDbEntity(EntityTables.ROOM_AVAILABILITY, id)
      roomAvailabilities.value = roomAvailabilities.value.filter(r => r.id !== id)
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  async function importRoomAvailabilities(items: RoomAvailability[]): Promise<RoomAvailability[]> {
    error.value = null
    const imported: RoomAvailability[] = []
    try {
      for (const item of items) {
        const saved = await createEntity<RoomAvailability>(EntityTables.ROOM_AVAILABILITY, item)
        item.id = saved.id
        imported.push(item)
      }
      roomAvailabilities.value = await fetchEntities<RoomAvailability>(EntityTables.ROOM_AVAILABILITY)
      return imported
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  return {
    roomAvailabilities,
    loading,
    error,
    fetchRoomAvailabilities,
    addRoomAvailability,
    updateRoomAvailability,
    removeRoomAvailability,
    importRoomAvailabilities,
    emptyRoomAvailability,
  }
}