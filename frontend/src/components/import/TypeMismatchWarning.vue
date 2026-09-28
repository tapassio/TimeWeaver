<template>
  <v-alert variant="tonal" density="compact" class="mb-2 mismatch-box">
    <div>
      <b>Achtung:</b> Die Datei sieht eher nach
      <b>{{ suggestedLabel }}</b> aus als nach <b>{{ chosenLabel }}</b>.
    </div>
    <div class="d-flex align-center ga-2 mt-1">
      <v-btn size="x-small" variant="tonal" color="warning" @click="$emit('switch')">
        Wechseln
      </v-btn>
      <v-btn size="x-small" variant="text" @click="$emit('keep')">Trotzdem behalten</v-btn>
    </div>
  </v-alert>
</template>

<script setup lang="ts">
defineProps<{
  chosenLabel: string
  suggestedLabel: string
}>()

defineEmits<{ switch: []; keep: [] }>()
</script>

<style scoped>
.mismatch-box {
  background: #fdf3e4;
  border: 1px solid #f0ddb8;
  color: #7a5a16;
}
.mismatch-box :deep(.v-alert__underlay) {
  opacity: 0;
}
</style>
