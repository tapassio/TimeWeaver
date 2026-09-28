<template>
  <!--
    Kap. import-dialog-vue-spec: kein globaler Typ-Dropdown mehr — jede Datei
    bekommt ihren automatisch erkannten Typ (Override pro Datei möglich).
    Diese Komponente hält die alte Emit-Contractung (imported: {type,count,items})
    der bisherigen Dialoge und delegiert Rendering/State an components/import/ImportDialog.vue.
  -->
  <ImportDialog
    v-model="open"
    :files="parsedFiles"
    :chosen-type-id="chosenTypeId"
    :expanded-file-id="expandedFileId"
    :type-defs="IMPORT_TYPE_DEFS"
    :saving="saving"
    :parse-errors="parseErrors"
    :manual-resolutions="manualResolutions"
    @files-added="onFilesAdded"
    @type-change="onTypeChange"
    @expanded-change="expandedFileId = $event"
    @resolved="onResolved"
    @save="saveAll"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import ImportDialog from '@/components/import/ImportDialog.vue'
import type { ParsedFile } from '@/composables/useImportDialog'
import { parseUploadedFile, chosenTypeOrDefault } from '@/composables/useImportDialog'
import { IMPORT_TYPE_DEFS } from '@/utils/importTypeDefs'
import { useCsvImport } from '@/composables/useCsvImport'
const emit = defineEmits<{
  'imported': [payload: { type: ImportType; count: number; items: any[] }]
}>()

const model = defineModel<boolean>()
const open = computed({
  get: () => model.value ?? false,
  set: (v) => { model.value = v },
})

const parsedFiles = ref<ParsedFile[]>([])
const chosenTypeId = ref<Record<string, string>>({})
const expandedFileId = ref<string | null>(null)
const manualResolutions = ref<Record<string, string | undefined>>({})
const saving = ref(false)
const parseErrors = ref<Array<{ file: string; message: string }>>([])

async function onFilesAdded(files: File[]): Promise<void> {
  parseErrors.value = []
  for (const file of files) {
    try {
      const parsed = await parseUploadedFile(file)
      parsedFiles.value = [...parsedFiles.value, parsed]
    } catch (e: any) {
      parseErrors.value = [...parseErrors.value, { file: file.name, message: e.message ?? 'Parse-Fehler' }]
    }
  }
}

function onTypeChange(payload: { fileId: string; typeId: string }): void {
  chosenTypeId.value = { ...chosenTypeId.value, [payload.fileId]: payload.typeId }
}

function onResolved(payload: { fileId: string; name: string; value: string }): void {
  manualResolutions.value = {
    ...manualResolutions.value,
    [`${payload.fileId}::${payload.name}`]: payload.value,
  }
}

/** Kap. Spec 7 — Save: alle Dateien in einem Schritt, jede mit ihrem Typ verarbeiten */
async function saveAll(): Promise<void> {
  saving.value = true
  try {
    for (const f of parsedFiles.value) {
      const type = chosenTypeOrDefault(f, chosenTypeId.value, IMPORT_TYPE_DEFS)
      const entities = await buildEntitiesFor(type.id, f)
      if (entities.length === 0) continue
      const count = await saveForType(type.id as ImportType, entities)
      emit('imported', { type: type.id as ImportType, count, items: entities })
    }
    open.value = false
    parsedFiles.value = []
    chosenTypeId.value = {}
    manualResolutions.value = {}
  } catch (e: any) {
    // dem Parent nichts zurückwerfen — Fehler via Snackbar-Dialog bleibt local
    parseErrors.value = [{ file: 'Import', message: e.message ?? 'Import fehlgeschlagen' }]
  } finally {
    saving.value = false
  }
}

import type { ImportType } from '@/types/csvImport'

async function saveForType(typ: ImportType, entities: any[]): Promise<number> {
  const { saveImportedData } = useCsvImport()
  return saveImportedData(typ, entities)
}

async function buildEntitiesFor(typeId: string, f: ParsedFile): Promise<any[]> {
  void typeId
  // Standardfall: Tabellenzeilen direkt speichern (inkl. Spalten wie in csvSchemas erwartet)
  return f.rows.map(row => ({ ...row }))
}
</script>
