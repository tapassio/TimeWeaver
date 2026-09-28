<template>
  <div class="rule-row" :class="{ editable, open }">
    <!-- Kopf: Klick öffnet/schliesst das Inline-Akkordeon (Spec Fix 3) -->
    <div class="row-main" role="button" tabindex="0" @click="editable && (open = !open)" @keydown.enter.prevent="editable && (open = !open)">
      <span class="row-title">{{ rule.moduleTitle }} · {{ typeDef.name }}</span>
      <span v-if="rule.weight != null" class="weight">Gewicht {{ rule.weight }}</span>
      <span :class="badgeClasses(isHard)">{{ isHard ? 'Hart' : 'Weich' }}</span>
      <v-icon class="ms-auto" size="x-small">
        {{ open ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
      </v-icon>
    </div>
    <div class="row-desc">{{ description }}</div>

    <!-- Inline-Akkordeon: dieselben Detailfelder wie beim Anlegen, vorausgefüllt -->
    <div v-if="open && editable" class="row-editor">
      <template v-if="typeDef.id !== 'day_tags'">
        <label class="caption-label">Modul</label>
        <v-select
          :model-value="editingModuleId"
          :items="moduleOptions"
          variant="outlined"
          density="compact"
          class="mb-3"
          label="Modul"
          @update:model-value="editingModuleId = $event"
        />
      </template>

      <component
        :is="detailComp"
        :key="typeDef.id"
        v-model="editingForm"
        v-model:module-id="editingModuleId"
        @update:valid="(v: boolean) => (editingValid = v)"
        :module-options="moduleOptions"
        :used-tags="usedTags"
      />

      <div class="editor-actions">
        <v-btn variant="text" size="small" @click="open = false">Abbrechen</v-btn>
        <v-btn variant="text" color="error" size="small" @click="confirmDelete">Löschen</v-btn>
        <v-btn variant="flat" color="primary" size="small" prepend-icon="mdi-content-save" @click="saveRow">
          Speichern
        </v-btn>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ConstraintInstance, ConstraintTypeDef } from '@/utils/constraintUx'
import { badgeClasses } from '@/utils/constraintUx'
import { detailComponentFor } from './detailComponents'

const props = defineProps<{
  rule: ConstraintInstance
  typeDef: ConstraintTypeDef
  editable: boolean
  moduleOptions: Array<{ value: string; title: string }>
  /** Autocomplete-Quelle für day_tags (bereits verwendete Tags, Kap. 11.2) */
  usedTags?: string[]
}>()

const emit = defineEmits<{
  /* Inline-Speichern: dieselbe Payload wie der Dialog, plus rule-Referenz */
  save: [args: { rule: ConstraintInstance; typeId: string; moduleId: string; params?: Record<string, unknown>; weight?: number }]
  delete: [instanceId: string]
}>()

const open = ref(false)
const editingModuleId = ref<string | null>(props.rule.moduleId)
const editingForm = ref<Record<string, unknown>>({})

const detailComp = computed(() => detailComponentFor(props.typeDef.id))
const isHard = computed(() => props.typeDef.hard)
const description = computed(() => describeInstance(props.rule, props.typeDef))

/* Beim Öffnen: Detailfelder mit den Ist-Daten vorausfüllen */
watch(open, (v) => {
  if (!v) return
  editingModuleId.value = props.rule.moduleId
  editingForm.value = { ...(props.rule.params ?? {}), weight: props.rule.weight }
  editingValid.value = true
})

const editingValid = ref<boolean>(false)

function saveRow(): void {
  // Kap. 11.2 — bei day_tags kommt das Zielmodul aus dem TagRuleValue (Spec-Feld)
  const moduleId = props.typeDef.id === 'day_tags'
    ? String((editingForm.value as any).targetModuleId ?? editingModuleId.value ?? props.rule.moduleId)
    : String(editingModuleId.value ?? props.rule.moduleId)
  emit('save', {
    rule: props.rule,
    typeId: props.typeDef.id,
    moduleId,
    params: { ...editingForm.value } as Record<string, unknown>,
    weight: Number(editingForm.value.weight ?? undefined) || undefined,
  })
}

function confirmDelete(): void {
  if (window.confirm(`Regel „${props.typeDef.name}“ für Modul „${props.rule.moduleTitle}“ wirklich entfernen?`)) {
    open.value = false
    emit('delete', props.rule.id)
  }
}

function describeInstance(rule: ConstraintInstance, def: ConstraintTypeDef): string {
  const p = (rule.params ?? {}) as Record<string, any>
  switch (def.id) {
    case 'no_weekday':
      return `Erlaubte Wochentage: ${(p.weekdays ?? []).join(', ') || '–'}`
    case 'exclude_dates':
      return `Gesperrte Datumsangaben: ${(p.dates ?? []).join(', ') || '–'}`
    case 'outlook_busy':
      return `Outlook-Sperre: ${p.date ?? '–'} (${p.slot ?? 'Vormittag'})`
    case 'prerequisite':
      return `Vorausgesetztes Modul: ${p.targetModuleId ?? '–'}`
    case 'fixed_day':
      return `Fixiert auf: ${(p.dates ?? []).join(', ') || '–'}`
    case 'phase_only':
      return `Nur Phase: ${(p.phases ?? []).join(', ') || '–'}`
    case 'room_capacity':
      return `Erforderliche Raumsitzplätze: ${p.students ?? '–'}`
    default:
      return def.desc
  }
}
</script>

<style scoped>
.rule-row { display: block; padding: 6px 4px; }
.rule-row + .rule-row { border-top: 1px solid var(--cw-border, #eee8da); }
.rule-row.editable .row-main { cursor: pointer; }
.row-main { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.row-title { font-size: 13.5px; font-weight: 600; color: var(--cw-text); }
.weight { font-size: 12px; color: var(--cw-text2); }
.row-desc { font-size: 12.5px; color: var(--cw-text2); margin-top: 2px; }
.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.caption-label {
  display: block;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--cw-text2);
  margin-bottom: 2px;
}
</style>
