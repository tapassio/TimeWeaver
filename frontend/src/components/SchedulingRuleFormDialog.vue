<template>
  <v-dialog :model-value="modelValue" max-width="700" scrollable persistent @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-item class="bg-primary text-white py-3">
        <template #prepend>
          <v-icon icon="mdi-tune-vertical" size="large" class="me-2" />
        </template>
        <v-card-title class="text-h6 font-weight-medium">{{ isEdit ? 'Edit Rule' : 'Add Rule' }}</v-card-title>
        <v-card-subtitle class="text-white text-opacity-80">
          Configure a constraint rule for CP-SAT timetable generation
        </v-card-subtitle>
        <template #append>
          <v-btn icon="mdi-close" variant="text" density="comfortable" @click="close" />
        </template>
      </v-card-item>

      <v-card-text class="pa-4 pa-sm-6">
        <v-form ref="formRef" @submit.prevent="submit">
          <v-select
            v-model="form.ruleType"
            :items="constraintOptions"
            item-title="title"
            item-value="value"
            label="Rule Type *"
            :rules="[v => !!v || 'Select a constraint rule']"
            variant="outlined"
            density="compact"
            class="mb-3"
          >
            <template #item="{ props: itemProps, item }">
              <v-list-item v-bind="itemProps">
                <template #prepend>
                  <v-chip
                    size="x-small"
                    :color="(item as any).raw?.category === 'hard' ? 'error' : 'warning'"
                    variant="tonal"
                    class="me-2"
                  >
                    {{ (item as any).raw?.category }}
                  </v-chip>
                </template>
              </v-list-item>
            </template>
          </v-select>

          <v-row dense>
            <v-col cols="12" sm="6">
              <v-select
                v-model="form.category"
                :items="categoryOptions"
                item-title="title"
                item-value="value"
                label="Category *"
                variant="outlined"
                density="compact"
                :rules="[v => !!v || 'Category is required']"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <div class="text-caption text-medium-emphasis mb-1">
                Priority Level
              </div>
              <v-slider
                v-model="form.weight"
                :min="1"
                :max="20"
                :step="1"
                :disabled="form.category === 'hard'"
                :tick-labels="weightTickLabels"
                :ticks="weightTicks"
                :color="weightColor"
                :track-color="'grey-lighten-2'"
                hide-details
              >
                <template #append>
                  <v-chip size="small" :color="weightColor" variant="tonal" class="ms-2">
                    {{ weightLabel }}
                  </v-chip>
                </template>
              </v-slider>
            </v-col>
          </v-row>

          <v-text-field
            v-model="form.description"
            label="Description"
            variant="outlined"
            density="compact"
            class="mt-3"
          />

          <v-switch
            v-model="form.enabled"
            label="Enabled"
            color="primary"
            density="compact"
            class="mt-2"
            hide-details
          />

          <v-divider class="my-4" />

          <!-- Applies To (optional module / lecturer targeting) -->
          <h3 class="text-subtitle-2 font-weight-bold mb-2">Applies To (optional)</h3>
          <p class="text-caption text-medium-emphasis mb-3">
            Leave empty to apply to all modules. Add specific module IDs or names to scope this rule.
          </p>

          <div v-for="(_target, idx) in appliesToList" :key="idx" class="d-flex align-center ga-2 mb-2">
            <v-text-field
              v-model="appliesToList[idx]"
              label="Module ID or name"
              variant="outlined"
              density="compact"
              hide-details
              class="flex-grow-1"
            />
            <v-btn icon variant="text" size="small" color="error" @click="appliesToList.splice(idx, 1)">
              <v-icon>mdi-delete</v-icon>
            </v-btn>
          </div>

          <v-btn variant="tonal" prepend-icon="mdi-plus" size="small" @click="appliesToList.push('')">
            Add Target
          </v-btn>

          <v-divider class="my-4" />

          <!-- Params (key-value) -->
          <h3 class="text-subtitle-2 font-weight-bold mb-2">Parameters (optional)</h3>
          <p class="text-caption text-medium-emphasis mb-3">
            Key-value parameters specific to this constraint (e.g. dates, weekdays).
          </p>

          <div v-for="(_key, idx) in paramKeys" :key="idx" class="d-flex align-center ga-2 mb-2">
            <v-text-field
              v-model="paramKeys[idx]"
              label="Key"
              variant="outlined"
              density="compact"
              hide-details
              style="max-width: 180px"
            />
            <v-text-field
              v-model="paramValues[idx]"
              label="Value"
              variant="outlined"
              density="compact"
              hide-details
              class="flex-grow-1"
            />
            <v-btn icon variant="text" size="small" color="error" @click="removeParam(idx)">
              <v-icon>mdi-delete</v-icon>
            </v-btn>
          </div>

          <v-btn variant="tonal" prepend-icon="mdi-plus" size="small" @click="addParam">
            Add Parameter
          </v-btn>
        </v-form>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn color="primary" variant="flat" @click="submit">
          {{ isEdit ? 'Save' : 'Create' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { SchedulingRule } from '@/types/schedule'
import { emptySchedulingRule } from '@/composables/useSchedulingRules'

const CONSTRAINT_CATALOG = [
  { value: 'NO_TEACHER_OVERLAP', title: 'No Teacher Overlap', category: 'hard' },
  { value: 'ROOM_CAPACITY', title: 'Room Capacity', category: 'hard' },
  { value: 'ROOM_OCCUPANCY', title: 'Room Occupancy', category: 'hard' },
  { value: 'UNAVAILABLE_DATES', title: 'Unavailable Dates', category: 'hard' },
  { value: 'ALLOWED_WEEKDAYS', title: 'Allowed Weekdays', category: 'hard' },
  { value: 'ALLOWED_PHASE', title: 'Allowed Phase', category: 'hard' },
  { value: 'FIXED_DAY', title: 'Fixed Day', category: 'hard' },
  { value: 'WEEKLY_BALANCE', title: 'Weekly Balance', category: 'hard' },
  { value: 'AVOID_FRIDAY_AFTERNOON', title: 'Avoid Friday Afternoon', category: 'soft' },
  { value: 'AVOID_SATURDAY', title: 'Avoid Saturday', category: 'soft' },
  { value: 'PREFER_MORNING', title: 'Prefer Morning', category: 'soft' },
  { value: 'AVOID_EVENING', title: 'Avoid Evening', category: 'soft' },
  { value: 'MINIMIZE_STUDENT_GAPS', title: 'Minimize Student Gaps', category: 'soft' },
  { value: 'PREFER_EARLY_DATES', title: 'Prefer Early Dates', category: 'soft' },
] as const

const props = defineProps<{
  modelValue: boolean
  ruleData: SchedulingRule | null
  currentSemesterId: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save', payload: SchedulingRule): void
}>()

const isEdit = computed(() => !!props.ruleData?._id || !!props.ruleData?.id)

const form = ref<SchedulingRule>(JSON.parse(JSON.stringify(emptySchedulingRule)))
const appliesToList = ref<string[]>([])
const paramKeys = ref<string[]>([])
const paramValues = ref<string[]>([])

const constraintOptions = CONSTRAINT_CATALOG.map(c => ({
  title: c.title,
  value: c.value,
  category: c.category,
}))

const categoryOptions = [
  { title: 'Hard (must satisfy)', value: 'hard' },
  { title: 'Soft (preference/penalty)', value: 'soft' },
]

const WEIGHT_LEVELS = [
  { value: 1, label: 'Nice to have' },
  { value: 5, label: 'Preferred' },
  { value: 10, label: 'Desired' },
  { value: 20, label: 'Almost mandatory' },
] as const

const weightTicks = WEIGHT_LEVELS.map(l => l.value)
const weightTickLabels = ['', 'Nice to have', 'Preferred', 'Desired', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'Almost mandatory']

const weightLabel = computed(() => {
  const w = form.value.weight
  if (w <= 1) return 'Nice to have'
  if (w <= 5) return 'Preferred'
  if (w <= 10) return 'Desired'
  return 'Almost mandatory'
})

const weightColor = computed(() => {
  const w = form.value.weight
  if (w <= 1) return 'success'
  if (w <= 5) return 'info'
  if (w <= 10) return 'warning'
  return 'error'
})

const formRef = ref()

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    if (props.ruleData) {
      form.value = JSON.parse(JSON.stringify(props.ruleData))
      appliesToList.value = [...(props.ruleData.appliesTo || [])]
      const params = props.ruleData.params || {}
      paramKeys.value = Object.keys(params)
      paramValues.value = Object.keys(params).map(k => String(params[k] ?? ''))
    } else {
      form.value = JSON.parse(JSON.stringify(emptySchedulingRule))
      form.value.semesterId = props.currentSemesterId
      appliesToList.value = []
      paramKeys.value = []
      paramValues.value = []
    }
  }
})

