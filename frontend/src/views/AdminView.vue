<template>
  <v-container fluid class="pa-6">
    <div class="d-flex align-center justify-space-between mb-6">
      <div>
        <h1 class="text-h4 font-weight-bold">System Administration</h1>
        <p class="text-subtitle-1 text-medium-emphasis">
          Manage local users, OIDC external identity mappings, usernames, emails, and authorization.
        </p>
      </div>
      <v-btn color="primary" prepend-icon="mdi-refresh" @click="fetchUsers" :loading="loading">
        Refresh Users
      </v-btn>
    </div>

    <!-- Feedback alerts -->
    <v-alert v-if="error" type="error" closable class="mb-4" @click:close="error = ''">
      {{ error }}
    </v-alert>

    <v-alert v-if="successMsg" type="success" closable class="mb-4" @click:close="successMsg = ''">
      {{ successMsg }}
    </v-alert>

    <!-- Users table -->
    <v-card class="elevation-2 rounded-lg">
      <v-card-title class="d-flex align-center py-3 px-4">
        <v-icon start color="primary">mdi-account-group</v-icon>
        <span class="text-h6 font-weight-bold">Local Users &amp; Roles</span>
        <v-spacer />
        <v-chip color="primary" variant="flat" size="small" class="font-weight-bold">
          {{ users.length }} registered {{ users.length === 1 ? 'user' : 'users' }}
        </v-chip>
      </v-card-title>

      <v-divider />

      <v-table hover>
        <thead>
          <tr>
            <th class="text-left font-weight-bold">User</th>
            <th class="text-left font-weight-bold">Email</th>
            <th class="text-left font-weight-bold">OIDC External Identity (Issuer / Subject)</th>
            <th class="text-left font-weight-bold">Role &amp; Status</th>
            <th class="text-left font-weight-bold">Created At</th>
            <th class="text-center font-weight-bold">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading && users.length === 0">
            <td colspan="6" class="text-center py-6 text-medium-emphasis">
              <v-progress-circular indeterminate color="primary" size="32" class="mr-2" />
              Loading users...
            </td>
          </tr>
          <tr v-else-if="users.length === 0">
            <td colspan="6" class="text-center py-6 text-medium-emphasis">
              No users found.
            </td>
          </tr>
          <tr v-for="user in users" :key="user.id">
            <td>
              <div class="font-weight-medium">{{ user.name || 'Anonymous User' }}</div>
              <div class="text-caption text-medium-emphasis">ID: {{ user.id }}</div>
            </td>
            <td>
              <span v-if="user.email" class="text-body-2 font-weight-regular">{{ user.email }}</span>
              <span v-else class="text-caption text-medium-emphasis font-italic">No email configured</span>
            </td>
            <td>
              <div class="text-caption font-family-monospace text-truncate" style="max-width: 320px;">
                <span class="font-weight-bold">iss:</span> {{ user.oidc_issuer }}
              </div>
              <div class="text-caption font-family-monospace text-truncate text-medium-emphasis" style="max-width: 320px;">
                <span class="font-weight-bold">sub:</span> {{ user.oidc_subject }}
              </div>
            </td>
            <td>
              <v-chip
                :color="user.is_admin ? 'primary' : 'default'"
                size="small"
                variant="flat"
                class="mr-1 font-weight-bold"
              >
                <v-icon start size="14">{{ user.is_admin ? 'mdi-shield-crown' : 'mdi-account' }}</v-icon>
                {{ user.is_admin ? 'Administrator' : 'Standard User' }}
              </v-chip>
              <v-chip
                v-if="user.is_active === false"
                color="error"
                size="x-small"
                variant="tonal"
                class="font-weight-bold"
              >
                Inactive
              </v-chip>
            </td>
            <td class="text-caption text-medium-emphasis">
              {{ formatDate(user.created_at) }}
            </td>
            <td class="text-center">
              <div class="d-flex align-center justify-center ga-2">
                <v-btn
                  color="primary"
                  variant="outlined"
                  size="small"
                  @click="openEditDialog(user)"
                  :disabled="updatingId === user.id"
                >
                  <v-icon start size="16">mdi-account-edit</v-icon>
                  Edit
                </v-btn>
                <template v-if="isLastAdmin(user)">
                  <v-chip color="warning" size="x-small" variant="tonal" class="font-weight-bold">
                    Last Admin
                  </v-chip>
                </template>
                <template v-else>
                  <v-btn
                    :color="user.is_admin ? 'warning' : 'default'"
                    variant="outlined"
                    size="small"
                    @click="toggleAdminRole(user)"
                    :loading="updatingId === user.id"
                  >
                    <v-icon start size="16">
                      {{ user.is_admin ? 'mdi-account-arrow-down' : 'mdi-shield-plus' }}
                    </v-icon>
                    {{ user.is_admin ? 'Revoke Admin' : 'Grant Admin' }}
                  </v-btn>
                </template>
              </div>
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <!-- Edit User Dialog -->
    <v-dialog v-model="editDialogOpen" max-width="520px" persistent>
      <v-card class="rounded-lg">
        <v-card-title class="d-flex align-center py-3 px-4">
          <v-icon start color="primary">mdi-account-edit</v-icon>
          <span class="text-h6 font-weight-bold">Edit User Account</span>
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" size="small" @click="closeEditDialog" />
        </v-card-title>

        <v-divider />

        <v-card-text class="pt-4">
          <v-alert v-if="dialogError" type="error" density="compact" class="mb-4">
            {{ dialogError }}
          </v-alert>

          <!-- OIDC reference info -->
          <v-card variant="tonal" color="primary" class="pa-3 mb-4 rounded-md">
            <div class="text-caption text-truncate mb-1">
              <strong>OIDC Issuer:</strong> {{ editingUser?.oidc_issuer }}
            </div>
            <div class="text-caption text-truncate">
              <strong>OIDC Subject:</strong> {{ editingUser?.oidc_subject }}
            </div>
          </v-card>

          <v-form ref="editFormRef" @submit.prevent="saveUser">
            <v-text-field
              v-model="editName"
              label="Name"
              placeholder="e.g. Jane Doe"
              hint="Fallback name kept for compatibility"
              persistent-hint
              :rules="[usernameRule]"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-account"
              class="mb-3"
              required
            />

            <v-text-field
              v-model="editLocalName"
              label="Local Name"
              placeholder="e.g. jdoe"
              hint="Login handle within CourseWeaver"
              persistent-hint
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-account-outline"
              class="mb-3"
            />

            <v-text-field
              v-model="editDisplayName"
              label="Display Name"
              placeholder="e.g. Jane Doe"
              hint="Name shown in the UI"
              persistent-hint
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-card-account-details-outline"
              class="mb-3"
            />

            <v-text-field
              v-model="editEmail"
              label="Email Address"
              placeholder="e.g. user@example.com"
              hint="Email address assigned to the user account"
              persistent-hint
              :rules="[emailRule]"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-email"
              class="mb-3"
            />

            <v-text-field
              v-model="editTimezone"
              label="Timezone"
              placeholder="e.g. Europe/Zurich"
              hint="IANA timezone name for calendar display"
              persistent-hint
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-earth"
              class="mb-3"
            />

            <v-checkbox
              v-model="editIsActive"
              label="Active"
              color="primary"
              density="compact"
              hide-details
              class="mb-2"
            />

            <v-checkbox
              v-model="editIsAdmin"
              label="Administrator Privileges"
              color="primary"
              density="compact"
              hide-details
              :disabled="editingUser ? isLastAdmin(editingUser) : false"
            />
          </v-form>
        </v-card-text>

        <v-divider />

        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" @click="closeEditDialog" :disabled="savingUser">
            Cancel
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            @click="saveUser"
            :loading="savingUser"
          >
            Save Changes
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore, LocalUserProfile } from '@/stores/auth'

