<template>
  <v-container>
    <h1>{{ t('dashboard.title') }}</h1>
    <p class="text-body-1 mt-2 mb-4">
      {{ t('dashboard.subtitle') }}
    </p>

    <v-row>
      <v-col cols="12" md="4">
        <v-card variant="outlined" class="pa-3 mb-4" to="/rooms" hover>
          <div class="text-subtitle-1 font-weight-bold mb-2">{{ t('dashboard.programs') }}</div>
          <div v-for="p in programStats" :key="p.id" class="d-flex justify-space-between mb-1">
            <span class="text-body-2">{{ p.title }}</span>
            <span class="text-caption text-medium-emphasis">
              {{ p.moduleCount }} Module · {{ p.blockCount }} Kontaktblocks
            </span>
          </div>
        </v-card>

        <v-card variant="outlined" class="pa-3 mb-4" to="/schedule" hover>
          <div class="text-subtitle-1 font-weight-bold mb-2">{{ t('schedule.conflicts') }}</div>
          <div class="text-h4">{{ slotConflictsCount }}</div>
          <div class="text-caption text-medium-emphasis">
            {{ slotConflictsCount === 0
              ? (t('schedule.noConflicts'))
              : t('schedule.conflicts') + ' in der Planung' }} →
          </div>
        </v-card>

        <v-card variant="outlined" class="pa-3" to="/availability" hover>
          <div class="text-subtitle-1 font-weight-bold mb-2">{{ t('dashboard.openTodos') }}</div>
          <div class="text-h4">{{ openTodoCount }}</div>
          <div class="text-caption text-medium-emphasis">
            {{ conflictCount === 0 ? '' : 'inkl. ' + conflictCount + ' Terminkonflikte' }}
          </div>
        </v-card>
      </v-col>

      <v-col cols="12" md="8">
        <v-card variant="outlined" class="pa-3 mb-4" to="/schedule" hover>
          <div class="text-subtitle-1 font-weight-bold mb-2">{{ t('dashboard.nextBlocks') }}</div>
          <div v-for="up in upcomingBlocks" :key="up._id" class="d-flex justify-space-between py-1">
            <span class="text-body-2">{{ up.title }}</span>
            <span class="text-caption text-medium-emphasis">{{ up.nextDate }}</span>
          </div>
          <div v-if="upcomingBlocks.length === 0" class="text-caption text-medium-emphasis">
            Keine kommenden Blöcke.
          </div>
        </v-card>

        <v-card variant="outlined" class="pa-3" to="/availability" hover>
          <div class="text-subtitle-1 font-weight-bold mb-2">{{ t('dashboard.upcomingComms') }}</div>
          <div v-for="c in upcomingComm" :key="c._id" class="d-flex justify-space-between mb-1">
            <span class="text-body-2">{{ c.subject }}</span>
            <span class="text-caption text-medium-emphasis">{{ c.channel }} · {{ c.scheduled_date }}</span>
          </div>
          <div v-if="upcomingComm.length === 0" class="text-caption text-medium-emphasis">
            Keine planierten Communications.
          </div>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from '@/composables/useI18n'
import { usePlanning } from '@/composables/usePlanning'

const {
  programs, modules, blocks, communications, load,
  moduleById, todos: allTodos, slotConflicts,
} = usePlanning()
const slotConflictsCount = computed(() => slotConflicts.value.length)
const { t } = useI18n()

interface ProgramStat {
  id: string
  title: string
  moduleCount: number
  blockCount: number
}

const programStats = computed<ProgramStat[]>(() =>
  programs.value.map((p) => {
    const id = p._id ?? p.id
    return {
      id,
      title: p.title ?? p.name ?? id,
      moduleCount: modules.value.filter(m => m.program_id === id).length,
      blockCount: blocks.value.filter((b) => {
        const m = moduleById(b.module_id)
        return m?.program_id === id
      }).length,
    }
  }),
)

onMounted(() => {
  void load()
})

const openTodoCount = computed(() => allTodos.value.filter(x => x.status === 'open').length)
const conflictCount = computed(() =>
  allTodos.value.filter(x => x.source === 'schedule_conflict' && x.status === 'open').length,
)

interface UpcomingBlock {
  _id: string
  title: string
  nextDate: string
}

const upcomingBlocks = computed<UpcomingBlock[]>(() => {
  const today = new Date().toISOString().slice(0, 10)
  const out: UpcomingBlock[] = []
  for (const b of blocks.value) {
    const nextDate = (b.slots ?? [])
      .map(s => s.date)
      .filter(d => d >= today)
      .sort()[0]
    if (!nextDate) continue
    out.push({
      _id: b._id,
      title: moduleById(b.module_id)?.title ?? b.module_id,
      nextDate,
    })
  }
  return out.sort((a, b) => a.nextDate.localeCompare(b.nextDate)).slice(0, 6)
})

const upcomingComm = computed(() =>
  communications.value
    .filter(c => c.scheduled_date >= (new Date()).toISOString().slice(0, 10))
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
    .slice(0, 6),
)
</script>
