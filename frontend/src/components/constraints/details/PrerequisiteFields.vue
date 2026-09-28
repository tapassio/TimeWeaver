<template>
  <div>
    <v-select
      v-model="targetFromModules"
      :items="moduleOptions"
      label="Vorausgesetztes Modul"
      variant="outlined" density="compact" class="mb-2"
    />
    <p class="hint text-medium-emphasis">
      Alle On-Campus-Days dieses Moduls werden zwingend vor dem abhängigen Modul geplant
      (Hard-Constraint MODULE_PREREQUISITE_ORDER).
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'

const props = defineProps<{
  moduleOptions: Array<{ value: string; title: string }>
  moduleId: string
}>()

const emit = defineEmits<{ 'update:valid': [value: boolean] }>()

const modelValue = defineModel<{ targetModuleId?: string }>()

watch(modelValue, (v) => {
  emit('update:valid', !!v?.targetModuleId && v.targetModuleId !== props.moduleId)
}, { immediate: true, deep: true })

const targetFromModules = computed({
  get: () => modelValue.value?.targetModuleId ?? '',
  set: (v) => { modelValue.value = { ...modelValue.value, targetModuleId: v } },
})

const moduleOptions = computed(() =>
  props.moduleOptions.filter(m => m.value !== props.moduleId),
)
</script>
