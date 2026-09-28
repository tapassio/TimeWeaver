<template>
  <v-container>
    <h1 class="mb-1">Rooms &amp; Locations</h1>
    <p class="text-body-2 text-medium-emphasis mb-4">Manage rooms, locations, equipment, and availability.</p>

    <v-tabs v-model="activeTab">
      <v-tab value="rooms">Rooms</v-tab>
      <v-tab value="locations">Locations</v-tab>
    </v-tabs>

    <v-window v-model="activeTab" class="mt-4">
      <v-window-item value="rooms">
        <v-row class="align-center mb-4">
          <v-col cols="12" sm="6" class="d-flex ga-2">
            <v-btn v-if="auth.isAdmin" color="primary" prepend-icon="mdi-plus" @click="openAddRoom">Add Room</v-btn>
            <v-btn v-if="auth.isAdmin" variant="outlined" prepend-icon="mdi-file-import" @click="openCsvImport('rooms')">Import CSV</v-btn>
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="roomSearch"
              prepend-inner-icon="mdi-magnify"
              label="Search rooms"
              single-line
              hide-details
              clearable
              density="compact"
            />
          </v-col>
        </v-row>

        <v-data-table
          :headers="roomHeaders"
          :items="filteredRooms"
          :sort-by="roomSortBy"
          @update:sort-by="roomSortBy = $event"
          hover
          items-per-page="15"
        >
          <template #item.roomType="{ item }">
            {{ formatRoomType(item.roomType) }}
          </template>
          <template #item.location_label="{ item }">
            {{ getLocationLabel(item.locationId) }}
          </template>
          <template #item.capacity="{ item }">
            {{ item.capacity ?? '-' }}
          </template>
          <template #item.accessibility.step_free_access="{ item }">
            <v-icon :color="item.accessibility?.step_free_access ? 'success' : 'default'">
              {{ item.accessibility?.step_free_access ? 'mdi-check-circle' : 'mdi-close-circle' }}
            </v-icon>
          </template>
          <template #item.name="{ item }">
            <span>{{ item.name }}</span>
            <v-chip v-if="item._canEdit" size="x-small" variant="tonal" color="primary" class="ml-1">Admin</v-chip>
          </template>
          <template #item.actions="{ item }">
            <template v-if="item._canEdit">
              <v-btn icon variant="text" size="small" @click="openEditRoom(item)">
                <v-icon>mdi-pencil</v-icon>
                <v-tooltip activator="parent">Edit</v-tooltip>
              </v-btn>
              <v-btn icon variant="text" size="small" @click="confirmDeleteRoom(item)">
                <v-icon>mdi-delete</v-icon>
                <v-tooltip activator="parent">Delete</v-tooltip>
              </v-btn>
            </template>
            <span v-else class="text-medium-emphasis text-caption">Read-only</span>
          </template>
          <template #no-data>
            <div class="text-center pa-4">
              <v-icon size="64" color="grey-lighten-1">mdi-door-open</v-icon>
              <p class="mt-2 text-medium-emphasis">No rooms found.</p>
            </div>
          </template>
        </v-data-table>
      </v-window-item>

      <v-window-item value="locations">
        <v-row class="align-center mb-4">
          <v-col cols="12" sm="6" class="d-flex ga-2">
            <v-btn v-if="auth.isAdmin" color="primary" prepend-icon="mdi-plus" @click="openAddLocation">Add Location</v-btn>
            <v-btn v-if="auth.isAdmin" variant="outlined" prepend-icon="mdi-file-import" @click="openCsvImport('locations')">Import CSV</v-btn>
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="locSearch"
              prepend-inner-icon="mdi-magnify"
              label="Search locations"
              single-line
              hide-details
              clearable
              density="compact"
            />
          </v-col>
        </v-row>

        <v-data-table
          :headers="locHeaders"
          :items="filteredLocations"
          :sort-by="locSortBy"
          @update:sort-by="locSortBy = $event"
          hover
          items-per-page="15"
        >
          <template #item.name="{ item }">
            <span>{{ item.name }}</span>
            <v-chip v-if="item._canEdit" size="x-small" variant="tonal" color="primary" class="ml-1">Admin</v-chip>
          </template>
          <template #item.actions="{ item }">
            <template v-if="item._canEdit">
              <v-btn icon variant="text" size="small" @click="openEditLocation(item)">
                <v-icon>mdi-pencil</v-icon>
                <v-tooltip activator="parent">Edit</v-tooltip>
              </v-btn>
              <v-btn icon variant="text" size="small" @click="confirmDeleteLocation(item)">
                <v-icon>mdi-delete</v-icon>
                <v-tooltip activator="parent">Delete</v-tooltip>
              </v-btn>
            </template>
            <span v-else class="text-medium-emphasis text-caption">Read-only</span>
          </template>
          <template #no-data>
            <div class="text-center pa-4">
              <v-icon size="64" color="grey-lighten-1">mdi-map-marker</v-icon>
              <p class="mt-2 text-medium-emphasis">No locations found.</p>
            </div>
          </template>
        </v-data-table>
      </v-window-item>
    </v-window>

    <RoomFormDialog
      v-model="roomDialogOpen"
      :room-data="editRoom"
      :locations="locations"
      @save="handleRoomSave"
      @create-location="handleCreateLocationFromRoom"
    />

    <LocationFormDialog
      v-model="locDialogOpen"
      :location-data="editLocation"
      @save="handleLocationSave"
    />

    <CsvImportDialog
      v-model="csvImportDialogOpen"
      :initial-type="csvImportType"
      @imported="handleCsvImported"
    />

    <v-dialog v-model="deleteDialogOpen" max-width="420">
      <v-card>
        <v-card-title>Confirm deletion</v-card-title>
        <v-card-text>
          Are you sure you want to delete <strong>{{ deleteTargetName }}</strong>?
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deleteDialogOpen = false">Cancel</v-btn>
          <v-btn color="error" variant="flat" @click="handleDelete">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar" :color="snackbarColor" :timeout="3000">
      {{ snackbarText }}
    </v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRooms } from '@/composables/useRooms'
