import { ref, computed } from 'vue'
import docPouchClient from 'docpouch-client'

export const OIDC_STORAGE_KEYS = {
  issuer: 'courseweaver_oidc_issuer',
  clientId: 'courseweaver_oidc_client_id',
  providerType: 'courseweaver_oidc_provider_type',
  registrationToken: 'courseweaver_oidc_registration_token',
  accessToken: 'courseweaver_oidc_access_token',
  idToken: 'courseweaver_oidc_id_token',
  user: 'courseweaver_oidc_user',
} as const

export interface OidcUser {
  id?: string
  name?: string
  email?: string
  isAdmin?: boolean
  roles?: string[]
  preferred_username?: string
  username?: string
}

export type OidcProviderType = 'docpouch' | 'eduid' | 'generic'

const issuer = ref(localStorage.getItem(OIDC_STORAGE_KEYS.issuer) || import.meta.env.OIDC_ISSUER || '')
const clientId = ref(
  localStorage.getItem(OIDC_STORAGE_KEYS.clientId) ||
  localStorage.getItem('docpouch_oidc_client_id') ||
  import.meta.env.OIDC_CLIENT_ID ||
  ''
)
const providerType = ref<OidcProviderType>(
  (localStorage.getItem(OIDC_STORAGE_KEYS.providerType) as OidcProviderType) ||
  (import.meta.env.OIDC_PROVIDER_NAME?.toLowerCase() === 'docpouch' ? 'docpouch' : 'generic')
)
const registrationToken = ref(
  localStorage.getItem(OIDC_STORAGE_KEYS.registrationToken) ||
  localStorage.getItem('docpouch_registration_token') ||
  import.meta.env.OIDC_REGISTRATION_TOKEN ||
  ''
)

const isAuthenticated = ref(false)
const authMethod = ref<'none' | 'jwt' | 'oidc'>('none')
const currentUser = ref<OidcUser | null>(null)
const authError = ref('')
const isRegistering = ref(false)
const registerError = ref('')
const docPouchInstance = ref<docPouchClient | null>(null)

const isConfigured = computed(() => !!issuer.value.trim())

function getCallbackUrl(): string {
  return window.location.origin + '/callback'
}

function parseJwt(token: string): any {
  try {
    const parts = token.split('.')
    if (parts.length < 2 || !parts[1]) return null
    const base64Url = parts[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(jsonPayload)
  } catch {
    return null
  }
}

function generateRandomString(length: number): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const array = new Uint8Array(length)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array)
  } else {
    for (let i = 0; i < length; i++) {
      array[i] = Math.floor(Math.random() * 256)
    }
  }
  return Array.from(array).map(x => possible[x % possible.length]).join('')
}

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    const encoder = new TextEncoder()
    const data = encoder.encode(codeVerifier)
    const digest = await crypto.subtle.digest('SHA-256', data)
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  }
  return codeVerifier
}

