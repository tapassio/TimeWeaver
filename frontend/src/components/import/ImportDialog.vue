<template>
  <v-dialog :model-value="modelValue" max-width="900" scrollable persistent
    @update:model-value="$emit('update:modelValue', $event)">
    <v-card class="import-dialog-card">
      <v-card-item class="pa-4">
        <div class="d-flex align-start ga-3">
          <v-icon color="accent">mdi-widget</v-icon>
          <div class="flex-grow-1">
            <v-card-title class="pa-0" style="font-size: 18px">Daten importieren</v-card-title>
            <v-card-subtitle class="pa-0">
              Mehrere Dateien gleichzeitig — CourseWeaver erkennt den Datentyp pro Datei automatisch
            </v-card-subtitle>
          </div>
          <v-btn icon="mdi-close" size="small" variant="text" @click="$emit('update:modelValue', false)" />
        </div>
      </v-card-item>

      <v-divider />

      <v-card-text class="pa-4" style="max-height: 65vh; overflow-y: auto">
        <ImportDropZone @files="filesAdded" />

        <div v-if="files.length" class="text-caption font-weight-bold mb-2 mt-4" style="letter-spacing: 0.06em">
          {{ files.length }} DATEIEN AUSGEWÄHLT
        </div>

        <v-alert v-if="parseErrors && parseErrors.length" type="error" variant="tonal" density="compact" class="mb-3">
          <div v-for="(e, idx) in parseErrors" :key="idx">{{ e.file }}: {{ e.message }}</div>
        </v-alert>

        <ImportFileCard
          v-for="f in files"
          :key="f.id"
          :file="f"
          :chosen-type-id="chosenTypeId[f.id]"
          :expanded="expandedFileId === f.id"
          :type-defs="typeDefs"
          :mandatory-fields="getMandatory(f)"
          @type-change="typeChanged(f, $event)"
          @update:expanded="expandedChanged(f, $event)"
        />

        <div class="d-flex align-center ga-2 mt-3" v-if="decisionNeededList.length > 0">
          <v-icon size="small" color="warning">mdi-alert-outline</v-icon>
          {{ decisionNeededList.length }} Datei{{ decisionNeededList.length > 1 ? 'en' : '' }} benötigt{{ decisionNeededList.length > 1 ? '' : '' }} eine Entscheidung
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4">
        <div v-if="decisionNeededList.length > 0" class="text-caption text-medium-emphasis d-flex align-center">
          <v-icon size="small" color="warning" class="me-1">mdi-alert-outline</v-icon>
          {{ decisionNeededList.length }} Datei{{ decisionNeededList.length > 1 ? 'en' : '' }} benötigt{{ decisionNeeded > 1 ? '' : '' }} eine Entscheidung
        </div>
        <v-spacer />
        <v-btn variant="text" @click="$emit('update:modelValue', false)">Abbrechen</v-btn>
        <v-btn
          color="coral" class="import-run-btn"
          prepend-icon="mdi-database-import-outline"
          :loading="saving" :disabled="files.length === 0"
          @click="$emit('save')"
        >
          {{ files.length }} Dateien importieren ({{ totalRecords }} Datensätze)
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import ImportDropZone from './ImportDropZone.vue'
import ImportFileCard from './ImportFileCard.vue'
import type { ImportTypeDef } from '@/utils/importTypeDefs'
import { detectImportType } from '@/utils/importTypeDefs'
import { computed } from 'vue'
import type { ParsedFile } from '@/composables/useImportDialog'
import { mandatoryFieldsFor } from '@/composables/useImportDialog'

const props = defineProps<{
  modelValue: boolean
  files: ParsedFile[]
  chosenTypeId: Record<string, string>
  expandedFileId: string | null
  typeDefs: ImportTypeDef[]
  saving: boolean
  parseErrors?: Array<{ file: string; message: string }>
  manualResolutions?: Record<string, string | undefined>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'files-added': [files: File[]]
  'type-change': [payload: { fileId: string; typeId: string }]
  'expanded-change': [id: string | null]
  'resolved': [payload: { fileId: string; name: string; value: string }]
  'save': []
}>()

const detectFor = (f: ParsedFile): ImportTypeDef => detectImportType(f, props.typeDefs)

const importTypeFor = (f: ParsedFile): ImportTypeDef =>
  props.typeDefs.find(t => t.id === (props.chosenTypeId[f.id] ?? detectFor(f).id)) ?? detectFor(f)

function filesAdded(files: File[]): void {
  emit('files-added', files)
}

function typeChanged(f: ParsedFile, newTypeId: string): void {
  emit('type-change', { fileId: f.id, typeId: newTypeId })
}

function expandedChanged(f: ParsedFile, open: boolean): void {
  emit('expanded-change', open ? f.id : null)
}

const getMandatory = (f: ParsedFile): Array<{ name: string; why: string; value: string | null; sourceText?: string }> => {
  const typeDef = importTypeFor(f)
  const base = (mandatoryFieldsFor(typeDef.id, f) as unknown as Array<{ name: string; why: string; value: string | null }>)
  return base.map(e => ({
    name: e.name,
    why: e.why,
    value: e.value,
    sourceText: sourceChipFor(f, e.name),
  }))
}

function sourceChipFor(f: ParsedFile, name: string): string {
  const meta = f.moduleConceptMeta ?? {}
  if (name === 'Modulname') return meta.module_name_source ?? 'Erste Datenzeile'
  if (name === 'Studiengang') return 'Sheet-Titel'
  if (name === 'Semester') return `Dateiname (${f.name.replace(/^.*_Concept_/i, '').replace(/\.xlsx?$/i, '')})`
  return 'Erste Datenzeile'
}

const totalRecords = computed(() => {
  let sum = 0
  props.files.forEach((f: ParsedFile) => { sum += (f.rows?.length ?? 0) })
  return sum
})

const decisionNeeded = computed(() => decisionNeededList.value.length)

// trailing paket for the earlier version removed.


const decisionNeededList = computed(() =>
  props.files.filter(f => {
    const chosen = props.chosenTypeId[f.id]
    return chosen !== undefined && chosen !== detectFor(f).id
  }),
)

</script>

<style scoped>
.import-dialog-card { border-radius: 10px; background: var(--cw-panel, #fff); }
.cap { font-size: 12px; color: var(--cw-text2, #63665f); }
.import-run-btn { background: var(--cw-coral, #c6603f); }
</style>
