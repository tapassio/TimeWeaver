<template>
  <div
    class="type-card"
    :class="{ selected: !!modelValue }"
    role="button" tabindex="0"
    @click="$emit('select')"
    @keydown.enter.prevent="$emit('select')"
  >
    <div class="d-flex align-center justify-space-between">
      <span class="name">{{ def.name }}</span>
      <span :class="badgeClasses(def.hard)">{{ def.hard ? 'Hart' : 'Weich' }}</span>
    </div>
    <div class="desc">{{ def.desc }}</div>
  </div>
</template>

<script setup lang="ts">
import type { ConstraintTypeDef } from '@/utils/constraintUx'
import { badgeClasses } from '@/utils/constraintUx'

defineProps<{
  def: ConstraintTypeDef
  modelValue: boolean
}>()

defineEmits<{ select: [] }>()
</script>

<style scoped>
.Type-card,
.type-card {
  border: 1px solid var(--cw-border);
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
  background: var(--cw-panel);
  min-width: 230px;
}
.type-card:hover {
  border-color: var(--cw-accent);
}
.type-card.selected {
  border-color: var(--cw-accent);
  outline: 1px solid var(--cw-accent);
  background: rgba(43, 110, 99, 0.06);
}
.name {
  font-size: 13px;
  font-weight: 600;
}
.desc {
  font-size: 12px;
  color: var(--cw-text2);
  margin-top: 4px;
}
</style>