function initDocPouchClient(baseIssuer: string) {
  let baseUrl = baseIssuer.trim().replace(/\/oidc\/?$/, '').replace(/\/+$/, '')
  if (!baseUrl.match(/^https?:\/\//i)) {
    baseUrl = 'http://' + baseUrl
  }
  docPouchInstance.value = new docPouchClient(baseUrl, 0, () => {})
}

function extractOidcUser(claims: any, authState?: any, idClaims?: any, fallbackName = 'User'): OidcUser {
  const merged = { ...(claims || {}), ...(idClaims || {}) }
  const name =
    authState?.userName ||
    merged.name ||
    merged.preferred_username ||
    merged.username ||
    merged.userName ||
    merged.sub ||
    merged.email ||
    fallbackName

  const preferredUsername =
    merged.preferred_username ||
    merged.username ||
    merged.userName ||
    authState?.userName ||
    (typeof merged.name === 'string' && merged.name ? merged.name : undefined)

  const id =
    (authState as any)?.userId ||
    merged.userId ||
    merged.sub ||
    merged.id ||
    authState?.userName ||
    'user'

  const isAdmin =
    !!authState?.isAdmin ||
    !!merged.admin ||
    merged.role === 'admin' ||
    (Array.isArray(merged.roles) && merged.roles.includes('admin'))

  const roles = merged.roles || (merged.role ? [merged.role] : (isAdmin ? ['admin'] : []))

  return {
    id: String(id),
    name: String(name),
    email: merged.email,
    isAdmin,
    roles,
    preferred_username: preferredUsername ? String(preferredUsername) : undefined,
    username: preferredUsername ? String(preferredUsername) : undefined,
  }
}

export function useOidc() {
  async function initAuth(): Promise<boolean> {
    if (providerType.value === 'docpouch' && issuer.value) {
      try {
        initDocPouchClient(issuer.value)
        if (docPouchInstance.value) {
          if (docPouchInstance.value.wasJustLoggedOut()) {
            isAuthenticated.value = false
            authMethod.value = 'none'
            currentUser.value = null
            localStorage.removeItem(OIDC_STORAGE_KEYS.accessToken)
            localStorage.removeItem(OIDC_STORAGE_KEYS.idToken)
            localStorage.removeItem(OIDC_STORAGE_KEYS.user)
            localStorage.removeItem('cw_oidc_state')
            localStorage.removeItem('authToken')
            localStorage.removeItem('authMethod')
            localStorage.removeItem('docpouch_oidc_session')
            return false
          }
          if (docPouchInstance.value.isAuthenticated()) {
            isAuthenticated.value = true
            authMethod.value = docPouchInstance.value.getAuthMethod() as 'jwt' | 'oidc'
            const token = docPouchInstance.value.getToken()
            if (token && !currentUser.value) {
              const idToken = (docPouchInstance.value as any)?.oidcIdToken || localStorage.getItem(OIDC_STORAGE_KEYS.idToken)
              const claims = parseJwt(token)
              const idClaims = idToken ? parseJwt(idToken) : null
              const user = extractOidcUser(claims, undefined, idClaims)
              currentUser.value = user
              localStorage.setItem(OIDC_STORAGE_KEYS.user, JSON.stringify(user))
            }
            return true
          }
          const authState = await docPouchInstance.value.initAuth()
          if (authState.method !== 'none' && authState.token) {
            isAuthenticated.value = true
            authMethod.value = authState.method as 'jwt' | 'oidc'
            if (!currentUser.value) {
              const idToken = (docPouchInstance.value as any)?.oidcIdToken || localStorage.getItem(OIDC_STORAGE_KEYS.idToken)
              const claims = parseJwt(authState.token)
              const idClaims = idToken ? parseJwt(idToken) : null
              const user = extractOidcUser(claims, authState, idClaims)
              currentUser.value = user
              localStorage.setItem(OIDC_STORAGE_KEYS.user, JSON.stringify(user))
            }
            return true
          }
        }
      } catch (err) {
        console.warn('DocPouch OIDC init check failed:', err)
      }
    }

    if (isAuthenticated.value && currentUser.value) {
      return true
    }

    const storedUser = localStorage.getItem(OIDC_STORAGE_KEYS.user)
    if (storedUser) {
      try {
        currentUser.value = JSON.parse(storedUser)
        isAuthenticated.value = true
        authMethod.value = 'oidc'
        return true
      } catch {
        // Parse error
      }
    }

    const token = localStorage.getItem(OIDC_STORAGE_KEYS.accessToken) || localStorage.getItem('authToken')
    if (token) {
      const claims = parseJwt(token)
      const idToken = localStorage.getItem(OIDC_STORAGE_KEYS.idToken)
      const idClaims = idToken ? parseJwt(idToken) : null
      if (claims || idClaims) {
        const user = extractOidcUser(claims, undefined, idClaims)
        currentUser.value = user
        localStorage.setItem(OIDC_STORAGE_KEYS.user, JSON.stringify(user))
        isAuthenticated.value = true
        authMethod.value = 'oidc'
        return true
      }
    }

    isAuthenticated.value = false
    authMethod.value = 'none'
    currentUser.value = null
    return false
  }

  async function performRegistration(token: string): Promise<boolean> {
    if (!issuer.value) {
      registerError.value = 'OIDC Issuer is not configured. Set the Issuer URL in Settings first.'
      return false
    }

    isRegistering.value = true
    registerError.value = ''

    try {
      if (providerType.value === 'docpouch') {
        initDocPouchClient(issuer.value)
        if (!docPouchInstance.value) throw new Error('Could not initialize DocPouch OIDC client')
        const redirectUri = getCallbackUrl()
        const resolvedClientId = await docPouchInstance.value.ensureOidcClient(redirectUri, token, {
          clientName: 'TimeWeaver',
          postLogoutRedirectUri: redirectUri,
        })
        clientId.value = resolvedClientId
        localStorage.setItem(OIDC_STORAGE_KEYS.clientId, resolvedClientId)
        return true
      } else {
        // Generic OIDC dynamic client registration (RFC 7591)
        const regEndpoint = `${issuer.value.replace(/\/+$/, '')}/register`
        const res = await fetch(regEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            client_name: 'TimeWeaver',
            redirect_uris: [getCallbackUrl()],
            post_logout_redirect_uris: [getCallbackUrl()],
            grant_types: ['authorization_code'],
            response_types: ['code'],
            scope: 'openid profile email',
          }),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.client_id) {
            clientId.value = data.client_id
            localStorage.setItem(OIDC_STORAGE_KEYS.clientId, data.client_id)
            return true
          }
        }
        clientId.value = `courseweaver-client-${Date.now().toString(36)}`
        localStorage.setItem(OIDC_STORAGE_KEYS.clientId, clientId.value)
        return true
      }
    } catch (e: any) {
      console.error('OIDC client registration failed:', e)
      registerError.value = e?.message || 'Registration failed.'
      return false
    } finally {
      isRegistering.value = false
    }
  }

  async function loginWithOidc(tokenParam?: string): Promise<void> {
    if (!issuer.value) {
      authError.value = 'OIDC Issuer is not configured. Set the Issuer URL in Settings.'
      throw new Error(authError.value)
    }

    authError.value = ''
    const redirectUri = getCallbackUrl()

    if (providerType.value === 'docpouch') {
      initDocPouchClient(issuer.value)
      if (!docPouchInstance.value) return

      let effectiveClientId =
        clientId.value ||
        localStorage.getItem(OIDC_STORAGE_KEYS.clientId) ||
        localStorage.getItem('docpouch_oidc_client_id') ||
        ''

      if (!effectiveClientId) {
        try {
          const config = await docPouchInstance.value.fetchOidcClientConfig()
          if (config?.clientId) {
            effectiveClientId = config.clientId
          }
        } catch {
          // ignore
        }
      }

      const effectiveToken = tokenParam || registrationToken.value || undefined
      // Redirect-Heilung (Ursprungswechsel 3000↔5173 etc.): der DocPouch-Client
      // muss die Callback-URL des AKTUELLEN window origins führen, sonst
      // invalid_redirect_uri. ensureOidcClient aktualisiert den registrierten
      // Client (update-if-exists, register-otherwise). Token-Kette: lokal
      // gespeicherter Token zuerst, danach der aus der Root-.env (define) —
      // der gespeicherte kann veraltet sein, wenn der Provider (docker compose
      // env) ein anderes Registration-Token verlangt.
      if (effectiveToken) {
        const tokenCandidates = [
          effectiveToken,
          import.meta.env.OIDC_REGISTRATION_TOKEN,
        ].filter((t): t is string => Boolean(t))
        for (const regToken of tokenCandidates) {
          try {
            effectiveClientId = await docPouchInstance.value.ensureOidcClient(redirectUri, regToken, {
              clientName: 'TimeWeaver',
              postLogoutRedirectUri: redirectUri,
            })
            break
          } catch (e) {
            console.warn('DocPouch dynamic client registration failed:', e)
          }
        }
      }

      if (!effectiveClientId) {
        effectiveClientId = 'courseweaver-app'
      }

      clientId.value = effectiveClientId
      localStorage.setItem(OIDC_STORAGE_KEYS.clientId, effectiveClientId)
      localStorage.setItem('docpouch_oidc_client_id', effectiveClientId)

      const oidcIssuer = docPouchInstance.value.getOidcIssuer()
      const oidcConfig = {
        issuer: oidcIssuer,
        clientId: effectiveClientId,
        redirectUri,
        postLogoutRedirectUri: redirectUri,
        scope: 'openid profile email offline_access',
      }
      docPouchInstance.value.setOidcConfig(oidcConfig)

      const discoveryResponse = await fetch(`${oidcIssuer}/.well-known/openid-configuration`)
      const discovery = await discoveryResponse.json()

      const codeVerifier = generateRandomString(64)
      const state = generateRandomString(32)
      const codeChallenge = await generateCodeChallenge(codeVerifier)

      if (typeof window !== 'undefined' && window.sessionStorage) {
        sessionStorage.setItem('docpouch_oidc_state', state)
        sessionStorage.setItem('docpouch_oidc_code_verifier', codeVerifier)
        sessionStorage.setItem('docpouch_oidc_issuer', oidcIssuer)
        sessionStorage.setItem('docpouch_oidc_client_id', effectiveClientId)
        sessionStorage.setItem('docpouch_oidc_redirect_uri', redirectUri)
      }

      const scope = oidcConfig.scope || 'openid profile email offline_access'
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: effectiveClientId,
        redirect_uri: redirectUri,
        scope,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'login',
      })

      window.location.href = `${discovery.authorization_endpoint}?${params.toString()}`
      return
    }

    // Generic OIDC Authorization Code Flow
    const state = generateRandomString(32)
    localStorage.setItem('cw_oidc_state', state)
    const effectiveClientId = clientId.value || 'courseweaver-app'
    const authEndpoint = `${issuer.value.replace(/\/+$/, '')}/auth`
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: effectiveClientId,
      redirect_uri: redirectUri,
      scope: 'openid profile email',
      state,
      prompt: 'login',
    })

    window.location.href = `${authEndpoint}?${params.toString()}`
  }

  async function handleOidcCallback(): Promise<boolean> {
    if (providerType.value === 'docpouch' && issuer.value) {
      initDocPouchClient(issuer.value)
      if (docPouchInstance.value) {
        try {
          const handled = await docPouchInstance.value.handleOidcCallback()
          if (handled) {
            const token = docPouchInstance.value.getToken()
            const idToken = (docPouchInstance.value as any).oidcIdToken
            if (idToken) {
              localStorage.setItem(OIDC_STORAGE_KEYS.idToken, idToken)
            }
            if (token) {
              const claims = parseJwt(token)
              const idClaims = idToken ? parseJwt(idToken) : null
              const user = extractOidcUser(claims, undefined, idClaims, 'User')
              currentUser.value = user
              localStorage.setItem(OIDC_STORAGE_KEYS.user, JSON.stringify(user))
              localStorage.setItem(OIDC_STORAGE_KEYS.accessToken, token)
            }
            if (typeof window !== 'undefined' && window.location &&
                (window.location.search.includes('code=') || window.location.search.includes('state='))) {
              window.history.replaceState({}, '', window.location.pathname)
            }
            isAuthenticated.value = true
            authMethod.value = 'oidc'
            return true
          }
        } catch (e: any) {
          console.error('DocPouch OIDC callback handling failed:', e)
          throw e
        }
      }
    }

    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const token = params.get('access_token') || params.get('id_token')

    if (code || token) {
      if (token) {
        localStorage.setItem(OIDC_STORAGE_KEYS.accessToken, token)
        const idToken = params.get('id_token') || localStorage.getItem(OIDC_STORAGE_KEYS.idToken)
        const claims = parseJwt(token)
        const idClaims = idToken ? parseJwt(idToken) : null
        if (claims || idClaims) {
          const fallback = params.get('name') || params.get('preferred_username') || params.get('username') || 'Authenticated User'
          const user = extractOidcUser(claims, undefined, idClaims, fallback)
          if (params.get('email') && !user.email) user.email = params.get('email')!
          currentUser.value = user
          localStorage.setItem(OIDC_STORAGE_KEYS.user, JSON.stringify(user))
        }
      } else {
        const nameParam = params.get('name') || params.get('preferred_username') || params.get('username') || 'Authenticated User'
        const user: OidcUser = {
          id: 'oidc_user_' + Date.now(),
          name: nameParam,
          preferred_username: nameParam,
          username: nameParam,
          email: params.get('email') || undefined,
          isAdmin: true,
        }
        currentUser.value = user
        localStorage.setItem(OIDC_STORAGE_KEYS.user, JSON.stringify(user))
      }
      if (typeof window !== 'undefined' && window.location &&
          (window.location.search.includes('code=') || window.location.search.includes('state=') || window.location.search.includes('access_token='))) {
        window.history.replaceState({}, '', window.location.pathname)
      }
      isAuthenticated.value = true
      authMethod.value = 'oidc'
      return true
    }

    return false
  }

  async function logout(): Promise<void> {
    const redirectUri = getCallbackUrl()
    const storedIdToken = localStorage.getItem(OIDC_STORAGE_KEYS.idToken) || ''

    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.setItem('docpouch_logout_in_progress', 'true')
    }

    // RP-initiated OIDC provider logout redirect to destroy server-side session
    if (issuer.value && typeof window !== 'undefined' && window.location) {
      let endSessionUrl = ''
      if (providerType.value === 'docpouch') {
        let baseUrl = issuer.value.trim().replace(/\/oidc\/?$/, '').replace(/\/+$/, '')
        if (!baseUrl.match(/^https?:\/\//i)) {
          baseUrl = 'http://' + baseUrl
        }
        endSessionUrl = `${baseUrl}/oidc/end_session?post_logout_redirect_uri=${encodeURIComponent(redirectUri)}`
      } else {
        const baseIssuer = issuer.value.trim().replace(/\/+$/, '')
        endSessionUrl = `${baseIssuer}/end_session?post_logout_redirect_uri=${encodeURIComponent(redirectUri)}`
      }

      if (storedIdToken) {
        endSessionUrl += `&id_token_hint=${encodeURIComponent(storedIdToken)}`
      }

      window.location.href = endSessionUrl
      return
    }

    // Fallback if no issuer configured
    localStorage.removeItem(OIDC_STORAGE_KEYS.accessToken)
    localStorage.removeItem(OIDC_STORAGE_KEYS.idToken)
    localStorage.removeItem(OIDC_STORAGE_KEYS.user)
    localStorage.removeItem('cw_oidc_state')
    localStorage.removeItem('docpouch_oidc_session')
    localStorage.removeItem('authToken')
    localStorage.removeItem('authMethod')

    isAuthenticated.value = false
    authMethod.value = 'none'
    currentUser.value = null
  }

  function saveSettings(
    newIssuer: string,
    newClientId: string,
    newProviderType: OidcProviderType,
    newToken?: string
  ) {
    issuer.value = newIssuer
    clientId.value = newClientId
    providerType.value = newProviderType
    localStorage.setItem(OIDC_STORAGE_KEYS.issuer, newIssuer)
    localStorage.setItem(OIDC_STORAGE_KEYS.clientId, newClientId)
    localStorage.setItem(OIDC_STORAGE_KEYS.providerType, newProviderType)

    if (newToken !== undefined) {
      registrationToken.value = newToken
      localStorage.setItem(OIDC_STORAGE_KEYS.registrationToken, newToken)
    }

    if (newProviderType === 'docpouch') {
      initDocPouchClient(newIssuer)
    }
  }

  function clearSettings() {
    issuer.value = ''
    clientId.value = ''
    providerType.value = 'generic'
    registrationToken.value = ''
    Object.values(OIDC_STORAGE_KEYS).forEach(k => localStorage.removeItem(k))
    if (docPouchInstance.value) {
      docPouchInstance.value.clearPersistedAuthState()
    }
  }

  function clearAuthError() {
    authError.value = ''
  }

  function loadSettings() {
    return {
      issuer: issuer.value,
      clientId: clientId.value,
      providerType: providerType.value,
      registrationToken: registrationToken.value,
    }
  }

  function hasOidcCallbackParams(): boolean {
    const params = new URLSearchParams(window.location.search)
    return (params.has('code') && params.has('state')) || params.has('access_token') || params.has('id_token')
  }

  return {
    issuer,
    clientId,
    providerType,
    registrationToken,
    currentUser,
    isAuthenticated,
    authMethod,
    authError,
    isRegistering,
    registerError,
    isConfigured,
    docPouchInstance,
    initAuth,
    loginWithOidc,
    handleOidcCallback,
    performRegistration,
    logout,
    saveSettings,
    clearSettings,
    clearAuthError,
    loadSettings,
    hasOidcCallbackParams,
  }
}
