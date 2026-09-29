<template>
  <v-container fluid>
    <div class="view-hero">
      <div class="d-flex align-center justify-space-between flex-wrap ga-3">
        <div>
          <h1 class="text-h4 font-weight-bold">Constraints</h1>
          <div class="text-body-2 opacity-90">
            Regel-Erfassung: hart-/weiche Regeln für Module und Programm — Kategorien (aus den
            Regeltypen abgeleitet), Hart/Weich-Pill-Filter und Inline-Bearbeitung je Zeile.
          </div>
        </div>
  
      <v-btn color="rgba(255,255,255,0.22)" text-color="white" variant="flat" class="llm-button" @click="openDialog">
        + Neue Regel
      </v-btn>
    </div>
    </div>

    <v-alert v-if="loadError" type="error" variant="tonal" class="mb-4" closable>{{ loadError }}</v-alert>

    <v-row v-if="!loading">
      <!-- Sidebar: Kategorien (aus Regeltypen) + Hart/Weich-Pilz-Gruppe (zweiter Filter) -->
      <v-col cols="12" md="3">
        <ConstraintCategoryList
          v-model="selectedCategory"
          v-model:hardness="selectedHardness"
          :categories="derivedCategories"
          :count-for="(id: string) => countsFor[id] ?? 0"
          :hardness-counts="hardnessCounts"
        />
      </v-col>

      <v-col cols="12" md="9">
        <!-- Regelzeilen: jedes ist ein Akkordeon mit denselben Detailfeldern wie beim Anlegen -->
        <v-card variant="flat" class="pa-3 card-lift mb-4" v-if="visibleRules.length > 0">
          <ConstraintRow
            v-for="r in visibleRules"
            :key="r.id"
            :rule="r"
            :type-def="typeOf(r)"
            editable
            :module-options="moduleOptions"
            :used-tags="usedTags"
            @save="saveRow(r, $event)"
            @delete="removeRuleById(r.id)"
          />
        </v-card>
        <v-alert v-else variant="tonal" type="info" class="mb-4">
          In dieser Kombination sind zurzeit keine Regeln erfasst — „Neue Regel" nutzen.
        </v-alert>

        <h3 class="text-subtitle-1 font-weight-bold mt-6 mb-2">Unterstützende Regeln (im Solver erzwungen)</h3>
        <v-card variant="flat" class="pa-3 card-lift ">
          <SystemRuleRow v-for="sr in systemRulesList" :key="sr.id" :def="sr" />
          <div v-if="systemRulesList.length === 0" class="text-caption text-medium-emphasis pa-2">
            Katalog konnte nicht geladen werden.
          </div>
        </v-card>
      </v-col>
    </v-row>

    <NewConstraintDialog
      v-model="dialogOpen"
      :type-defs="typeDefs"
      :module-options="moduleOptions"
      :used-tags="usedTags"
      :editing="editingRule"
      :saving="saving"
      :rule-error="ruleError"
      @save="saveRule"
      @remove="removeRuleById"
    />
  </v-container>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConstraintCategoryList from '@/components/constraints/ConstraintCategoryList.vue'
import ConstraintRow from '@/components/constraints/ConstraintRow.vue'
import SystemRuleRow from '@/components/constraints/SystemRuleRow.vue'
import NewConstraintDialog from '@/components/constraints/NewConstraintDialog.vue'
import {
  TAG_RELATION_META,
  catalogToTypeDefs,
  categoriesFromTypeDefs,
  instancesFromModule,
  systemRules,
  type CatalogConstraintLike,
  type ConstraintCategoryId,
  type ConstraintInstance,
  type ConstraintTypeDef,
  type TagRelation,
} from '@/utils/constraintUx'

const loading = ref(false)
const loadError = ref<string | null>(null)
const saving = ref(false)
const ruleError = ref<string | null>(null)
const dialogOpen = ref(false)
const editingRule = ref<ConstraintInstance | null>(null)

const catalog = ref<Record<string, CatalogConstraintLike>>({})
const modules = ref<Array<Record<string, any>>>([])
const typeDefs = ref<ConstraintTypeDef[]>([])
const moduleRules = ref<ConstraintInstance[]>([])

/* Spec Fix — Kategorien werden aus den vorhandenen Regeltypen abgeleitet */
const derivedCategories = computed(() => categoriesFromTypeDefs(typeDefs.value))
const selectedCategory = ref<ConstraintCategoryId | 'all'>('all')
const selectedHardness = ref<'all' | 'hard' | 'soft'>('all')

function typeDefById(typeId: string): ConstraintTypeDef | null {
  return typeDefs.value.find(t => t.id === typeId) ?? null
}

