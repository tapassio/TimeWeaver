<template>
  <v-dialog :model-value="modelValue" max-width="700" scrollable persistent @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-item class="bg-primary text-white py-3">
        <template #prepend>
          <v-icon icon="mdi-calendar-clock" size="large" class="me-2" />
        </template>
        <v-card-title class="text-h6 font-weight-medium">{{ isEdit ? 'Edit Schedule Entry' : 'Add Schedule Entry' }}</v-card-title>
        <v-card-subtitle class="text-white text-opacity-80">
          Schedule modules, rooms, classes, and lecturers in a calendar week
        </v-card-subtitle>
        <template #append>
          <v-btn icon="mdi-close" variant="text" density="comfortable" @click="close" />
        </template>
      </v-card-item>

      <v-card-text class="pa-4 pa-sm-6">
        <v-form ref="formRef" @submit.prevent="submit">
          <v-select
            v-model="form.weekId"
            :items="weekItems"
            item-title="title"
            item-value="value"
            label="Week *"
            :rules="[v => !!v || 'Week is required']"
            variant="outlined"
            density="compact"
            class="mb-3"
          />

          <v-autocomplete
            v-model="form.moduleIds"
            :items="moduleItems"
            item-title="title"
            item-value="value"
            label="Modules"
            variant="outlined"
            density="compact"
            multiple
            chips
            closable-chips
            class="mb-3"
          />

          <v-autocomplete
            v-model="form.roomIds"
            :items="roomItems"
            item-title="title"
            item-value="value"
            label="Rooms"
            variant="outlined"
            density="compact"
            multiple
            chips
            closable-chips
            class="mb-3"
          />

          <v-autocomplete
            v-model="form.classIds"
            :items="classItems"
            item-title="title"
            item-value="value"
            label="Classes"
            variant="outlined"
            density="compact"
            multiple
            chips
            closable-chips
            class="mb-3"
          />

          <v-autocomplete
            v-model="form.lecturerIds"
            :items="lecturerItems"
            item-title="title"
            item-value="value"
            label="Lecturers"
            variant="outlined"
            density="compact"
            multiple
            chips
            closable-chips
            class="mb-3"
          />

          <v-row dense>
            <v-col cols="12" sm="4">
              <v-select
                v-model="form.weekday"
                :items="weekdayItems"
                item-title="title"
                item-value="value"
                label="Day *"
                variant="outlined"
                density="compact"
              />
            </v-col>
            <v-col cols="12" sm="4">
              <v-text-field
                v-model="form.startTime"
                label="Start Time"
                type="time"
                variant="outlined"
                density="compact"
              />
            </v-col>
            <v-col cols="12" sm="4">
              <v-text-field
                v-model="form.endTime"
                label="End Time"
                type="time"
                variant="outlined"
                density="compact"
              />
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn color="primary" variant="flat" @click="submit">
          {{ isEdit ? 'Save' : 'Create' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { ScheduleEntry } from '@/types/scheduleEntry'
import type { Week } from '@/types/week'
import type { Module } from '@/types/curriculum'
import type { Room } from '@/types/room'
import type { ClassEntity } from '@/types/curriculumClass'
import type { Lecturer } from '@/stores/curriculum'
import { WEEKDAY_LABELS, WEEKDAY_OPTIONS } from '@/types/schedule'
import { emptyScheduleEntry } from '@/composables/useScheduleEntries'

const props = defineProps<{
  modelValue: boolean
  entryData: ScheduleEntry | null
  weeks: Week[]
  modules: Module[]
  rooms: Room[]
  classes: ClassEntity[]
  lecturers: Lecturer[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save', payload: ScheduleEntry): void
}>()

const isEdit = computed(() => !!props.entryData?._id || !!props.entryData?.id)

const form = ref<ScheduleEntry>(JSON.parse(JSON.stringify(emptyScheduleEntry())))
const formRef = ref()

const weekdayItems = WEEKDAY_OPTIONS.map(wd => ({ title: WEEKDAY_LABELS[wd], value: wd }))

const weekItems = computed(() =>
  (props.weeks || [])
    .map(w => ({ title: `Week ${w.semesterWeek} (${w.startDate}–${w.endDate})`, value: w.id || w._id }))
    .filter(w => w.value)
)

const moduleItems = computed(() =>
  (props.modules || []).map(m => ({ title: m.code ? `${m.code} – ${m.name}` : m.name, value: m.id || m._id })).filter(i => i.value)
)

const roomItems = computed(() =>
  (props.rooms || []).map(r => ({ title: r.name, value: r.id || (r as any)._id })).filter(i => i.value)
)

const classItems = computed(() =>
  (props.classes || []).map(c => ({ title: c.name || c.code || c.id || 'Unnamed', value: c.id || c._id })).filter(i => i.value)
)

const lecturerItems = computed(() =>
  (props.lecturers || []).map(l => ({ title: l.name || l.id, value: l.id || l._id })).filter(i => i.value)
)

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    form.value = props.entryData
      ? JSON.parse(JSON.stringify(props.entryData))
      : JSON.parse(JSON.stringify(emptyScheduleEntry()))
  }
})

function close() {
  emit('update:modelValue', false)
}

function submit() {
  form.value.moduleIds = form.value.moduleIds || []
  form.value.roomIds = form.value.roomIds || []
  form.value.classIds = form.value.classIds || []
  form.value.lecturerIds = form.value.lecturerIds || []
  emit('save', JSON.parse(JSON.stringify(form.value)))
  close()
}
</script>