const auth = useAuthStore()
const users = ref<LocalUserProfile[]>([])
const loading = ref(false)
const updatingId = ref<string | null>(null)
const error = ref('')
const successMsg = ref('')

// Dialog state
const editDialogOpen = ref(false)
const editingUser = ref<LocalUserProfile | null>(null)
const editName = ref('')
const editLocalName = ref('')
const editDisplayName = ref('')
const editEmail = ref('')
const editTimezone = ref('')
const editIsAdmin = ref(false)
const editIsActive = ref(true)
const savingUser = ref(false)
const dialogError = ref('')
const editFormRef = ref<any>(null)

function getApiBaseUrl(): string {
  return import.meta.env.DATABASE_URL?.replace(/\/+$/, '') || '/api'
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleString()
  } catch {
    return dateStr
  }
}

function usernameRule(val: string): boolean | string {
  if (!val || !val.trim()) {
    return 'Username is required'
  }
  return true
}

function emailRule(val: string): boolean | string {
  if (!val || !val.trim()) {
    return true
  }
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailPattern.test(val.trim()) || 'Please enter a valid email address'
}

function isLastAdmin(user: LocalUserProfile): boolean {
  return user.is_admin && users.value.filter(u => u.is_admin).length <= 1
}

async function fetchUsers() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`${getApiBaseUrl()}/users`, {
      headers: auth.getAuthHeaders(),
    })
    if (!res.ok) {
      throw new Error(`Failed to load users: ${res.statusText}`)
    }
    users.value = await res.json()
  } catch (err: any) {
    error.value = err.message || 'Error fetching users'
  } finally {
    loading.value = false
  }
}

