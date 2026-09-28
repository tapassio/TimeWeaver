<template>
  <v-card variant="outlined" class="file-card pa-3 mb-2">
    <!-- Kopf: Dateiname, Typ-Select (Override möglich), Akkordeon -->
    <div class="d-flex align-center ga-2">
      <v-icon>{{ file.kind === 'excel' ? 'mdi-file-excel-outline' : 'mdi-file-delimited-outline' }}</v-icon>
      <div class="flex-grow-1" style="min-width: 0">
        <div class="text-body-2 font-weight-medium text-truncate">{{ file.name }}</div>
        <div class="text-caption text-medium-emphasis">{{ subtitle }}</div>
      </div>
      <span :class="badgeClasses(false)" :title="detected.id">
        {{ importType.id === detected.id ? `Erkannt: ${detected.label}` : `Typ manuell gesetzt: ${importType.label}` }}
      </span>
      <v-btn icon="mdi-chevron-down" size="small" variant="text" @click="$emit('update:expanded', !expanded)" />
    </div>

    <!-- Kap. Spec 4: Mismatch-Warnbox, wechselt auf erkannten Typ -->
    <TypeMismatchWarning
      v-if="mismatch"
      :chosen-label="importType.label"
      :suggested-label="detected.label"
      @switch="$emit('type-change', detected.id)"
    />

    <!-- Kap. Spec 4: Aufgeklappt → MandatoryFieldsList + Spalten -->
    <div v-if="expanded" class="mt-2">
      <MandatoryFieldsList :fields="mandatoryFields" :column-options="file.columns" />
      <v-divider class="my-2" />
      <div class="text-caption text-medium-emphasis">
        Spalten der Datei:
        <code class="column-list">{{ file.columns.join(' · ') }}</code>
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import TypeMismatchWarning from './TypeMismatchWarning.vue'
import MandatoryFieldsList from './MandatoryFieldsList.vue'
import type { ImportTypeDef } from '@/utils/importTypeDefs'
import { detectImportType } from '@/utils/importTypeDefs'
import { badgeClasses } from '@/utils/constraintUx'
import type { ParsedFile } from '@/composables/useImportDialog'

const props = defineProps<{
  file: ParsedFile
  chosenTypeId?: string
  expanded: boolean
  typeDefs: ImportTypeDef[]
  mandatoryFields: Array<{ name: string; why: string; value: string | null; sourceText?: string }>
}>()

defineEmits<{
  'update:expanded': [value: boolean]
  'type-change': [value: string]
  'use-detected-type': []
  'resolved': [payload: { fileId: string; name: string; value: string }]
}>()

const detected = computed<ImportTypeDef>(() => detectImportType(props.file, props.typeDefs))
const importType = computed<ImportTypeDef>(() =>
  props.typeDefs.find(t => t.id === (props.chosenTypeId ?? detected.value.id)) ?? detected.value,
)

const subtitle = computed<string>(() => {
  if (mismatch.value) return 'Dateityp unsicher - bitte prüfen'
  if (props.file.moduleConceptMeta?.modules) {
    return `${props.file.moduleConceptMeta.modules} Module · ${props.file.moduleConceptMeta.cycles} Learning Cycles · Semester erkannt`
  }
  return `${props.file.columns.length} Spalten erkannt`
})

const mismatch = computed<boolean>(() =>
  props.chosenTypeId !== undefined && props.chosenTypeId !== detected.value.id,
)
</script>

<style scoped>
.file-card {
  border-radius: 10px;
  background: var(--cw-panel, #fff);
  border-color: var(--cw-border, #e3dfd3);
}
</style>
