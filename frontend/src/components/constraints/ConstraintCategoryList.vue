<template>
  <div>
    <div class="cat-list">
      <div
        class="cat-item"
        :class="{ active: modelValue === ('all' as const) }"
        role="button" tabindex="0"
        @click="select('all')"
        @keydown.enter.prevent="select('all')"
      >
        Alle Regeln <span class="count">{{ countFor('all') }}</span>
      </div>
      <div
        v-for="c in categories"
        :key="c.id"
        class="cat-item"
        :class="{ active: modelValue === c.id }"
        role="button" tabindex="0"
        @click="select(c.id)"
        @keydown.enter.prevent="select(c.id)"
      >
        {{ c.label }} <span class="count">{{ countFor(c.id) }}</span>
      </div>
    </div>

    <!-- Spec Fix 1 — echter zweiter Filter "Hart/Weich" (Pill-Gruppe, kombinierbar
         mit der Kategorie). Vorher Text-Badges ohne Funktion im Header. -->
    <div class="pill-group mt-3">
      <button
        v-for="h in HARDNESS_OPTIONS"
        :key="h.value"
        class="pill"
        :class="{ active: hardness === h.value }"
        type="button"
        @click="selectHardness(h.value)"
      >
        {{ h.label }} <span class="pill-count">{{ hardnessCounts[h.value] ?? 0 }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ConstraintCategoryId } from '@/utils/constraintUx'

const modelValue = defineModel<ConstraintCategoryId | 'all'>()
const hardness = defineModel<'all' | 'hard' | 'soft'>('hardness')

const HARDNESS_OPTIONS: Array<{ value: 'all' | 'hard' | 'soft'; label: string }> = [
  { value: 'all', label: 'Alle' },
  { value: 'hard', label: 'Hart' },
  { value: 'soft', label: 'Weich' },
]

defineProps<{
  categories: Array<{ id: ConstraintCategoryId; label: string }>
  countFor: (id: string) => number
  hardnessCounts: Record<string, number>
}>()

function select(id: ConstraintCategoryId | 'all'): void {
  modelValue.value = id
}
function selectHardness(value: 'all' | 'hard' | 'soft'): void {
  hardness.value = value
}
</script>

<style scoped>
.cat-list { display: flex; flex-direction: column; gap: 4px; }
.cat-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13.5px;
  color: var(--cw-text);
}
.cat-item:hover { background: rgba(43, 110, 99, 0.08); }
.cat-item.active { background: var(--cw-accent); color: #fff; }
.count { font-size: 12px; opacity: 0.75; }

/* Pill-Gruppe Hart/Weich — wie der Screenshot-Entwurf */
.pill-group { display: flex; gap: 6px; flex-wrap: wrap; }
.pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid var(--cw-border, #e3dfd3);
  background: transparent;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--cw-text2, #63665f);
  cursor: pointer;
}
.pill:hover { border-color: var(--cw-accent, #2b6e63); color: var(--cw-accent, #2b6e63); }
.pill.active {
  border-color: var(--cw-accent, #2b6e63);
  background: var(--cw-accent, #2b6e63);
  color: #fff;
}
.pill-count { font-size: 11.5px; opacity: 0.8; }
</style>
