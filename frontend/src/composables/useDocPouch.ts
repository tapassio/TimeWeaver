import { ref, computed } from 'vue'
import { useOidc } from '@/composables/useOidc'
import { usePostgres } from '@/composables/usePostgres'

export function useDocPouch() {
  const oidc = useOidc()
  const postgres = usePostgres()

  const url = ref(oidc.issuer.value)
  const port = ref(postgres.port.value)
  const registrationToken = ref(oidc.registrationToken.value)
  const realtimeEnabled = ref(false)

  const isConfigured = computed(() => oidc.isConfigured.value)
  const isAuthenticated = computed(() => oidc.isAuthenticated.value)
  const authMethod = computed(() => oidc.authMethod.value)
  const authError = computed(() => oidc.authError.value)
  const isRegistering = computed(() => oidc.isRegistering.value)
  const registerError = computed(() => oidc.registerError.value)
  const clientId = computed(() => oidc.clientId.value)
  const client = computed(() => oidc.docPouchInstance.value)

  async function initService(): Promise<boolean> {
    return await oidc.initAuth()
  }

  async function loginWithOidc(tokenParam?: string): Promise<void> {
    await oidc.loginWithOidc(tokenParam)
  }

  async function performRegistration(token: string): Promise<boolean> {
    return await oidc.performRegistration(token)
  }

  async function logout(): Promise<void> {
    await oidc.logout()
  }

  function saveSettings(newUrl: string, newPort: number, newRegistrationToken: string) {
    url.value = newUrl
    port.value = newPort
    registrationToken.value = newRegistrationToken
    oidc.saveSettings(newUrl, oidc.clientId.value, 'docpouch', newRegistrationToken)
    postgres.saveSettings({ port: newPort })
  }

  function clearSettings() {
    oidc.clearSettings()
    postgres.clearSettings()
  }

  function clearAuthError() {
    oidc.clearAuthError()
  }

  function enableRealtimeIfConfigured() {
    // No-op for Postgres JSONB persistence
  }

  function toggleRealtime(enabled: boolean) {
    realtimeEnabled.value = enabled
  }

  function loadSettings(): { url: string; port: string; registrationToken: string } {
    const oSettings = oidc.loadSettings()
    const pgSettings = postgres.loadSettings()
    return {
      url: oSettings.issuer,
      port: pgSettings.port.toString(),
      registrationToken: oSettings.registrationToken,
    }
  }

  function getBaseUrl(): string {
    return oidc.issuer.value
  }

  function hasOidcCallbackParams(): boolean {
    return oidc.hasOidcCallbackParams()
  }

  return {
    client,
    url,
    port,
    registrationToken,
    clientId,
    realtimeEnabled,
    isConfigured,
    isAuthenticated,
    authMethod,
    authError,
    isRegistering,
    registerError,
    initService,
    loginWithOidc,
    performRegistration,
    logout,
    saveSettings,
    clearSettings,
    clearAuthError,
    enableRealtimeIfConfigured,
    toggleRealtime,
    loadSettings,
    getBaseUrl,
    hasOidcCallbackParams,
  }
}
