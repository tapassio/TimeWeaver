<template>
  <v-container class="fill-height" fluid>
    <v-row align="center" justify="center">
      <v-col cols="12" sm="8" md="4" class="text-center">
        <v-progress-circular indeterminate size="64" class="mb-4" />
        <p class="text-h6">{{ message }}</p>
        <v-alert v-if="error" type="error" class="mt-4">
          {{ error }}
        </v-alert>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useOidc, OIDC_STORAGE_KEYS } from '@/composables/useOidc'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const oidc = useOidc()
const auth = useAuthStore()
const error = ref('')
const message = ref('Completing OIDC login...')

onMounted(async () => {
  const params = new URLSearchParams(window.location.search)
  const logoutParam = params.get('logout')

  // Check if logout was cancelled
  if (logoutParam === 'no') {
    message.value = 'Logout cancelled. Returning to CourseWeaver...'
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.removeItem('docpouch_logout_in_progress')
    }
    const authenticated = await auth.initAuth()
    if (authenticated) {
      router.replace({ name: 'dashboard' })
    } else {
      router.replace({ name: 'login' })
    }
    return
  }

  const isLogout =
    logoutParam === 'true' ||
    logoutParam === 'yes' ||
    (typeof window !== 'undefined' &&
      window.sessionStorage &&
      sessionStorage.getItem('docpouch_logout_in_progress') === 'true') ||
    (!params.has('code') && !params.has('access_token') && !params.has('id_token') && !params.has('error'))

  if (isLogout) {
    message.value = 'Logged out'
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.removeItem('docpouch_logout_in_progress')
    }
    localStorage.removeItem(OIDC_STORAGE_KEYS.accessToken)
    localStorage.removeItem(OIDC_STORAGE_KEYS.idToken)
    localStorage.removeItem(OIDC_STORAGE_KEYS.user)
    localStorage.removeItem('cw_oidc_state')
    localStorage.removeItem('authToken')
    localStorage.removeItem('authMethod')
    localStorage.removeItem('docpouch_oidc_session')
    if (oidc.docPouchInstance.value) {
      try {
        oidc.docPouchInstance.value.clearAuth()
      } catch {
        // ignore
      }
    }
    oidc.clearAuthError()
    oidc.currentUser.value = null
    oidc.isAuthenticated.value = false
    auth.userName = ''
    auth.isAdmin = false
    auth.localUser = null
    auth.bootstrapRequired = false
    router.replace({ name: 'login' })
    return
  }

  try {
    const handled = await oidc.handleOidcCallback()
    if (handled) {
      await auth.initAuth()
      router.replace({ name: 'dashboard' })
    } else {
      router.replace({ name: 'login' })
    }
  } catch (e: any) {
    error.value = e?.message || 'Authentication failed'
    setTimeout(() => router.replace({ name: 'login' }), 3000)
  }
})
</script>