function openEditDialog(user: LocalUserProfile) {
  editingUser.value = user
  editName.value = user.name || ''
  editLocalName.value = user.local_name || ''
  editDisplayName.value = user.display_name || ''
  editEmail.value = user.email || ''
  editTimezone.value = user.timezone || ''
  editIsAdmin.value = !!user.is_admin
  editIsActive.value = user.is_active !== false
  dialogError.value = ''
  editDialogOpen.value = true
}

function closeEditDialog() {
  editDialogOpen.value = false
  editingUser.value = null
  editName.value = ''
  editLocalName.value = ''
  editDisplayName.value = ''
  editEmail.value = ''
  editTimezone.value = ''
  editIsAdmin.value = false
  editIsActive.value = true
  dialogError.value = ''
}

async function saveUser() {
  if (!editingUser.value) return

  const validation = usernameRule(editName.value)
  if (validation !== true) {
    dialogError.value = typeof validation === 'string' ? validation : 'Invalid username'
    return
  }

  const emailValidation = emailRule(editEmail.value)
  if (emailValidation !== true) {
    dialogError.value = typeof emailValidation === 'string' ? emailValidation : 'Invalid email'
    return
  }

  if (isLastAdmin(editingUser.value) && !editIsAdmin.value) {
    dialogError.value = 'Cannot remove the last remaining administrator'
    return
  }

  savingUser.value = true
  dialogError.value = ''
  error.value = ''
  successMsg.value = ''

  try {
    const targetId = editingUser.value.id
    const trimmedName = editName.value.trim()
    const trimmedEmail = editEmail.value.trim()
    const isNewAdmin = editIsAdmin.value
    const newRoles = isNewAdmin
      ? Array.from(new Set([...(editingUser.value.roles || []), 'admin']))
      : (editingUser.value.roles || []).filter(r => r !== 'admin')

    const res = await fetch(`${getApiBaseUrl()}/users/${targetId}`, {
      method: 'PATCH',
      headers: auth.getAuthHeaders(),
      body: JSON.stringify({
        name: trimmedName,
        local_name: editLocalName.value.trim(),
        display_name: editDisplayName.value.trim(),
        email: trimmedEmail,
        timezone: editTimezone.value.trim(),
        is_active: editIsActive.value,
        is_admin: isNewAdmin,
        roles: newRoles,
      }),
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      throw new Error(errorData.error || `Failed to update user: ${res.statusText}`)
    }

    const updated: LocalUserProfile = await res.json()
    const index = users.value.findIndex(u => u.id === targetId)
    if (index !== -1) {
      users.value[index] = updated
    }

    // If current logged-in user was modified, sync Pinia store
    if (auth.localUser && auth.localUser.id === targetId) {
      auth.updateLocalUserProfile(updated)
    }

    successMsg.value = `User "${updated.name}" was successfully updated.`
    closeEditDialog()
  } catch (err: any) {
    dialogError.value = err.message || 'Failed to update user account'
  } finally {
    savingUser.value = false
  }
}

async function toggleAdminRole(user: LocalUserProfile) {
  if (isLastAdmin(user) && user.is_admin) {
    error.value = 'Cannot remove the last remaining administrator'
    return
  }

  updatingId.value = user.id
  error.value = ''
  successMsg.value = ''

  try {
    const newIsAdmin = !user.is_admin
    const newRoles = newIsAdmin
      ? Array.from(new Set([...user.roles, 'admin']))
      : user.roles.filter(r => r !== 'admin')

    const res = await fetch(`${getApiBaseUrl()}/users/${user.id}`, {
      method: 'PATCH',
      headers: auth.getAuthHeaders(),
      body: JSON.stringify({
        is_admin: newIsAdmin,
        roles: newRoles,
      }),
    })

    if (!res.ok) {
      throw new Error(`Failed to update user: ${res.statusText}`)
    }

    const updated = await res.json()
    const index = users.value.findIndex(u => u.id === user.id)
    if (index !== -1) {
      users.value[index] = updated
    }

    if (auth.localUser && auth.localUser.id === user.id) {
      auth.updateLocalUserProfile(updated)
    }

    successMsg.value = `User ${user.name || user.id} updated successfully.`
  } catch (err: any) {
    error.value = err.message || 'Failed to update user role'
  } finally {
    updatingId.value = null
  }
}

onMounted(() => {
  fetchUsers()
})
</script>
