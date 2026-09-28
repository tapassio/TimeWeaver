<template>
  <v-container>
    <h1 class="mb-1">Availability</h1>
    <p class="text-body-2 text-medium-emphasis mb-4">
      View lecturer and room availability for the selected semester.
    </p>

    <v-row dense class="mb-4">
      <v-col cols="12" sm="6" md="4">
        <v-select
          v-model="selectedSemesterId"
          :items="semesterItems"
          item-title="title"
          item-value="value"
          label="Semester"
          prepend-inner-icon="mdi-school-outline"
          variant="outlined"
          density="compact"
          hide-details
          @update:model-value="handleSemesterChange"
        >
          <template #item="{ props: itemProps, item }">
            <v-list-item v-bind="itemProps">
              <v-list-item-subtitle>{{ (item as any).raw?.subtitle }}</v-list-item-subtitle>
            </v-list-item>
          </template>
        </v-select>
      </v-col>
    </v-row>

    <v-tabs v-model="activeTab">
      <v-tab value="lecturers">
        <v-icon start>mdi-account-group-outline</v-icon>
        Lecturers
      </v-tab>
      <v-tab value="rooms">
        <v-icon start>mdi-door-open</v-icon>
        Rooms
      </v-tab>
    </v-tabs>

    <v-window v-model="activeTab" class="mt-4">
      <!-- Lecturers Tab -->
      <v-window-item value="lecturers">
        <v-alert v-if="!selectedSemesterId" type="info" variant="tonal" class="mb-4" density="compact">
          Select a semester above to view lecturer availability.
        </v-alert>

        <template v-else>
          <v-data-table
            :headers="lecturerHeaders"
            :items="lecturerAvailabilityRows"
            :sort-by="lecturerSortBy"
            @update:sort-by="lecturerSortBy = $event"
            hover
            items-per-page="15"
          >
            <template #item.lecturer="{ item }">
              {{ getLecturerName(item.lecturerId) }}
            </template>
            <template #item.week="{ item }">
              {{ formatWeek(item.weekId) }}
            </template>
            <template #item.weekday="{ item }">
              {{ formatWeekday(item.weekday as Weekday) }}
            </template>
            <template #no-data>
              <div class="text-center pa-4">
                <v-icon size="64" color="grey-lighten-1">mdi-account-group-outline</v-icon>
                <p class="mt-2 text-medium-emphasis">No lecturer availability for this semester.</p>
              </div>
            </template>
          </v-data-table>
        </template>
      </v-window-item>

      <!-- Rooms Tab -->
      <v-window-item value="rooms">
        <v-alert v-if="!selectedSemesterId" type="info" variant="tonal" class="mb-4" density="compact">
          Select a semester above to view room availability.
        </v-alert>

        <template v-else>
          <v-data-table
            :headers="roomHeaders"
            :items="roomAvailabilityRows"
            :sort-by="roomSortBy"
            @update:sort-by="roomSortBy = $event"
            hover
            items-per-page="15"
          >
            <template #item.room="{ item }">
              {{ getRoomName(item.roomId) }}
            </template>
            <template #item.week="{ item }">
              {{ formatWeek(item.weekId) }}
            </template>
            <template #item.weekday="{ item }">
              {{ formatWeekday(item.weekday as Weekday) }}
            </template>
            <template #no-data>
              <div class="text-center pa-4">
                <v-icon size="64" color="grey-lighten-1">mdi-door-open</v-icon>
                <p class="mt-2 text-medium-emphasis">No room availability for this semester.</p>
              </div>
            </template>
          </v-data-table>
        </template>
      </v-window-item>
    </v-window>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useCurriculumStore } from '@/stores/curriculum'
import { useAvailability } from '@/composables/useAvailability'
import { useRoomAvailabilities } from '@/composables/useRoomAvailabilities'
import { useWeeks } from '@/composables/useWeeks'
import type { Weekday } from '@/types/room'
import { WEEKDAY_LABELS } from '@/types/schedule'

