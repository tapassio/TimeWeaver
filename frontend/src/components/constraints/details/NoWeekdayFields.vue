<template>
  <div class="fields">
    <div class="d-flex flex-wrap ga-2">
      <v-checkbox
        v-for="(lbl, idx) in dayOptions"
        :key="lbl"
        v-model="selected"
        :label="lbl"
        :value="idx"
        density="compact" hide-details
      />
    </div>
    <div v-if="selected.length === 0" class="hint text-warning">Mindestens ein Wochentag muss erlaubt bleiben.</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const emit = defineEmits<{ 'update:valid': [value: boolean] }>()

const dayOptions = ['Donnerstag', 'Freitag', 'Samstag', 'Montag', 'Dienstag', 'Mittwoch']
const selected = ref<number[]>([0, 1, 2])

const modelValue = defineModel<{ weekdays?: string[] }>()

watch(selected, (indices) => {
  modelValue.value = { weekdays: indices.map(idx => dayOptions[idx] ?? '') }
  emit('update:valid', indices.length > 0)
}, { immediate: true })

watch(modelValue, (v) => {
  if (!v?.weekdays?.length && selected.value.length) return
  const indices = (v?.weekdays ?? []).map(d => dayOptions.indexOf(d)).filter(i => i >= 0)
  if (JSON.stringify(indices) !== JSON.stringify(selected.value)) selected.value = indices
}, { immediate: true, deep: true })

watch(selected, (d) => {
  emit('update:valid', d.length > 0)
}, { immediate: true })
</script>
