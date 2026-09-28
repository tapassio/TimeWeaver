<template>
  <v-container class="fill-height" fluid>
    <v-row align="center" justify="center">
      <v-col cols="12" sm="8" md="5">
        <v-card class="elevation-4 pa-4 rounded-lg">
          <v-card-title class="text-h5 text-center font-weight-bold">CourseWeaver</v-card-title>
          <v-card-subtitle class="text-center mb-4">Curriculum Mapping &amp; Academic Scheduling</v-card-subtitle>

          <v-card-text>
            <!-- Case 1: OIDC provider not configured -->
            <div v-if="!isConfigured" class="text-center mb-4">
              <v-alert type="warning" variant="tonal" class="mb-3">
                OIDC identity provider is not configured yet.
              </v-alert>
              <v-btn color="primary" to="/settings">
                Configure Settings
              </v-btn>
            </div>

            <!-- Case 2: Administrator Bootstrap Required -->
            <div v-else-if="bootstrapRequired">
              <v-alert type="info" variant="tonal" class="mb-4" icon="mdi-shield-crown">
                <div class="font-weight-bold mb-1">First-Time Deployment Bootstrap</div>
                <div>
                  No administrator account exists. Enter the deployment <code>BOOTSTRAP_ADMIN_SECRET</code> to initialize this system and establish your administrator rights.
                </div>
              </v-alert>

              <v-alert v-if="authError || auth.authError" type="error" density="compact" class="mb-3">
                {{ authError || auth.authError }}
              </v-alert>

              <v-form @submit.prevent="handleBootstrapSubmit">
                <v-text-field
                  v-model="bootstrapSecret"
                  label="Bootstrap Admin Secret"
                  placeholder="Enter BOOTSTRAP_ADMIN_SECRET"
                  variant="outlined"
                  density="comfortable"
                  :type="showSecret ? 'text' : 'password'"
                  :append-inner-icon="showSecret ? 'mdi-eye-off' : 'mdi-eye'"
                  @click:append-inner="showSecret = !showSecret"
                  class="mb-3"
                  required
                />

                <v-btn
                  color="primary"
                  block
                  size="large"
                  :loading="isBootstrapping"
                  :disabled="!bootstrapSecret.trim()"
                  type="submit"
                >
                  <v-icon start>mdi-shield-check</v-icon>
                  Create Initial Administrator
                </v-btn>

                <div class="text-center mt-3">
                  <v-btn variant="text" size="small" @click="handleLogout">
                    <v-icon start>mdi-logout</v-icon>
                    Cancel / Sign Out
                  </v-btn>
                </div>
              </v-form>
            </div>

            <!-- Case 3: Normal OIDC Login Screen -->
            <div v-else>
              <v-alert v-if="authError || oidc.authError.value" type="error" density="compact" class="mb-3">
                {{ authError || oidc.authError.value }}
              </v-alert>

              <v-btn
                color="primary"
                block
                size="large"
                :disabled="!isConfigured"
                :loading="isLoggingIn"
                @click="handleLogin"
              >
                <v-icon start>mdi-login</v-icon>
                Log in with OIDC ({{ providerName }})
              </v-btn>

              <div class="text-center mt-4">
                <v-btn variant="text" size="small" to="/settings">
                  <v-icon start>mdi-cog</v-icon>
                  Server &amp; OIDC Settings
                </v-btn>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useOidc } from '@/composables/useOidc'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const oidc = useOidc()
const auth = useAuthStore()

const isConfigured = computed(() => oidc.isConfigured.value)
const authError = ref('')
const providerName = computed(() => (oidc.providerType.value === 'docpouch' ? 'docPouch' : 'EduID / OIDC'))

const bootstrapRequired = computed(() => auth.bootstrapRequired)
const bootstrapSecret = ref('')
const showSecret = ref(false)
const isLoggingIn = ref(false)
const isBootstrapping = ref(false)

onMounted(async () => {
  const authenticated = await auth.initAuth()
  if (authenticated) {
    router.replace({ name: 'dashboard' })
  }
})

async function handleLogin() {
  authError.value = ''
  oidc.clearAuthError()
  isLoggingIn.value = true
  try {
    await oidc.loginWithOidc()
  } catch (err: any) {
    authError.value = err?.message || 'Login failed'
  } finally {
    isLoggingIn.value = false
  }
}

async function handleBootstrapSubmit() {
  if (!bootstrapSecret.value.trim()) return
  authError.value = ''
  isBootstrapping.value = true

  try {
    const result = await auth.submitBootstrap(bootstrapSecret.value.trim())
    if (result.success) {
      router.replace({ name: 'dashboard' })
    } else {
      authError.value = result.error || 'Invalid bootstrap secret'
    }
  } catch (err: any) {
    authError.value = err?.message || 'Bootstrap request failed'
  } finally {
    isBootstrapping.value = false
  }
}

async function handleLogout() {
  await auth.logout()
  bootstrapSecret.value = ''
  authError.value = ''
}
</script>
