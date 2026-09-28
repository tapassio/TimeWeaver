<template>
  <v-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" max-width="800" persistent>
    <v-card>
      <v-card-title>{{ isEdit ? 'Edit Room' : 'Add Room' }}</v-card-title>
      <v-card-text>
        <v-form ref="formRef" @submit.prevent="submit">
          <v-tabs v-model="tab">
            <v-tab value="general">General</v-tab>
            <v-tab value="capacity">Capacity</v-tab>
            <v-tab value="layout">Layout</v-tab>
            <v-tab value="equipment">Equipment</v-tab>
            <v-tab value="connectivity">Connectivity</v-tab>
            <v-tab value="accessibility">Accessibility</v-tab>
          </v-tabs>

          <v-window v-model="tab" class="mt-4">
            <v-window-item value="general">
              <v-text-field v-model="room.name" label="Room name *" :rules="[v => !!v || 'Name is required']" />
              <v-select v-model="room.roomType" :items="roomTypeOptions" label="Room type *" />
              <v-text-field v-model="room.owner" label="Owner" />
              <v-select
                v-model="room.locationId"
                :items="locationItems"
                item-title="title"
                item-value="value"
                label="Location"
                clearable
              >
                <template #append-item>
                  <v-divider />
                  <v-list-item @click="newLocationDialog = true" class="cursor-pointer">
                    <v-list-item-title>
                      <v-icon size="small" class="mr-1">mdi-plus</v-icon>
                      Create new location
                    </v-list-item-title>
                  </v-list-item>
                </template>
              </v-select>
              <v-text-field v-model="floorInput" label="Floor *" :rules="[v => v !== '' || 'Floor is required']" />
              <v-text-field v-model="room.roomNumber" label="Room number *" :rules="[v => !!v || 'Room number is required']" />
            </v-window-item>

            <v-window-item value="capacity">
              <v-text-field v-model.number="room.capacity" label="Seats *" type="number" min="0" :rules="[v => v >= 0 || 'Must be 0 or more']" />
            </v-window-item>

            <v-window-item value="layout">
              <v-select v-model="room.layout!.type" :items="layoutTypeOptions" label="Layout type" clearable />
              <v-checkbox v-model="room.layout!.movable_desks" label="Movable desks" />
              <v-checkbox v-model="room.layout!.movable_chairs" label="Movable chairs" />
              <v-checkbox v-model="room.layout!.group_work_possible" label="Group work possible" />
              <v-text-field v-model.number="room.layout!.floor_area_m2" label="Floor area (m²)" type="number" min="0" />
            </v-window-item>

            <v-window-item value="equipment">
              <v-text-field v-model.number="room.equipment!.whiteboards" label="Whiteboards *" type="number" min="0" />
              <v-checkbox v-model="room.equipment!.blackboard" label="Blackboard" />
              <v-checkbox v-model="room.equipment!.flipchart" label="Flipchart" />
              <v-checkbox v-model="room.equipment!.smartboard" label="Smartboard" />
              <v-checkbox v-model="room.equipment!.projector" label="Projector" />
              <v-text-field v-model.number="room.equipment!.projector_count" label="Projector count" type="number" min="0" />
              <v-text-field v-model="displayTypeInput" label="Display type (comma-separated for multiple)" />
              <v-checkbox v-model="room.equipment!.document_camera" label="Document camera" />
              <v-checkbox v-model="room.equipment!.lectern" label="Lectern" />
              <v-checkbox v-model="room.equipment!.speakers" label="Speakers" />
              <v-checkbox v-model="room.equipment!.microphone" label="Microphone" />
              <v-checkbox v-model="room.equipment!.lecture_capture" label="Lecture capture" />

              <v-divider class="my-4" />
              <h3 class="text-subtitle-1 mb-2">Streaming camera</h3>
              <v-checkbox v-model="room.equipment!.streaming_camera.available" label="Available" />
              <v-select v-model="room.equipment!.streaming_camera.type" :items="streamingCameraTypeOptions" label="Camera type" clearable />
              <v-text-field v-model="room.equipment!.streaming_camera.position" label="Camera position" />
              <v-select v-model="room.equipment!.streaming_camera.quality" :items="streamingCameraQualityOptions" label="Quality" clearable />

              <v-divider class="my-4" />
              <h3 class="text-subtitle-1 mb-2">Video conferencing</h3>
              <v-checkbox v-model="videoConferencingAvailable" label="Available" @update:model-value="toggleVideoConferencing" />
              <template v-if="room.equipment!.video_conferencing">
                <v-text-field v-model="room.equipment!.video_conferencing.system" label="System" />
                <v-checkbox v-model="room.equipment!.video_conferencing.supports_remote_participants" label="Supports remote participants" />
              </template>
            </v-window-item>

            <v-window-item value="connectivity">
              <v-checkbox v-model="room.connectivity!.wifi" label="Wi-Fi" />
              <v-checkbox v-model="room.connectivity!.wired_network" label="Wired network" />
              <v-text-field v-model.number="room.connectivity!.network_speed_mbps" label="Network speed (Mbps)" type="number" min="0" />
              <v-text-field v-model.number="room.connectivity!.power_outlets" label="Power outlets" type="number" min="0" />
              <v-select v-model="connectionsInput" :items="connectionTypeOptions" label="Connections" multiple chips />
              <v-checkbox v-model="room.connectivity!.wireless_presentation" label="Wireless presentation" />
            </v-window-item>

            <v-window-item value="accessibility">
              <v-checkbox v-model="room.accessibility.step_free_access" label="Step-free access" />
              <v-checkbox v-model="room.accessibility.accessible_door" label="Accessible door" />
              <v-checkbox v-model="room.accessibility.accessible_seating" label="Accessible seating" />
              <v-checkbox v-model="room.accessibility.hearing_loop" label="Hearing loop" />
              <v-checkbox v-model="room.accessibility.braille_signage" label="Braille signage" />
              <v-checkbox v-model="room.accessibility.accessible_restrooms_nearby" label="Accessible restrooms nearby" />
            </v-window-item>
          </v-window>
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="$emit('update:modelValue', false)">Cancel</v-btn>
        <v-btn color="primary" variant="flat" @click="submit">{{ isEdit ? 'Save' : 'Add' }}</v-btn>
      </v-card-actions>
    </v-card>

    <LocationFormDialog
      v-model="newLocationDialog"
      @save="handleNewLocation"
    />
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Room, RoomType, LayoutType, ConnectionType, StreamingCameraType, StreamingCameraQuality } from '@/types/room'
import type { Location } from '@/types/location'
import LocationFormDialog from '@/components/LocationFormDialog.vue'