import { useLocations } from '@/composables/useLocations'
import { useAuthStore } from '@/stores/auth'
import RoomFormDialog from '@/components/RoomFormDialog.vue'
import LocationFormDialog from '@/components/LocationFormDialog.vue'
import CsvImportDialog from '@/components/CsvImportDialog.vue'
import type { Room } from '@/types/room'
import type { Location } from '@/types/location'
import type { ImportType } from '@/types/csvImport'

const auth = useAuthStore()

const {
  rooms,
  fetchRooms,
  addRoom,
  updateRoom,
  removeRoom,
} = useRooms()

const {
  locations,
  fetchLocations,
  addLocation,
  updateLocation,
  removeLocation,
} = useLocations()

const activeTab = ref('rooms')

const roomSearch = ref('')
const roomDialogOpen = ref(false)
const editRoom = ref<Room | undefined>(undefined)
const roomSortBy = ref<{ key: string; order: 'asc' | 'desc' }[]>([])

const locSearch = ref('')
const locDialogOpen = ref(false)
const editLocation = ref<Location | undefined>(undefined)
const locSortBy = ref<{ key: string; order: 'asc' | 'desc' }[]>([])

const csvImportDialogOpen = ref(false)
const csvImportType = ref<ImportType>('rooms')

const deleteDialogOpen = ref(false)
const deleteTargetName = ref('')
let deleteKind: 'room' | 'location' = 'room'
let deleteId = ''

const snackbar = ref(false)
const snackbarText = ref('')
const snackbarColor = ref('success')

const roomHeaders = [
  { title: 'Name', key: 'name', sortable: true },
  { title: 'Type', key: 'roomType', sortable: true },
  { title: 'Location', key: 'location_label', sortable: true },
  { title: 'Floor', key: 'floor', sortable: true },
  { title: 'Room no.', key: 'roomNumber', sortable: true },
  { title: 'Seats', key: 'capacity', sortable: true },
  { title: 'Step-free', key: 'accessibility.step_free_access', sortable: true },
  { title: '', key: 'actions', sortable: false, width: '100px' },
]

const locHeaders = [
  { title: 'Name', key: 'name', sortable: true },
  { title: 'Campus', key: 'campus', sortable: true },
  { title: 'Building', key: 'building', sortable: true },
  { title: 'Address', key: 'address', sortable: true },
  { title: '', key: 'actions', sortable: false, width: '100px' },
]

