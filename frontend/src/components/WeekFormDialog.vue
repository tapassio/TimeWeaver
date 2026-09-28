<template>
  <v-dialog :model-value="modelValue" max-width="500" scrollable persistent @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-item class="bg-primary text-white py-3">
        <template #prepend>
          <v-icon icon="mdi-calendar-week" size="large" class="me-2" />
        </template>
        <v-card-title class="text-h6 font-weight-medium">{{ isEdit ? 'Edit Week' : 'Add Week' }}</v-card-title>
        <v-card-subtitle class="text-white text-opacity-80">
          Define a calendar week within a semester
        </v-card-subtitle>
        <template #append>
          <v-btn icon="mdi-close" variant="text" density="comfortable" @click="close" />
        </template>
      </v-card-item>

      <v-card-text class="pa-4 pa-sm-6">
        <v-form ref="formRef" @submit.prevent="submit">
          <v-select
            v-model="form.semesterId"
            :items="semesterItems"
            item-title="title"
            item-value="value"
            label="Semester *"
            :rules="[v => !!v || 'Semester is required']"
            variant="outlined"
            density="compact"
            class="mb-3"
          />

          <v-text-field
            v-model.number="form.semesterWeek"
            label="Semester Week *"
            variant="outlined"
            density="compact"
            type="number"
            min="1"
            :rules="[v => v >= 1 || 'Must be 1 or more']"
            placeholder="e.g. 1"
            class="mb-3"
          />

          <v-text-field
            v-model="form.startDate"
            label="Start Date *"
            type="date"
            variant="outlined"
            density="compact"
            :rules="[v => !!v || 'Start date is required']"
            class="mb-3"
          />

          <v-text-field
            v-model="form.endDate"
            label="End Date *"
            type="date"
            variant="outlined"
            density="compact"
            :rules="[v => !!v || 'End date is required', v => !form.startDate || v >= form.startDate || 'End date must be after start date']"
            class="mb-3"
          />

          <div class="text-subtitle-2 font-weight-bold mb-2">Days Off</div>
          <div v-for="(_, idx) in form.daysOff" :key="idx" class="d-flex align-center ga-2 mb-2">
            <v-text-field
              v-model="form.daysOff![idx]"
              label="Date"
              type="date"
              variant="outlined"
              density="compact"
              hide-details
              style="max-width: 200px"
            />
            <v-btn icon variant="text" size="small" color="error" @click="form.daysOff!.splice(idx, 1)">
              <v-icon>mdi-delete</v-icon>
            </v-btn>
          </div>
          <v-btn variant="tonal" prepend-icon="mdi-plus" size="small" @click="addDayOff">
            Add Day Off
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
import type { Week } from '@/types/week'
import type { Semester } from '@/stores/curriculum'
import { emptyWeek } from '@/composables/useWeeks'

const props = defineProps<{
  modelValue: boolean
  weekData: Week | null
  semesters: Semester[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save', payload: Week): void
}>()

const isEdit = computed(() => !!props.weekData?._id || !!props.weekData?.id)

const form = ref<Week>(JSON.parse(JSON.stringify(emptyWeek())))
const formRef = ref()

const semesterItems = computed(() =>
  (props.semesters || []).map(s => ({
    title: s.name || s.code || 'Unnamed semester',
    value: s._id || s.id || '',
  })).filter(i => i.value)
)

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    if (props.weekData) {
      form.value = JSON.parse(JSON.stringify(props.weekData))
    } else {
      form.value = JSON.parse(JSON.stringify(emptyWeek()))
      if (!form.value.daysOff) form.value.daysOff = []
    }
  }
})

function addDayOff() {
  if (!form.value.daysOff) form.value.daysOff = []
  form.value.daysOff.push('')
}

function close() {
  emit('update:modelValue', false)
}

function submit() {
  if (!form.value.daysOff) form.value.daysOff = []
  form.value.daysOff = form.value.daysOff.filter(d => !!d)
  emit('save', JSON.parse(JSON.stringify(form.value)))
  close()
}
</script>