/** Fallback für Legacy-Instanzen ohne passende Typ-Def (z. B. generic_soft) */
function safeTypeDef(rule: ConstraintInstance): ConstraintTypeDef {
  return typeDefById(rule.typeId) ?? {
    id: rule.typeId,
    catalogId: '',
    category: 'verteilung',
    name: rule.typeId,
    desc: 'Regel-Details siehe Modul-Assistent',
    hard: true,
  }
}
function typeOf(rule: ConstraintInstance): ConstraintTypeDef {
  return safeTypeDef(rule)
}

/* 2-Dimension-Filter: Kategorie AND Hart/Weich (kombinierbar, Spec Fix 1) */
const visibleRules = computed(() =>
  moduleRules.value.filter((r) => {
    const catOk = selectedCategory.value === 'all' || typeOf(r)?.category === selectedCategory.value
    const hardOk = selectedHardness.value === 'all' || typeOf(r)?.hard === (selectedHardness.value === 'hard')
    return catOk && hardOk
  }),
)

const countsFor = computed(() => {
  const counts: Record<string, number> = { all: moduleRules.value.length }
  for (const c of derivedCategories.value) {
    counts[c.id] = moduleRules.value.filter(r => typeOf(r)?.category === c.id).length
  }
  return counts
})

const hardnessCounts = computed(() => ({
  all: moduleRules.value.length,
  hard: moduleRules.value.filter(r => typeOf(r)?.hard).length,
  soft: moduleRules.value.filter(r => typeOf(r) && !typeOf(r)?.hard).length,
}))

/* Tag-Autocomplete: bereits verwendete Tags zusammen aus den Modul-Feldern (anti Schreibvarianten) */
const usedTags = computed(() => {
  const set = new Set<string>()
  for (const m of modules.value) {
    for (const relation of Object.keys(TAG_RELATION_META) as TagRelation[]) {
      const field = TAG_RELATION_META[relation].moduleField
      const arr = m?.[field]
      if (Array.isArray(arr)) for (const t of arr) if (typeof t === 'string' && t) set.add(t)
    }
  }
  return [...set]
})

const moduleOptions = computed(() =>
  modules.value.map((m) => ({
    value: String(m._id ?? m.id ?? ''),
    title: String(m.title ?? m.name ?? m._id ?? m.id ?? ''),
  })),
)

const systemRulesList = computed(() => systemRules(catalog.value))

async function load(): Promise<void> {
  loading.value = true
  loadError.value = null
  try {
    const [mods, catalogList] = await Promise.all([
      fetch('/api/modules').then(r => r.ok ? r.json() as Promise<any[]> : Promise.resolve([])),
      fetch('/api/timetable/constraints').then(r => r.ok ? r.json() as Promise<CatalogConstraintLike[]> : Promise.resolve([])),
    ])
    const catMap: Record<string, CatalogConstraintLike> = {}
    for (const c of catalogList) catMap[c.id] = c
    catalog.value = catMap
    typeDefs.value = catalogToTypeDefs(catMap)
    modules.value = mods
    moduleRules.value = mods.flatMap(m => instancesFromModule(m as any))
  } catch (e: any) {
    loadError.value = e.message || 'Fehler beim Laden'
  } finally {
    loading.value = false
  }
}

interface RuleSource {
  moduleId: string
  module: Record<string, any>
  restrictionIdx: number
}

function ruleSource(rule: ConstraintInstance): RuleSource | null {
  const [moduleId, , idxStr] = rule.id.split('::')
  const mod = modules.value.find(m => String(m._id ?? m.id) === moduleId)
  if (!mod) return null
  const idx = Number(idxStr)
  const items = (mod.restrictions ?? []) as unknown[]
  if (!items[idx]) return null
  return { moduleId: String(moduleId), module: mod, restrictionIdx: idx }
}

function openDialog(): void {
  editingRule.value = null
  dialogOpen.value = true
}

function editRule(rule: ConstraintInstance): void {
  editingRule.value = rule
  dialogOpen.value = true
}
void editRule

/* --------------------------- Löschen ------------------------------------ */