const roomTypeLabels: Record<string, string> = {
  lecture_hall: 'Lecture Hall',
  classroom: 'Classroom',
  computer_lab: 'Computer Lab',
  laboratory: 'Laboratory',
  other: 'Other',
}

function formatRoomType(t: string): string {
  return roomTypeLabels[t] ?? t
}

function getLocationLabel(locationId?: string): string {
  if (!locationId) return '-'
  const loc = locations.value.find(l => l.id === locationId)
  return loc ? (loc.name || loc.building) : '-'
}

const filteredRooms = computed(() => {
  if (!roomSearch.value) return rooms.value
  const q = roomSearch.value.toLowerCase()
  return rooms.value.filter(r =>
    r.name.toLowerCase().includes(q) ||
    (r.roomType ?? '').toLowerCase().includes(q) ||
    (r.owner ?? '').toLowerCase().includes(q) ||
    getLocationLabel(r.locationId).toLowerCase().includes(q) ||
    String(r.floor).toLowerCase().includes(q) ||
    (r.roomNumber ?? '').toLowerCase().includes(q)
  )
})

const filteredLocations = computed(() => {
  if (!locSearch.value) return locations.value
  const q = locSearch.value.toLowerCase()
  return locations.value.filter(l =>
    (l.name ?? '').toLowerCase().includes(q) ||
    (l.building ?? '').toLowerCase().includes(q) ||
    (l.campus ?? '').toLowerCase().includes(q)
  )
})

function openAddRoom() {
  editRoom.value = undefined
  roomDialogOpen.value = true
}

function openEditRoom(room: Room) {
  editRoom.value = room
  roomDialogOpen.value = true
}

async function handleRoomSave(room: Room) {
  try {
    if (room.id) {
      await updateRoom(room)
      showSnackbar('Room updated')
    } else {
      await addRoom(room)
      showSnackbar('Room added')
    }
  } catch {
    showSnackbar('Operation failed', 'error')
  }
}

async function handleCreateLocationFromRoom(location: Location) {
  try {
    await addLocation(location)
    if (location.id) {
      editRoom.value = { ...editRoom.value!, locationId: location.id }
    }
    showSnackbar('Location created')
  } catch {
    showSnackbar('Failed to create location', 'error')
  }
}

function confirmDeleteRoom(room: Room) {
  deleteKind = 'room'
  deleteId = room.id ?? ''
  deleteTargetName.value = room.name
  deleteDialogOpen.value = true
}

function openAddLocation() {
  editLocation.value = undefined
  locDialogOpen.value = true
}

function openEditLocation(loc: Location) {
  editLocation.value = loc
  locDialogOpen.value = true
}

async function handleLocationSave(loc: Location) {
  try {
    if (loc.id) {
      await updateLocation(loc)
      showSnackbar('Location updated')
    } else {
      await addLocation(loc)
      showSnackbar('Location added')
    }
  } catch {
    showSnackbar('Operation failed', 'error')
  }
}

function confirmDeleteLocation(loc: Location) {
  deleteKind = 'location'
  deleteId = loc.id ?? ''
  deleteTargetName.value = loc.name || loc.building
  deleteDialogOpen.value = true
}

async function handleDelete() {
  try {
    if (deleteKind === 'room') {
      await removeRoom(deleteId)
      showSnackbar('Room deleted')
    } else {
      await removeLocation(deleteId)
      showSnackbar('Location deleted')
    }
  } catch {
    showSnackbar('Deletion failed', 'error')
  }
  deleteDialogOpen.value = false
}

function openCsvImport(type: ImportType) {
  csvImportType.value = type
  csvImportDialogOpen.value = true
}

async function handleCsvImported(payload: { type: ImportType; count: number; items: any[] }) {
  if (payload.type === 'rooms') {
    await fetchRooms()
    showSnackbar(`${payload.count} room${payload.count === 1 ? '' : 's'} imported successfully`)
  } else if (payload.type === 'locations') {
    await fetchLocations()
    showSnackbar(`${payload.count} location${payload.count === 1 ? '' : 's'} imported successfully`)
  } else {
    await Promise.all([fetchRooms(), fetchLocations()])
    showSnackbar(`${payload.count} items imported successfully`)
  }
}

function showSnackbar(text: string, color: string = 'success') {
  snackbarText.value = text
  snackbarColor.value = color
  snackbar.value = true
}

onMounted(() => {
  fetchRooms()
  fetchLocations()
})
</script>