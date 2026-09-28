<template>
  <v-dialog :model-value="modelValue" max-width="860" scrollable persistent
    @update:model-value="$emit('update:modelValue', $event)">
    <v-card class="dialog-card">
      <v-card-item>
        <v-card-title class="text-h6">Neue Regel</v-card-title>
        <v-card-subtitle>Kategorie → Regeltyp → Detailfelder → Speichern</v-card-subtitle>
      </v-card-item>

      <v-card-text class="pa-4">
        <v-alert v-if="ruleError" type="error" variant="tonal" class="mb-3">{{ ruleError }}</v-alert>

        <label class="caption">Kategorie</label>
        <v-btn-toggle :model-value="selectedCategory" mandatory density="compact" variant="outlined" class="mb-3" @update:model-value="selectCategory($event)">
          <v-btn v-for="c in categories" :key="c.id" :value="c.id">
            {{ c.label }}
          </v-btn>
        </v-btn-toggle>

        <label class="caption">Regeltyp</label>
        <div class="d-flex flex-wrap mb-3 ga-2">
          <ConstraintTypeCard
            v-for="t in typesInCategory"
            :key="t.id"
            :def="t"
            :model-value="selectedType === t.id"
            @select="selectedType = t.id"
          />
          <div v-if="typesInCategory.length === 0" class="text-medium-emphasis hint">
            Kein Regeltyp in dieser Kategorie.
          </div>
        </div>

        <!-- day_tags trägt sein Zielmodul im TagRuleValue selbst (kein Doppelselektor) -->
        <template v-if="!isTagType">
          <label class="caption">Modul</label>
          <v-select
            v-model="selectedModuleId"
            :items="moduleOptions"
            variant="outlined" density="compact" class="mb-3"
            label="Modul"
          />
        </template>

        <component
          v-if="selectedType"
          :is="activeDetailComponent"
          :key="selectedType + (editingId ?? '')"
          v-model="formValues"
          v-model:module-id="selectedModuleId"
          @update:valid="(v: boolean) => (fieldValid = v)"
          :module-options="moduleOptions"
          :used-tags="usedTags"
        />
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn variant="text" @click="$emit('update:modelValue', false)">Abbrechen</v-btn>
        <v-btn
          v-if="editingId"
          variant="text" color="error"
          @click="$emit('remove', editingId)"
        >
          Regel löschen
        </v-btn>
        <v-btn
          color="primary" variant="flat"
          prepend-icon="mdi-content-save"
          :loading="saving"
          :disabled="!selectedType || !fieldValid"
          @click="save"
        >
          Regel speichern
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { ConstraintCategory, ConstraintInstance } from '@/utils/constraintUx'
import type { ConstraintTypeDef } from '@/utils/constraintUx'
import ConstraintTypeCard from './ConstraintTypeCard.vue'
import { detailComponentFor } from './detailComponents'
import { categoriesFromTypeDefs } from '@/utils/constraintUx'

const props = defineProps<{
  modelValue: boolean
  typeDefs: ConstraintTypeDef[]
  moduleOptions: Array<{ value: string; title: string }>
  editing?: ConstraintInstance | null
  saving?: boolean
  ruleError?: string | null
  /** Autocomplete-Quelle für day_tags (bereits verwendete Tags, Kap. 11.2) */
  usedTags?: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [payload: { typeId: string; moduleId: string; params?: Record<string, unknown>; weight?: number }]
  remove: [instanceId: string]
}>()

/* Spec Fix — Kategorien aus den vorhandenen Regeltypen abgeleitet */
const categories = computed(() => categoriesFromTypeDefs(props.typeDefs))
const selectedCategory = ref<ConstraintCategory['id']>('zeitfenster')
const selectedType = ref<string | null>(null)
const selectedModuleId = ref<string | null>(null)
const fieldValid = ref<boolean>(false)

const typesInCategory = computed(() =>
  props.typeDefs.filter(t => t.category === selectedCategory.value),
)

function selectCategory(id: ConstraintCategory['id']): void {
  selectedCategory.value = id
  selectedType.value = null
}

// Kap Spec 4 — EINE geteilte Mapping-Tabelle (auch vom Inline-Akkordeon benutzt)
const activeDetailComponent = computed(() => detailComponentFor(String(selectedType.value ?? '')))

/* day_tags trägt sein Zielmodul selbst (TagRuleValue.targetModuleId) */
const isTagType = computed(() => selectedType.value === 'day_tags')

const formValues = ref<{
  weekdays?: string[]; dates?: string[]; targetModuleId?: string; students?: number; weight?: number; relation?: string; tag?: string
}>({})

watch(selectedType, () => {
  formValues.value = {}
  fieldValid.value = false
})

const editingId = ref<string | null>(null)

watch(() => props.modelValue, (open) => {
  if (!open) return
  selectedModuleId.value = props.moduleOptions[0]?.value ?? null
  if (props.editing) {
    editingId.value = props.editing.id
    selectedModuleId.value = props.editing.moduleId
    formValues.value = { ...(props.editing.params ?? {}), weight: props.editing.weight }
    const type = typeDefForInstance()
    selectedType.value = type ?? null
  } else {
    editingId.value = null
    selectedType.value = null
    formValues.value = {}
  }
})

function typeDefForInstance(): string | null {
  const edit = props.editing
  if (!edit) return null
  return props.typeDefs.find(t => t.id === edit.typeId)?.id ?? null
}

function save(): void {
  if (!selectedModuleId.value) return
  // Kap. 11.2 — bei day_tags kommt das Zielmodul aus dem TagRuleValue selbst
  const moduleId = selectedType.value === 'day_tags'
    ? String((formValues.value as any).targetModuleId ?? selectedModuleId.value)
    : String(selectedModuleId.value)
  emit('save', {
    typeId: String(selectedType.value),
    moduleId,
    params: { ...(formValues.value as Record<string, unknown>) },
    weight: Number(formValues.value.weight ?? undefined) || undefined,
  })
  emit('update:modelValue', false)
}
</script>
