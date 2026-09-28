<template>
  <div class="fields">
    <div class="d-flex align-center mb-2">
      <v-text-field
        v-model="newDate"
        label="Datum (YYYY-MM-DD)"
        variant="outlined" density="compact" hide-details="auto"
        style="max-width: 200px"
        @keydown.enter.prevent="addDate"
      />
      <v-btn class="ms-2" variant="tonal" color="primary" @click="addDate">Hinzufügen</v-btn>
    </div>
    <div class="d-flex flex-wrap">
      <v-chip v-for="d in dates" :key="d" closable class="ma-1" @click:close="removeDate(d)">
        {{ d }}
      </v-chip>
      <span v-if="dates.length === 0" class="hint text-medium-emphasis">Noch keine Daten gesperrt.</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const emit = defineEmits<{ 'update:valid': [value: boolean] }>()

const modelValue = defineModel<{ dates?: string[] }>()
const dates = ref<string[]>(Array.from(modelValue.value?.dates ?? []))
const newDate = ref('')

watch(modelValue, (v) => {
  if (JSON.stringify(v?.dates ?? []) !== JSON.stringify(dates.value)) {
    dates.value = [...(v?.dates ?? [])]
  }
}, { deep: true })

watch(dates, (d) => {
  modelValue.value = { dates: [...d] }
  emit('update:valid', d.length > 0)
}, { deep: true })

function removeDate(d: string): void {
  dates.value = dates.value.filter(x => x !== d)
}

function addDate(): void {
  const iso = newDate.value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return
  if (dates.value.includes(iso)) return
  dates.value = [...dates.value, iso]
  newDate.value = ''
}
</script>