async function removeRuleById(instanceId: string): Promise<void> {
  const rule = moduleRules.value.find(r => r.id === instanceId)
  if (!rule) return
  editingRule.value = rule

  // 1) room_capacity (synthetisch): expectedStudents gehört zum Modul — nicht löschbar
  if (rule.typeId === 'room_capacity') {
    ruleError.value = 'Raum-Kapazität gehört zum Modul und ist nicht löschbar (im Akkordeon anpassen).'
    return
  }

  // 2) day_tags synthetisch: Tag aus dem zugehörigen Modul-Feld entfernen
  if (rule.typeId === 'day_tags' && rule.id.includes('::synthetic::')) {
    const tag = dayTagKey(rule)
    if (!tag) return
    const mod = modules.value.find(m => String(m._id ?? m.id) === rule.moduleId)
    if (!mod) return
    const relation = String((rule.params ?? {}).relation ?? 'required') as TagRelation
    const field = TAG_RELATION_META[relation].moduleField
    const tags = ((Array.isArray(mod[field]) ? mod[field] : []) as unknown[])
      .map(String)
      .filter(t => t !== tag)
    await applyModuleChange({ ...mod, [field]: tags })
    return
  }

  // 3) prerequisite synthetisch: Zielmodul aus prerequisiteModuleIds entfernen
  if (rule.typeId === 'prerequisite' && rule.id.includes('::synthetic::')) {
    const target = String((rule.params ?? {}).targetModuleId ?? '')
    const mod = modules.value.find(m => String(m._id ?? m.id) === rule.moduleId)
    if (!mod) return
    await applyModuleChange({ ...mod, prerequisiteModuleIds: existingWithout(mod, target) })
    return
  }

  // 4) Legacy-Restriction-Instanz: Eintrag aus restrictions[] entfernen
  const src = ruleSource(rule)
  if (!src) return
  const arr = [...((src.module.restrictions ?? []) as unknown[])]
  arr.splice(src.restrictionIdx, 1)
  await applyModuleChange({ ...src.module, restrictions: arr })
}

function existingWithout(mod: Record<string, any>, target: string): string[] {
  const existing = ((mod.prerequisiteModuleIds as string[] | undefined) ?? []).filter((t) => t !== target)
  return existing
}

/** Tag-Key / Legacy-Tag einer day_tags-Instanz bestimmen */
function dayTagKey(rule: ConstraintInstance): string {
  const p = rule.params ?? {}
  if (typeof p.tag === 'string' && p.tag) return p.tag
  if (Array.isArray(p.tags) && typeof p.tags[0] === 'string') return p.tags[0] as string
  const m = rule.id.match(/::synthetic::(.+)$/)
  return m ? m[1]! : ''
}

/** Relation der Instanz (synthetisch oder aus Legacy-Katalog-Id) */
/** Relation der Instanz (synthetisch oder aus Legacy-Katalog-Id) — RoomCapacity-Analogie */
function dayTagRelation(rule: ConstraintInstance): TagRelation {
  const p = (rule.params ?? {}) as Record<string, unknown>
  if (p.relation === 'required' || p.relation === 'prohibited' || p.relation === 'preferred' || p.relation === 'undesired') {
    return p.relation
  }
  const m = rule.id.match(/^(?:[^:]+)::(REQUIRED|PROHIBITED|PREFERRED|UNDESIRED)_DAY_TAGS/)
  const catalogId = m ? `${m[1]}_DAY_TAGS` : ''
  for (const relation of Object.keys(TAG_RELATION_META) as TagRelation[]) {
    if (TAG_RELATION_META[relation].catalogId === catalogId) return relation
  }
  return 'required'
}
void dayTagRelation

/* --------------------------- Speichern ---------------------------------- */

interface SavePayload {
  typeId: string
  moduleId: string
  params?: Record<string, unknown>
  weight?: number
}

function defCategory(catalogId: string): 'hard' | 'soft' {
  return catalog.value[catalogId] && (catalog.value[catalogId] as CatalogConstraintLike).category === 'hard'
    ? 'hard'
    : 'soft'
}

/** Inline-Akkordeon: denselben Save-Pfad wie der Dialog, mit bekannter Regel. */
async function saveRow(rule: ConstraintInstance, payload: SavePayload): Promise<void> {
  editingRule.value = rule
  await saveRule(payload, rule)
}

/** Kap Spec 8/11.2 — verschiedene Regeltypen schreiben an verschiedene Stellen:
 *  Restriction-Einträge vs. Modul-Felder (expectedStudents / dayTags / prerequisites). */