watch(() => form.value.ruleType, (newId) => {
  const catalogEntry = CONSTRAINT_CATALOG.find(c => c.value === newId)
  if (catalogEntry) {
    form.value.category = catalogEntry.category as 'hard' | 'soft'
    if (catalogEntry.category === 'hard') {
      form.value.weight = 1
    } else {
      const defaultWeights: Record<string, number> = {
        AVOID_FRIDAY_AFTERNOON: 10,
        AVOID_SATURDAY: 5,
        PREFER_MORNING: 5,
        AVOID_EVENING: 10,
        MINIMIZE_STUDENT_GAPS: 5,
        PREFER_EARLY_DATES: 1,
      }
      form.value.weight = defaultWeights[newId] ?? 10
    }
    const descriptions: Record<string, string> = {
      NO_TEACHER_OVERLAP: 'A teacher cannot be assigned to overlapping sessions',
      ROOM_CAPACITY: 'Room capacity must accommodate expected students',
      ROOM_OCCUPANCY: 'A room cannot be double-booked in the same time slot',
      UNAVAILABLE_DATES: 'Specific dates are blocked for this module',
      ALLOWED_WEEKDAYS: 'Only certain weekdays are allowed',
      ALLOWED_PHASE: 'Only certain phases (main/final) are allowed',
      FIXED_DAY: 'Module is fixed to specific dates',
      WEEKLY_BALANCE: 'Min/max modules per calendar week',
      AVOID_FRIDAY_AFTERNOON: 'Prefer not to schedule on Friday afternoons',
      AVOID_SATURDAY: 'Prefer not to schedule on Saturdays',
      PREFER_MORNING: 'Prefer morning time slots',
      AVOID_EVENING: 'Prefer not to schedule evening slots',
      MINIMIZE_STUDENT_GAPS: 'Minimize gaps in student schedules',
      PREFER_EARLY_DATES: 'Prefer earlier dates in the semester',
    }
    if (!form.value.description || form.value.description === '') {
      form.value.description = descriptions[newId] || ''
    }
  }
})

function addParam() {
  paramKeys.value.push('')
  paramValues.value.push('')
}

function removeParam(idx: number) {
  paramKeys.value.splice(idx, 1)
  paramValues.value.splice(idx, 1)
}

function close() {
  emit('update:modelValue', false)
}

function submit() {
  const params: Record<string, unknown> = {}
  for (let i = 0; i < paramKeys.value.length; i++) {
    const key = paramKeys.value[i]?.trim()
    if (key) {
      let val: unknown = paramValues.value[i]
      if (typeof val === 'string') {
        try { val = JSON.parse(val as string) } catch { /* keep string value */ }
      }
      params[key] = val
    }
  }

  const result: SchedulingRule = {
    ...form.value,
    appliesTo: appliesToList.value.filter(t => t.trim()),
    params: Object.keys(params).length > 0 ? params : undefined,
  }

  if (result.category === 'hard') {
    result.weight = 1
  }

  emit('save', result)
  close()
}
</script>