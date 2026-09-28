import { ref } from 'vue'
import { usePostgres, EntityTables } from '@/composables/usePostgres'
import type { ImportType } from '@/types/csvImport'

export function useCsvImport() {
  const { createEntity } = usePostgres()
  const isImporting = ref(false)
  const importError = ref<string | null>(null)

  const entityTableMap: Record<ImportType, string> = {
    rooms: EntityTables.ROOM,
    locations: EntityTables.LOCATION,
    availability: EntityTables.LECTURER_AVAILABILITY,
    scheduling_rules: EntityTables.SCHEDULING_RULE,
    room_availability: EntityTables.ROOM_AVAILABILITY,
    weeks: EntityTables.WEEK,
    schedule_entries: EntityTables.SCHEDULE_ENTRY,
  }

  async function saveImportedData(type: ImportType, items: any[]): Promise<number> {
    isImporting.value = true
    importError.value = null
    const tableName = entityTableMap[type]

    try {
      let count = 0
      for (const item of items) {
        await createEntity(tableName, item)
        count++
      }
      return count
    } catch (e: any) {
      importError.value = e.message || 'Failed to save imported records'
      throw e
    } finally {
      isImporting.value = false
    }
  }

  return {
    isImporting,
    importError,
    saveImportedData,
  }
}