async function saveRule(payload: SavePayload, editing?: ConstraintInstance): Promise<void> {
  saving.value = true
  ruleError.value = null
  const edited = editing ?? editingRule.value
  const params = (payload.params ?? {}) as Record<string, unknown>
  try {
    // day_tags: Zielmodul kommt aus dem TagRuleValue selbst (Spec-Interface)
    const effectiveModuleId = payload.typeId === 'day_tags' && params.targetModuleId
      ? String(params.targetModuleId)
      : payload.moduleId
    const mod = modules.value.find(m => String(m._id ?? m.id) === effectiveModuleId)
    if (!mod) throw new Error('Modul nicht gefunden')

    /* --- room_capacity → expectedStudents --- */
    if (payload.typeId === 'room_capacity') {
      const students = Number(params.students)
      if (!Number.isFinite(students) || students < 1) throw new Error('Ungültige Kapazität')
      await applyModuleChange({ ...mod, expectedStudents: students })
      return
    }

    /* --- Kap. 11.2 day_tags → Modul-Felder requiredDayTags/prohibitedDayTags/... --- */
    if (payload.typeId === 'day_tags') {
      const relation = String(params.relation ?? 'required') as TagRelation
      const tag = String(params.tag ?? '').trim()
      if (!relation || !tag) throw new Error('Relation und Tag erforderlich')

      // altes Tag der bearbeiteten Regel entfernen (Synthetic oder Legacy-Restriction)
      let updated: Record<string, any> = { ...mod }
      if (edited) {
        if (edited.id.includes('::synthetic::')) {
          const oldTag = dayTagKey(edited)
          const oldRelation = String((edited.params ?? {}).relation ?? 'required') as TagRelation
          if (oldTag && TAG_RELATION_META[oldRelation]) {
            const oldField = TAG_RELATION_META[oldRelation].moduleField
            updated[oldField] = ((Array.isArray(updated[oldField]) ? updated[oldField] : []) as unknown[])
              .map(String)
              .filter((t) => t !== oldTag)
          }
        } else {
          // Legacy-Restriction-Instanz: Eintrag entfernen
          const src = ruleSource(edited)
          const srcModuleId = src?.moduleId ?? edited.moduleId
          const legacyMod = modules.value.find(m => String(m._id ?? m.id) === srcModuleId)
          if (legacyMod) {
            await applyModuleChange({
              ...legacyMod,
              restrictions: ((legacyMod.restrictions ?? []) as unknown[]).filter((_, i) => i !== src?.restrictionIdx),
              status: (legacyMod as any).status,
            })
          }
        }
      }
      const field = TAG_RELATION_META[relation].moduleField
      const current = ((Array.isArray(updated[field]) ? updated[field] : []) as unknown[]).map(String)
      if (!current.includes(tag)) updated = { ...updated, [field]: [...current, tag] }
      await applyModuleChange(updated)
      return
    }

    /* --- prerequisite → prerequisiteModuleIds --- */
    if (payload.typeId === 'prerequisite') {
      const target = String(params.targetModuleId ?? '')
      if (!target) throw new Error('Zielmodul ungültig')
      const oldTarget = edited?.params?.targetModuleId as string | undefined
      const existing = new Set<string>((mod.prerequisiteModuleIds as string[] | undefined) ?? [])
      if (oldTarget && edited) existing.delete(oldTarget)
      existing.add(target)
      await applyModuleChange({ ...mod, prerequisiteModuleIds: [...existing], status: (mod as any).status })
      return
    }

    /* --- generisch: restrictions[]-Eintrag --- */
    const catalogId = typeDefById(payload.typeId)?.catalogId
    if (!catalogId) throw new Error(`Unbekannter Regeltyp: ${payload.typeId}`)
    const category = defCategory(catalogId)
    if (category === 'soft' && !payload.weight) throw new Error('Gewicht erforderlich')
    const isEdit = edited != null
    const restrictions = [...((mod.restrictions ?? []) as any[])]
    if (isEdit) {
      const src = ruleSource(edited as ConstraintInstance)
      if (!src || src.moduleId !== payload.moduleId) throw new Error('Regel-Quelle nicht gefunden')
      restrictions[src.restrictionIdx] = {
        id: catalogId,
        category,
        ...(category === 'soft' ? { weight: payload.weight } : {}),
        params,
      }
    } else {
      restrictions.push({
        id: catalogId,
        category,
        ...(category === 'soft' ? { weight: payload.weight ?? 5 } : {}),
        params,
      })
    }
    await applyModuleChange({ ...mod, restrictions, status: (mod as any).status })
  } catch (e: any) {
    ruleError.value = e.message || 'Fehler beim Speichern'
  } finally {
    saving.value = false
  }
}

async function applyModuleChange(updated: Record<string, any>): Promise<void> {
  saving.value = true
  ruleError.value = null
  try {
    const res = await fetch(`/api/modules/${encodeURIComponent(String(updated._id ?? updated.id))}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
    if (!res.ok) throw new Error(`Speichern fehlgeschlagen: HTTP ${res.status}`)
    await load()
  } catch (e: any) {
    ruleError.value = e.message || 'Fehler beim Speichern'
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<style scoped>
/* Einheitlicher Kopf (Fraunces) wie der Rest der App */
.page-title {
  font-family: 'Fraunces', serif;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--cw-text, #1e211d);
}
.hint {
  font-size: 12px;
}
.badge {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 999px;
}
.badge-hard {
  background: var(--cw-badge-new-bg, rgba(198, 96, 63, 0.12));
  color: var(--cw-badge-new-text, #a03c1e);
}
.badge-soft {
  background: rgba(43, 110, 99, 0.12);
  color: var(--cw-accent, #2b6e63);
}
</style>
