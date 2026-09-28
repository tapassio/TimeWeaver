<template>
  <div
    class="block-chip"
    :class="[`block--${block.status ?? 'planned'}`, { 'block--conflict': conflictCount > 0, 'block--selected': selectedBlock }]"
    :title="conflictList.join(', ')"
    @mousedown="onMouseDown"
  >
    <div class="block-title d-flex align-center justify-space-between" @click.stop="emit('select-block')">
      <span>{{ moduleTitle }}<span v-if="roomLabel" class="ms-1 text-caption">({{ roomLabel }})</span></span>
      <v-btn v-if="!dense" icon="mdi-delete" size="x-small" variant="text" @mousedown.stop @click.stop="emit('clear-slot')" />
    </div>
    <span v-if="block.status === 'planned'" class="block-slot text-warning">(unbestätigt)</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ContactBlock } from '@/composables/usePlanning'

const props = defineProps<{
  block: ContactBlock
  moduleTitle: string
  conflictEntries?: Set<string>
  dense?: boolean
  /** Auswahl-Status für den Klick-Modus (Chip → Zelle) */
  selectedBlock?: boolean
  /** Raum-Label — optional; zeigt Raum-Nr (z.B. E102) explizit in der Kachel wenn gesetzt */
  roomLabel?: string
}>()

const emit = defineEmits<{
  'clear-slot': []
  'select-block': []
  /** Pointer-Drag: mousedown am Chip (kein HTML5-Drag — zuverlässiger in Tabellen) */
  'pointer-drag-start': [evt: MouseEvent]
}>()

function onMouseDown(evt: MouseEvent): void {
  if (evt.button !== 0) return
  emit('pointer-drag-start', evt)
}

const conflictList = computed<string[]>(() => (props.conflictEntries ? [...props.conflictEntries] : []))
const conflictCount = computed(() => conflictList.value.length)

</script>

<style scoped>
.block-chip {
  background: rgba(25, 118, 210, 0.08);
  border: 1px solid rgba(25, 118, 210, 0.35);
  border-radius: 6px;
  padding: 3px 6px;
  margin: 2px 0;
  font-size: 11px;
  line-height: 1.25;
  cursor: grab;
  user-select: none;
}
.block-chip:active { cursor: grabbing; }
.block--confirmed { background: rgba(46, 125, 50, 0.12); border-color: #43a047; }
.block--planned { background: rgba(237, 108, 2, 0.08); border-color: #f9a825; }
.block--conflict { border-color: var(--v-theme-error); border-width: 2px; }
.block-title { font-weight: 600; font-size: 11.5px; cursor: pointer; }
.block-chip.block--selected { outline: 2px solid #1976d2 !important; }
</style>
