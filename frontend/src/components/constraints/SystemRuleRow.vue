<template>
  <div class="rule-row">
    <div class="row-main">
      <span class="row-title">{{ def.id }}</span>
      <span :class="badgeClasses(def.category === 'hard')">{{ def.category === 'hard' ? 'Hart' : 'Weich' }}</span>
      <span class="chip-system">Systemregel</span>
    </div>
    <div class="row-desc">{{ def.description }}</div>
  </div>
</template>

<script setup lang="ts">
import type { CatalogConstraintLike } from '@/utils/constraintUx'
import { badgeClasses } from '@/utils/constraintUx'

defineProps<{
  def: CatalogConstraintLike
}>()
</script>

<style scoped>
.row-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.row-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--cw-text);
}
.row-desc {
  font-size: 12.5px;
  color: var(--cw-text2);
  margin-top: 2px;
}
.chip-system {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--cw-badge-new-bg);
  color: var(--cw-badge-new-text);
}
</style>