const props = defineProps<{
  modelValue: boolean
  roomData?: Room
  locations: Location[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'save': [room: Room]
  'create-location': [location: Location]
}>()

const roomTypeOptions: RoomType[] = ['lecture_hall', 'classroom', 'computer_lab', 'laboratory', 'other']
const layoutTypeOptions: LayoutType[] = ['rows', 'u_shape', 'boardroom', 'laboratory_benches', 'computer_workstations', 'other']
const streamingCameraTypeOptions: StreamingCameraType[] = ['fixed', 'tracking', 'pan_tilt_zoom']
const streamingCameraQualityOptions: StreamingCameraQuality[] = ['720p', '1080p', '4k']
const connectionTypeOptions: ConnectionType[] = ['HDMI', 'DisplayPort', 'USB-C', 'VGA', '3.5mm_audio', 'Ethernet']

const isEdit = computed(() => !!props.roomData?.id)

const tab = ref('general')
const formRef = ref()
const newLocationDialog = ref(false)

const room = ref<Room>(emptyRoom())

function emptyRoom(): Room {
  return {
    name: '',
    roomType: 'classroom',
    floor: 0,
    roomNumber: '',
    capacity: 0,
    layout: {},
    equipment: {
      whiteboards: 0,
      flipchart: false,
      projector: false,
      streaming_camera: { available: false },
    },
    connectivity: {},
    accessibility: { step_free_access: false },
  }
}

const locationItems = computed(() =>
  props.locations.map(l => ({
    title: l.name || l.building,
    value: l.id,
  }))
)

const floorInput = computed({
  get: () => String(room.value.floor ?? ''),
  set: (v: string) => {
    const n = Number(v)
    room.value.floor = isNaN(n) ? v : n
  },
})

watch(() => props.modelValue, (val) => {
  if (val) {
    if (props.roomData) {
      room.value = JSON.parse(JSON.stringify(props.roomData))
    } else {
      room.value = emptyRoom()
    }
    tab.value = 'general'
    ensureNestedObjects()
  }
})

function ensureNestedObjects() {
  if (!room.value.layout) room.value.layout = {}
  if (!room.value.equipment) {
    room.value.equipment = {
      whiteboards: 0,
      flipchart: false,
      projector: false,
      streaming_camera: { available: false },
    }
  }
  if (!room.value.equipment.streaming_camera) {
    room.value.equipment.streaming_camera = { available: false }
  }
  if (!room.value.connectivity) room.value.connectivity = {}
}

ensureNestedObjects()

const displayTypeInput = computed({
  get: () => {
    const dt = room.value.equipment?.display_type
    if (!dt) return ''
    return Array.isArray(dt) ? dt.join(', ') : dt
  },
  set: (v: string) => {
    if (!room.value.equipment) return
    if (!v) {
      room.value.equipment.display_type = undefined
    } else if (v.includes(',')) {
      room.value.equipment.display_type = v.split(',').map(s => s.trim()).filter(Boolean)
    } else {
      room.value.equipment.display_type = v.trim()
    }
  },
})

const videoConferencingAvailable = computed({
  get: () => !!room.value.equipment?.video_conferencing,
  set: () => {},
})

function toggleVideoConferencing(val: boolean | null) {
  if (!room.value.equipment) return
  if (val) {
    room.value.equipment.video_conferencing = { available: true }
  } else {
    room.value.equipment.video_conferencing = undefined
  }
}

const connectionsInput = computed({
  get: () => (room.value.connectivity?.connections ?? []) as ConnectionType[],
  set: (v: ConnectionType[]) => {
    if (room.value.connectivity) room.value.connectivity.connections = v.length ? v : undefined
  },
})

function handleNewLocation(location: Location) {
  emit('create-location', location)
}

async function submit() {
  const { valid } = await formRef.value?.validate() ?? { valid: false }
  if (!valid) return
  emit('save', JSON.parse(JSON.stringify(room.value)))
  emit('update:modelValue', false)
}
</script>