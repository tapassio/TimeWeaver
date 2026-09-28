// CourseWeaver – OIDC-only login, following the pattern from SWOT's useAuth.js
import { DocPouchClient } from 'docpouch-client' // TODO: adjust import to match your actual package/path
import { ref } from 'vue'

// TODO: fill in with CourseWeaver's own OIDC client registration.
// Keep this separate from SWOT/Pulsmesser – CourseWeaver is its own app now.
const OIDC_CONFIG = {
  issuer: '',
  clientId: '',
  redirectUri: window.location.origin + '/callback',
}

const dpClient = new DocPouchClient({
  baseUrl: 'http://localhost:3032', // matches the port mapped in ../config/docker-compose.yml
})

const user = ref(null)
const isAuthenticated = ref(false)

async function login() {
  const result = await dpClient.loginWithOidc(OIDC_CONFIG)
  user.value = result.user
  isAuthenticated.value = true
}

function logout() {
  dpClient.logout()
  user.value = null
  isAuthenticated.value = false
}

export function useAuth() {
  return { user, isAuthenticated, login, logout, dpClient }
}
