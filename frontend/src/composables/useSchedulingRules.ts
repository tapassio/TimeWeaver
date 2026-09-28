import { ref } from 'vue'
import { usePostgres, EntityTables } from '@/composables/usePostgres'
import type { SchedulingRule } from '@/types/schedule'

export const emptySchedulingRule: SchedulingRule = {
  ruleType: '',
  category: 'hard',
  weight: 1,
  enabled: true,
  description: '',
  params: {},
  appliesTo: [],
  semesterId: '',
}

export function useSchedulingRules() {
  const { fetchEntities, createEntity, updateEntity: updateDbEntity, removeEntity: removeDbEntity } = usePostgres()
  const rules = ref<SchedulingRule[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchRules() {
    loading.value = true
    error.value = null
    try {
      rules.value = await fetchEntities<SchedulingRule>(EntityTables.SCHEDULING_RULE)
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function addRule(rule: SchedulingRule) {
    loading.value = true
    error.value = null
    try {
      const normalized: SchedulingRule = { ...rule }
      const created = await createEntity<SchedulingRule>(EntityTables.SCHEDULING_RULE, normalized)
      rules.value.push(created)
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function updateRule(rule: SchedulingRule) {
    const id = rule._id || rule.id
    if (!id) return
    loading.value = true
    error.value = null
    try {
      await updateDbEntity(EntityTables.SCHEDULING_RULE, id, rule)
      const idx = rules.value.findIndex(r => (r._id || r.id) === id)
      if (idx !== -1) rules.value[idx] = { ...rule, _id: id, id }
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function removeRule(id: string) {
    loading.value = true
    error.value = null
    try {
      await removeDbEntity(EntityTables.SCHEDULING_RULE, id)
      rules.value = rules.value.filter(r => (r._id || r.id) !== id)
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  return {
    rules,
    loading,
    error,
    fetchRules,
    addRule,
    updateRule,
    removeRule,
  }
}