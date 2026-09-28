<template>
  <v-dialog :model-value="modelValue" max-width="500" scrollable persistent @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-item class="bg-primary text-white py-3">
        <template #prepend>
          <v-icon icon="mdi-calendar-clock" size="large" class="me-2" />
        </template>
        <v-card-title class="text-h6 font-weight-medium">{{ isEdit ? 'Edit Availability' : 'Add Availability' }}</v-card-title>
        <v-card-subtitle class="text-white text-opacity-80">
          Define a weekly availability slot
        </v-card-subtitle>
        <template #append>
          <v-btn icon="mdi-close" variant="text" density="comfortable" @click="close" />
        </template>
      </v-card-item>

      <v-card-text class="pa-4 pa-sm-6">
        <v-form ref="formRef" @submit.prevent="submit">
          <v-select
            v-model="form.weekId"
            :items="weekItems"
            item-title="title"
            item-value="value"
            label="Week"
            variant="outlined"
            density="compact"
            clearable
            class="mb-2"
          />
          <v-select
            v-model="form.weekday"
            :items="weekdayItems"
            item-title="title"
            item-value="value"
            label="Day"
            variant="outlined"
            density="compact"
            class="mb-2"
          />
          <v-text-field
            v-model="form.startTime"
            label="Start Time"
            type="time"
            variant="outlined"
            density="compact"
            class="mb-2"
          />
          <v-text-field
            v-model="form.endTime"
            label="End Time"
            type="time"
            variant="outlined"
            density="compact"
          />
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
import type { LecturerAvailability } from '@/types/schedule'
import { WEEKDAY_LABELS, WEEKDAY_OPTIONS } from '@/types/schedule'
import type { Week } from '@/types/week'
import { emptyLecturerAvailability } from '@/composables/useAvailability'

const props = defineProps<{
  modelValue: boolean
  availabilityData: LecturerAvailability | null
  currentUserId: string
  weeks: Week[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save', payload: LecturerAvailability): void
}>()

const isEdit = computed(() => !!props.availabilityData?._id || !!props.availabilityData?.id)

const form = ref<LecturerAvailability>(JSON.parse(JSON.stringify(emptyLecturerAvailability)))

const formRef = ref()

const weekdayItems = WEEKDAY_OPTIONS.map(wd => ({ title: WEEKDAY_LABELS[wd], value: wd }))

const weekItems = computed(() =>
  (props.weeks || [])
    .map(w => ({ title: `Week ${w.semesterWeek} (${w.startDate}–${w.endDate})`, value: w.id || w._id }))
    .filter(w => w.value)
)

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    if (props.availabilityData) {
      form.value = JSON.parse(JSON.stringify(props.availabilityData))
    } else {
      form.value = {
        ...JSON.parse(JSON.stringify(emptyLecturerAvailability)),
        lecturerId: props.currentUserId,
      }
    }
  }
})

function close() {
  emit('update:modelValue', false)
}

function submit() {
  if (!props.availabilityData?._id && !props.availabilityData?.id) {
    form.value.lecturerId = props.currentUserId
  }
  emit('save', JSON.parse(JSON.stringify(form.value)))
  close()
}
</script>