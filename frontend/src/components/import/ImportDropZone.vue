<template>
  <div
    class="import-dropzone pa-6 text-center rounded-lg"
    :class="{ 'drop-active': dragging }"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
    @click="inputEl?.click()"
  >
    <input
      ref="inputEl"
      type="file"
      class="d-none"
      multiple
      accept=".csv,.xlsx,.xls,.xlsm,text/csv,text/plain"
      @change="$emit('files', Array.from(($event.target as HTMLInputElement).files ?? []))"
    />
    <v-icon size="40" color="primary" class="mb-2">mdi-cloud-upload-outline</v-icon>
    <div class="text-body-1 font-weight-medium">
      Excel- oder CSV-Dateien hier ablegen oder anklicken
    </div>
    <div class="text-caption text-medium-emphasis mt-1">
      Mehrere Dateien gleichzeitig möglich — der Typ wird pro Datei automatisch erkannt
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{ files: [files: File[]] }>()

const dragging = ref(false)
const inputEl = ref<HTMLInputElement>()

function onDrop(evt: DragEvent): void {
  dragging.value = false
  const files = Array.from(evt.dataTransfer?.files ?? [])
  if (files.length) emit('files', files)
}
</script>

<style scoped>
.dropzone,
.drop-active {
  border: 1px dashed var(--cw-border, #e3dfd3);
  cursor: pointer;
}
.drop-active {
  border-color: var(--cw-accent, #2b6e63);
  background: rgba(43, 110, 99, 0.06);
}
</style>
