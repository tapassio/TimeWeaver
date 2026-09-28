<template>
  <div>
    <v-text-field
      v-model.number="studentsModel"
      type="number" min="1"
      label="Mindest-Raumkapazität (Teilnehmende)"
      hint="Der Solver vergleicht gegen room.capacity — Räume kommen aus /api/rooms"
      persistent-hint
      variant="outlined" density="compact"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'

const emit = defineEmits<{ 'update:valid': [value: boolean] }>()

const modelValue = defineModel<{ students?: number }>()

const studentsModel = computed<number>({
  get: () => Number(modelValue.value?.students ?? 10),
  set: (v) => { modelValue.value = { students: Number(v) } },
})

watch(modelValue, (v) => {
  const n = (v?.students ?? 0) || 0
  emit('update:valid', n > 0)
  if (n < 1) modelValue.value = { students: 10 }
}, { deep: true })
</script>
