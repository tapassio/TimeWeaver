<template>
  <div>
    <!-- Relation: Benötigt / Verboten / Bevorzugt / Ungewünscht -->
    <label class="caption-label">Relation</label>
    <div class="relation-pills mb-3">
      <button
        v-for="r in RELATIONS"
        :key="r.value"
        type="button"
        class="relation-pill"
        :class="{ active: v.relation === r.value, soft: !r.hard }"
        @click="setValue({ relation: r.value })"
      >
        {{ r.label }}
      </button>
    </div>

    <!-- Tag: Combobox (Autocomplete aus bereits verwendeten Tags + Freitext) — sonst
         entstehen schnell Schreibvarianten (online-fähig vs Online-fähig vs. online),
         die beim Solver als unterschiedliche Tags (Kap. 11.2) ankommen und die Regel
         wirkungslos machen. -->
    <label class="caption-label">Tag</label>
    <v-combobox
      :model-value="v.tag"
      :items="usedTags ?? []"
      variant="outlined"
      density="compact"
      label="Tag (z.B. online-fähig)"
      auto-select-first
      :clearable="true"
      class="mb-3"
      @update:model-value="(t: unknown) => setValue({ tag: typeof t === 'string' ? t : String(t ?? '') })"
    />

    <!-- Zielmodul: gemäss TagRuleValue-Spec Teil der Tag-Regel selbst -->
    <label class="caption-label">Zielmodul</label>
    <v-select
      :model-value="v.targetModuleId"
      :items="moduleOptions"
      variant="outlined" density="compact"
      label="Modul"
      @update:model-value="setValue({ targetModuleId: String($event) })"
    />

    <p class="hint text-medium-emphasis">
      Tag-Regeln greifen über die Kap.-11.2-Generalisierung: REQUIRED / PROHIBITED_DAY_TAGS
      (hart) und PREFERRED / UNDESIRED_DAY_TAGS (weich).
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import type { TagRelation, TagRuleValue } from '@/utils/constraintUx'
import { TAG_RELATION_META } from '@/utils/constraintUx'

const props = defineProps<{
  moduleOptions: Array<{ value: string; title: string }>
  /** Autocomplete-Quelle: bereits verwendete Tags (über alle Module gesammelt) */
  usedTags?: string[]
}>()

const value = defineModel<TagRuleValue>()
const emit = defineEmits<{ 'update:valid': [value: boolean]; 'update:moduleId': [v: string] }>()

/** Template-sicherer Zugriff: undefined-Modelle → Default-Felder */
const v = computed<TagRuleValue>(() => ({
  relation: value.value?.relation ?? 'required',
  tag: value.value?.tag ?? '',
  targetModuleId: value.value?.targetModuleId ?? props.moduleOptions[0]?.value ?? '',
}))

const RELATIONS: Array<{ value: TagRelation; label: string; hard: boolean }> =
  (Object.keys(TAG_RELATION_META) as TagRelation[])
    .map((x) => ({ value: x, label: TAG_RELATION_META[x].label, hard: TAG_RELATION_META[x].hard }))

function setValue(patch: Partial<TagRuleValue>): void {
  value.value = { ...v.value, ...patch }
  if (patch.targetModuleId) emit('update:moduleId', patch.targetModuleId)
}

/*ת Legacy-Parameter {tags:[...]} → {tag} normalisieren */
watch(value, (q) => {
  if (q && (q as any).tags && !q.tag) {
    setValue({ relation: ((q as any).relation ?? 'required') as TagRelation, tag: String((q as any).tags?.[0] ?? '') })
  }
}, { immediate: true })

watch(() => [value.value?.relation, value.value?.tag, value.value?.targetModuleId], () => {
  emit('update:valid', Boolean(value.value?.relation && value.value?.tag && value.value?.targetModuleId))
}, { deep: true })
</script>

<style scoped>
.caption-label {
  display: block;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--cw-text2);
  margin-bottom: 2px;
}
.relation-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.relation-pill {
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid var(--cw-border, #e3dfd3);
  background: #fff;
  font-size: 12.5px;
  cursor: pointer;
}
.relation-pill:hover { border-color: var(--cw-accent); color: var(--cw-accent); }
.relation-pill.active {
  border-color: var(--cw-accent);
  background: var(--cw-accent);
  color: #fff;
}
.relation-pill.active.soft { background: #c6603f; border-color: #c6603f; }
.hint { font-size: 12px; margin-top: 6px; }
</style>
