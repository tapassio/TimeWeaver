import { ref } from 'vue'
import { usePostgres, EntityTables } from '@/composables/usePostgres'
import { parseImportText } from '@/utils/csvSchemas'
import type { Location } from '@/types/location'

function emptyLocation(): Location {
  return {
    name: '',
    building: '',
  }
}

export function useLocations() {
  const { fetchEntities, createEntity, updateEntity: updateDbEntity, removeEntity: removeDbEntity } = usePostgres()
  const locations = ref<Location[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

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

  async function addLocation(location: Location) {
    error.value = null
    try {
      const saved = await createEntity<Location>(EntityTables.LOCATION, location)
      location.id = saved.id
      locations.value = await fetchEntities<Location>(EntityTables.LOCATION)
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  async function updateLocation(location: Location) {
    const id = location.id
    if (!id) return
    error.value = null
    try {
      await updateDbEntity(EntityTables.LOCATION, id, location)
      const idx = locations.value.findIndex(l => l.id === id)
      if (idx !== -1) locations.value[idx] = location
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  async function removeLocation(id: string) {
    error.value = null
    try {
      await removeDbEntity(EntityTables.LOCATION, id)
      locations.value = locations.value.filter(l => l.id !== id)
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  async function importLocations(items: Location[]): Promise<Location[]> {
    error.value = null
    const imported: Location[] = []
    try {
      for (const item of items) {
        const saved = await createEntity<Location>(EntityTables.LOCATION, item)
        item.id = saved.id
        imported.push(item)
      }
      locations.value = await fetchEntities<Location>(EntityTables.LOCATION)
      return imported
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  async function importCsv(text: string) {
    // Routed through the central import module (useCsvImport + csvSchemas).
    const imported = parseImportText('locations', text) as Location[]
    if (imported.length === 0) throw new Error('CSV must contain a header row and at least one data row')
    await importLocations(imported)
    return imported
  }

  return {
    locations,
    loading,
    error,
    fetchLocations,
    addLocation,
    updateLocation,
    removeLocation,
    importLocations,
    importCsv,
    emptyLocation,
  }
}