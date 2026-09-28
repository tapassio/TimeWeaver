import { ref } from 'vue'
import { usePostgres, EntityTables } from '@/composables/usePostgres'
import { parseImportText } from '@/utils/csvSchemas'
import type { Room } from '@/types/room'

function emptyRoom(): Room {
  return {
    name: '',
    roomType: 'classroom',
    floor: 0,
    roomNumber: '',
    capacity: 0,
    accessibility: {
      step_free_access: false,
    },
  }
}

export function useRooms() {
  const { fetchEntities, createEntity, updateEntity: updateDbEntity, removeEntity: removeDbEntity } = usePostgres()
  const rooms = ref<Room[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

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

  async function addRoom(room: Room) {
    error.value = null
    try {
      const saved = await createEntity<Room>(EntityTables.ROOM, room)
      room.id = saved.id
      rooms.value = await fetchEntities<Room>(EntityTables.ROOM)
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  async function updateRoom(room: Room) {
    const id = room.id
    if (!id) return
    error.value = null
    try {
      await updateDbEntity(EntityTables.ROOM, id, room)
      const idx = rooms.value.findIndex(r => r.id === id)
      if (idx !== -1) rooms.value[idx] = room
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  async function removeRoom(id: string) {
    error.value = null
    try {
      await removeDbEntity(EntityTables.ROOM, id)
      rooms.value = rooms.value.filter(r => r.id !== id)
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  async function importRooms(items: Room[]): Promise<Room[]> {
    error.value = null
    const imported: Room[] = []
    try {
      for (const item of items) {
        const saved = await createEntity<Room>(EntityTables.ROOM, item)
        item.id = saved.id
        imported.push(item)
      }
      rooms.value = await fetchEntities<Room>(EntityTables.ROOM)
      return imported
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  async function importCsv(text: string) {
    // Routed through the central import module (useCsvImport + csvSchemas).
    const imported = parseImportText('rooms', text) as Room[]
    if (imported.length === 0) throw new Error('CSV must contain a header row and at least one data row')
    await importRooms(imported)
    return imported
  }

  return {
    rooms,
    loading,
    error,
    fetchRooms,
    addRoom,
    updateRoom,
    removeRoom,
    importRooms,
    importCsv,
    emptyRoom,
  }
}