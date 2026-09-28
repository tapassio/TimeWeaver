<template>
  <v-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" max-width="500" persistent>
    <v-card>
      <v-card-item class="bg-primary text-white py-3">
        <template #prepend>
          <v-icon icon="mdi-school-outline" size="large" class="me-2" />
        </template>
        <v-card-title class="text-h6 font-weight-medium">{{ isEdit ? 'Edit Semester' : 'Add Semester' }}</v-card-title>
        <v-card-subtitle class="text-white text-opacity-80">
          Define a semester period for scheduling
        </v-card-subtitle>
        <template #append>
          <v-btn icon="mdi-close" variant="text" density="comfortable" @click="close" />
        </template>
      </v-card-item>

      <v-card-text class="pa-4 pa-sm-6">
        <v-form ref="formRef" @submit.prevent="submit">
          <v-text-field
            v-model="form.name"
            label="Name *"
            variant="outlined"
            density="compact"
            :rules="[v => !!v || 'Name is required']"
            placeholder="e.g. HS2026, FS2027"
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

          <v-text-field
            v-model="form.code"
            label="Code"
            variant="outlined"
            density="compact"
            placeholder="e.g. HS2026"
            class="mb-3"
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
import type { Semester } from '@/stores/curriculum'
import { emptySemester } from '@/composables/useSemesters'

const props = defineProps<{
  modelValue: boolean
  semesterData: Semester | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save', payload: Semester): void
}>()

const isEdit = computed(() => !!props.semesterData?._id || !!props.semesterData?.id)

const form = ref<Semester>(JSON.parse(JSON.stringify(emptySemester)))
const formRef = ref()

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    if (props.semesterData) {
      form.value = JSON.parse(JSON.stringify(props.semesterData))
    } else {
      form.value = JSON.parse(JSON.stringify(emptySemester))
    }
  }
})

function close() {
  emit('update:modelValue', false)
}

function submit() {
  emit('save', JSON.parse(JSON.stringify(form.value)))
  close()
}
</script>