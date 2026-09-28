<template>
  <div class="mandatory-list">
    <label class="text-subtitle-2 font-weight-bold">Pflichtfelder</label>
    <p class="hint text-medium-emphasis mb-2">
      Diese Angaben braucht CourseWeaver, um die Datei eindeutig zuzuordnen:
    </p>
    <div v-for="f in fields" :key="f.name" class="field-row d-flex align-center ga-2 py-1">
      <v-icon size="small" :color="f.value ? 'success' : 'warning'">
        {{ f.value ? 'mdi-check-circle' : 'mdi-alert-outline' }}
      </v-icon>
      <div style="min-width: 0">
        <div class="text-body-2 font-weight-medium">{{ f.name }}</div>
        <div class="text-caption text-medium-emphasis" style="max-width: 280px">{{ f.why }}</div>
      </div>
      <v-select
        v-if="!f.value"
        class="ms-auto"
        style="max-width: 240px"
        label="Wert zuordnen"
        :items="columnOptions"
        variant="underlined" density="compact" hide-details="auto"
        @update:model-value="$emit('resolve', { name: f.name, value: String($event ?? '') })"
      />
      <span v-else class="ms-auto source resolved-chip text-caption d-flex align-center" style="color: var(--cw-accent, #2b6e63)">
        <v-icon size="small" class="me-1" color="success">mdi-check-circle</v-icon>
        <span>{{ f.sourceText ?? f.value }}</span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  fields: Array<{ name: string; why: string; value: string | null; sourceText?: string }>
  columnOptions?: string[]
}>()

defineEmits<{ resolve: [payload: { name: string; value: string }] }>()
</script>
