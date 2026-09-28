import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useOidc, OIDC_STORAGE_KEYS } from '@/composables/useOidc'

export interface LocalUserProfile {
  id: string
  oidc_issuer: string
  oidc_subject: string
  name: string
  email: string
  local_name?: string
  display_name?: string
  supplier_id?: string
  is_active?: boolean
  timezone?: string
  roles: string[]
  is_admin: boolean
  created_at?: string
  updated_at?: string
}

export const useAuthStore = defineStore('auth', () => {
  const oidc = useOidc()

  const userName = ref<string>('')
  const isAdmin = ref(false)
  const bootstrapRequired = ref(false)
  const localUser = ref<LocalUserProfile | null>(null)
  const authError = ref('')

  const isAuthenticated = computed(() => oidc.isAuthenticated.value && !bootstrapRequired.value && !!localUser.value)
  const isOidcAuthenticated = computed(() => oidc.isAuthenticated.value)
  const authMethod = computed(() => oidc.authMethod.value)

  function getApiBaseUrl(): string {
    return import.meta.env.DATABASE_URL?.replace(/\/+$/, '') || '/api'
  }

  function getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem(OIDC_STORAGE_KEYS.accessToken) || localStorage.getItem('authToken') || ''
    const idToken = localStorage.getItem(OIDC_STORAGE_KEYS.idToken) || ''
    const currentUser = oidc.currentUser.value
    const currentIssuer = oidc.issuer.value || import.meta.env.OIDC_ISSUER || ''

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    const primaryToken = idToken || token
    if (primaryToken) {
      headers['Authorization'] = `Bearer ${primaryToken}`
    }
    if (idToken) {
      headers['X-ID-Token'] = idToken
    }
    if (currentIssuer) {
      headers['X-OIDC-Issuer'] = currentIssuer
    }
    const subject = currentUser?.id || localUser.value?.oidc_subject
    if (subject) {
      headers['X-OIDC-Subject'] = String(subject)
    }
    const name = localUser.value?.name || currentUser?.name || currentUser?.preferred_username
    if (name) {
      headers['X-OIDC-Name'] = String(name)
    }
    const email = localUser.value?.email || currentUser?.email
    if (email) {
      headers['X-OIDC-Email'] = String(email)
    }
    return headers
  }

  function updateLocalUserProfile(user: LocalUserProfile) {
    localUser.value = user
    userName.value = user.name || userName.value
    isAdmin.value = !!user.is_admin
  }

  async function loginWithOidc(registrationToken?: string) {
    await oidc.loginWithOidc(registrationToken)
  }

  async function logout() {
    await oidc.logout()
    userName.value = ''
    isAdmin.value = false
    bootstrapRequired.value = false
    localUser.value = null
    authError.value = ''
  }

  async function checkBootstrapStatus(): Promise<boolean> {
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/bootstrap-status`)
      if (res.ok) {
        const data = await res.json()
        bootstrapRequired.value = !!data.bootstrapRequired
        return bootstrapRequired.value
      }
    } catch (e) {
      console.warn('Failed to check bootstrap status:', e)
    }
    return false
  }

  async function initAuth(): Promise<boolean> {
    const oidcAuth = await oidc.initAuth()
    if (!oidcAuth) {
      userName.value = ''
      isAdmin.value = false
      bootstrapRequired.value = false
      localUser.value = null
      return false
    }

    try {
      const token = localStorage.getItem(OIDC_STORAGE_KEYS.accessToken) || localStorage.getItem('authToken')
      const idToken = localStorage.getItem(OIDC_STORAGE_KEYS.idToken)
      const currentUser = oidc.currentUser.value

      const res = await fetch(`${getApiBaseUrl()}/auth/login`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          token,
          idToken,
          oidcSession: currentUser
            ? {
                iss: oidc.issuer.value || 'courseweaver-oidc',
                sub: currentUser.id || 'user',
                name: currentUser.name,
                preferred_username: currentUser.preferred_username || currentUser.username,
                email: currentUser.email,
              }
            : undefined,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.bootstrapRequired) {
          bootstrapRequired.value = true
          isAdmin.value = false
          userName.value = currentUser?.name || 'Authenticated User'
          localUser.value = null
          return false
        }

        bootstrapRequired.value = false
        localUser.value = data.user
        isAdmin.value = !!data.user?.is_admin
        userName.value = data.user?.name || currentUser?.name || 'User'
        return true
      }
    } catch (e) {
      console.warn('Backend login check failed:', e)
    }

    // Fallback: If backend is completely offline or unreachable
    if (oidc.currentUser.value) {
      userName.value = oidc.currentUser.value.name || ''
      isAdmin.value = !!oidc.currentUser.value.isAdmin
      return true
    }
    return false
  }

  async function submitBootstrap(secret: string): Promise<{ success: boolean; error?: string }> {
    authError.value = ''
    try {
      const token = localStorage.getItem(OIDC_STORAGE_KEYS.accessToken) || localStorage.getItem('authToken')
      const idToken = localStorage.getItem(OIDC_STORAGE_KEYS.idToken)
      const currentUser = oidc.currentUser.value

      const res = await fetch(`${getApiBaseUrl()}/auth/bootstrap-admin`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          bootstrapSecret: secret,
          token,
          idToken,
          oidcSession: currentUser
            ? {
                iss: oidc.issuer.value || 'courseweaver-oidc',
                sub: currentUser.id || 'user',
                name: currentUser.name,
                preferred_username: currentUser.preferred_username || currentUser.username,
                email: currentUser.email,
              }
            : undefined,
        }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        bootstrapRequired.value = false
        localUser.value = data.user
        isAdmin.value = true
        userName.value = data.user?.name || userName.value
        return { success: true }
      } else {
        const errMsg = data.error || (res.status === 401 ? 'Invalid bootstrap secret' : 'Bootstrap failed')
        authError.value = errMsg
        return { success: false, error: errMsg }
      }
    } catch (e: any) {
      const errMsg = e.message || 'Network error during bootstrap submission'
      authError.value = errMsg
      return { success: false, error: errMsg }
    }
  }

  return {
    userName,
    isAdmin,
    bootstrapRequired,
    localUser,
    authError,
    isAuthenticated,
    isOidcAuthenticated,
    authMethod,
    loginWithOidc,
    logout,
    initAuth,
    checkBootstrapStatus,
    submitBootstrap,
    getAuthHeaders,
    updateLocalUserProfile,
  }
})
