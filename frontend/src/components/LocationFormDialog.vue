<template>
  <v-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" max-width="500" persistent>
    <v-card>
      <v-card-title>{{ isEdit ? 'Edit Location' : 'Add Location' }}</v-card-title>
      <v-card-text>
        <v-form ref="formRef" @submit.prevent="submit">
          <v-text-field v-model="location.name" label="Name *" :rules="[v => !!v || 'Name is required']" />
          <v-text-field v-model="location.campus" label="Campus" />
          <v-text-field v-model="location.building" label="Building *" :rules="[v => !!v || 'Building is required']" />
          <v-text-field v-model="location.address" label="Address" />
          <v-text-field v-model="latInput" label="Latitude" type="number" />
          <v-text-field v-model="lngInput" label="Longitude" type="number" />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="$emit('update:modelValue', false)">Cancel</v-btn>
        <v-btn color="primary" variant="flat" @click="submit">{{ isEdit ? 'Save' : 'Add' }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Location } from '@/types/location'

const props = defineProps<{
  modelValue: boolean
  locationData?: Location
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'save': [location: Location]
}>()

const isEdit = computed(() => !!props.locationData?.id)

const formRef = ref()
const location = ref<Location>(emptyLocation())

function emptyLocation(): Location {
  return { name: '', building: '' }
}

watch(() => props.modelValue, (val) => {
  if (val) {
    location.value = props.locationData
      ? JSON.parse(JSON.stringify(props.locationData))
      : emptyLocation()
  }
})

const latInput = computed({
  get: () => location.value.latitude != null ? String(location.value.latitude) : '',
  set: (v: string) => { location.value.latitude = v ? Number(v) : undefined },
})

const lngInput = computed({
  get: () => location.value.longitude != null ? String(location.value.longitude) : '',
  set: (v: string) => { location.value.longitude = v ? Number(v) : undefined },
})

async function submit() {
  const { valid } = await formRef.value?.validate() ?? { valid: false }
  if (!valid) return
  emit('save', JSON.parse(JSON.stringify(location.value)))
  emit('update:modelValue', false)
}
</script>