const store = useCurriculumStore()
const { lecturers, rooms } = storeToRefs(store)
const { availabilities, fetchAvailabilities } = useAvailability()
const { roomAvailabilities, fetchRoomAvailabilities } = useRoomAvailabilities()
const { weeks, fetchWeeks } = useWeeks()

const selectedSemesterId = ref('')
const activeTab = ref<'lecturers' | 'rooms'>('lecturers')
const lecturerSortBy = ref<{ key: string; order: 'asc' | 'desc' }[]>([{ key: 'lecturer', order: 'asc' }])
const roomSortBy = ref<{ key: string; order: 'asc' | 'desc' }[]>([{ key: 'room', order: 'asc' }])

const semesterItems = computed(() => {
  const items = store.semesters.map(s => ({
    title: s.name || s.code,
    value: s._id || s.id || '',
    subtitle: `${s.startDate} – ${s.endDate}`,
  }))
  if (items.length === 0) {
    return [{ title: 'No semesters defined', value: '', subtitle: 'Create a semester first' }]
  }
  return [{ title: 'Select a semester', value: '', subtitle: 'Choose which semester to view' }, ...items]
})

const semesterWeekIds = computed(() => {
  if (!selectedSemesterId.value) return new Set<string>()
  return new Set(
    weeks.value
      .filter(w => w.semesterId === selectedSemesterId.value)
      .map(w => w.id || w._id)
      .filter(Boolean) as string[]
  )
})

const lecturerAvailabilityRows = computed(() => {
  if (!selectedSemesterId.value) return []
  const weekIds = semesterWeekIds.value
  const semesterLecturerIds = new Set(lecturers.value.map(l => l.id || l._id))
  return availabilities.value.filter(
    a => semesterLecturerIds.has(a.lecturerId) && (!a.weekId || weekIds.has(a.weekId))
  )
})

const roomAvailabilityRows = computed(() => {
  if (!selectedSemesterId.value) return []
  const weekIds = semesterWeekIds.value
  const semesterRoomIds = new Set(rooms.value.map(r => r.id))
  return roomAvailabilities.value.filter(
    r => semesterRoomIds.has(r.roomId) && (!r.weekId || weekIds.has(r.weekId))
  )
})

const lecturerHeaders = [
  { title: 'Lecturer', key: 'lecturer', sortable: true },
  { title: 'Week', key: 'week', sortable: true },
  { title: 'Day', key: 'weekday', sortable: true },
  { title: 'Start', key: 'startTime', sortable: true },
  { title: 'End', key: 'endTime', sortable: true },
]

const roomHeaders = [
  { title: 'Room', key: 'room', sortable: true },
  { title: 'Week', key: 'week', sortable: true },
  { title: 'Day', key: 'weekday', sortable: true },
  { title: 'Start', key: 'startTime', sortable: true },
  { title: 'End', key: 'endTime', sortable: true },
]

function getLecturerName(lecturerId: string): string {
  const l = lecturers.value.find(x => (x.id || x._id) === lecturerId)
  return l ? l.name : lecturerId
}

function getRoomName(roomId: string): string {
  const r = rooms.value.find(x => x.id === roomId)
  return r ? r.name : roomId
}

function formatWeek(weekId?: string): string {
  if (!weekId) return 'All weeks'
  const w = weeks.value.find(x => (x.id || x._id) === weekId)
  return w ? `Week ${w.semesterWeek}` : weekId
}

function formatWeekday(wd: Weekday): string {
  return WEEKDAY_LABELS[wd] || wd
}

function handleSemesterChange() {
  lecturerSortBy.value = [{ key: 'lecturer', order: 'asc' }]
  roomSortBy.value = [{ key: 'room', order: 'asc' }]
}

onMounted(() => {
  store.fetchSemesters()
  store.fetchLecturers()
  store.fetchRooms()
  fetchAvailabilities()
  fetchRoomAvailabilities()
  fetchWeeks()
})
</script>