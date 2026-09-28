<template>
  <div>
    <v-slider
      v-model="weightModel"
      :min="1" :max="20" :step="1"
      label="Gewicht"
      thumb-label="always"
      density="compact" hide-details
    />
    <p class="hint text-medium-emphasis">
      Weiche Regel: der Verstoß verursacht {{ weightModel }} Strafpunkte in der Objective-Funktion.
      Harte Grenzen bleiben immer erzwungen.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'

const emit = defineEmits<{ 'update:valid': [value: boolean] }>()

const modelValue = defineModel<{ weight?: number }>()
const weightModel = computed<number>({
  get: () => Number(modelValue.value?.weight ?? 10),
  set: (v) => { modelValue.value = { weight: v } },
})

watch(modelValue, (v) => {
  const w = Number(v?.weight)
  emit('update:valid', Number.isFinite(w) && w > 0)
}, { immediate: true, deep: true })
</script>
