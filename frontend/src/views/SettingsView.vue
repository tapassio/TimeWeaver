<template>
  <v-container fluid>
    <v-row>
      <!-- linke Nav-Spalte -->
      <v-col cols="12" md="3">
        <v-card variant="outlined" class="pa-2">
          <v-list nav density="compact">
            <v-list-item
              v-for="s in sections"
              :key="s.key"
              :active="activeSection === s.key"
              :prepend-icon="s.icon"
              :title="s.title"
              @click="activeSection = s.key"
            />
          </v-list>
        </v-card>
      </v-col>

      <v-col cols="12" md="9">
        <!-- 1. Authentification -->
        <v-card v-if="activeSection === 'auth'" class="mb-4">
          <v-card-title>Authentication &amp; OIDC Settings</v-card-title>
          <v-card-text>
            <v-form @submit.prevent="handleSave">
              <v-select
                v-model="providerType"
                label="OIDC Provider Type"
                :items="[
                  { title: 'docPouch (OIDC Provider)', value: 'docpouch' },
                  { title: 'EduID / Generic OpenID Connect', value: 'generic' }
                ]"
                item-title="title" item-value="value"
                variant="outlined" density="compact" class="mb-2"
              />
              <v-text-field
                v-model="oidcIssuer"
                label="OIDC Issuer URL"
                placeholder="http://localhost:3030/oidc"
                hint="Discovery / issuer URL of your OIDC identity provider"
                :rules="[urlRule]" variant="outlined" density="compact" required
              />
              <v-text-field
                v-model="oidcClientId" label="OIDC Client ID"
                placeholder="courseweaver-client" variant="outlined" density="compact"
              />
              <v-text-field
                v-if="providerType === 'docpouch'"
                v-model="oidcRegistrationToken" label="OIDC Registration Token (docPouch)"
                type="password" placeholder="TestToken" variant="outlined" density="compact"
              />
              <v-alert v-if="registerError" type="error" density="compact" class="mt-2">{{ registerError }}</v-alert>
              <v-alert v-if="registerSuccess" type="success" density="compact" class="mt-2">
                Settings saved successfully!
              </v-alert>
              <v-btn type="submit" color="primary" class="mt-3" :loading="isRegistering">Save Authentication</v-btn>
            </v-form>
          </v-card-text>
        </v-card>

        <!-- 2. Database & API -->
        <v-card v-if="activeSection === 'database'">
          <v-card-title>Database &amp; API Settings</v-card-title>
          <v-card-text>
            <p class="text-body-2 mb-4 text-medium-emphasis">
              CourseWeaver persists curricula, modules, taxonomy, and rooms in PostgreSQL (JSONB entity store).
            </p>
            <v-form @submit.prevent="handleSave">
              <v-text-field
                v-model="dbApiUrl" label="Backend API URL"
                placeholder="http://localhost:3000/api" variant="outlined" density="compact" class="mb-2"
              />
              <v-row>
                <v-col cols="12" md="8">
                  <v-text-field v-model="dbHost" label="PostgreSQL Host" placeholder="localhost" variant="outlined" density="compact" />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field v-model="dbPort" label="PostgreSQL Port" type="number" variant="outlined" density="compact" />
                </v-col>
              </v-row>
              <v-text-field v-model="dbName" label="Database Name" placeholder="courseweaver" variant="outlined" density="compact" class="mb-2" />
              <v-alert v-if="registerError" type="error" density="compact">{{ registerError }}</v-alert>
              <v-btn color="primary" class="mt-2" type="submit" :loading="isRegistering">Save Database Settings</v-btn>
              <v-btn variant="text" color="error" class="ms-2" @click="handleClear">Clear All Data</v-btn>
            </v-form>
          </v-card-text>
        </v-card>

        <!-- 3. Darstellung -->
        <v-card v-if="activeSection === 'display'">
          <v-card-title>Darstellung der App</v-card-title>
          <v-card-text>
            <div class="d-flex align-center ga-4 mb-4">
              <v-switch
                v-model="isDark"
                color="primary"
                density="compact"
                hide-details
                label="Dark Mode"
              />
              <v-icon>{{ isDark ? 'mdi-moon-waning-crescent' : 'mdi-white-balance-sunny' }}</v-icon>
              <span class="text-caption text-medium-emphasis">
                (wird im Browser dauerhaft gespeichert, Vuetify Theme)
              </span>
            </div>
            <v-divider class="my-2" />
            <v-label class="text-caption text-medium-emphasis mb-1">Benutzeroberfläche</v-label>
            <v-select
:model-value="languageRef"
              @update:model-value="(lang: UiLanguage) => setLanguage(lang)"
              label="Oberflächensprache (voreingestellt: Deutsch)"
              :items="[
                { title: 'Deutsch (Default)', value: 'de' },
                { title: 'English', value: 'en' },
              ]" item-title="title" item-value="value"
              variant="outlined" density="compact" hide-details
            />
            <v-alert type="info" variant="tonal" class="mt-4">
              Drawing/theme preference is stored per browser (localStorage) — later exchangeable with a lightweight back-end user profile.
            </v-alert>
          </v-card-text>
        </v-card>

        <!-- 4. Defaults -->
        <v-card v-if="activeSection === 'defaults'">
          <v-card-title>Voreinstellungen (Departement / Programm / Semester)</v-card-title>
          <v-card-text>
            <p class="text-body-2 mb-4">
              Diese Voreinstellung bestimmt die im Programm vorgewählten Programm-/Semesterfilter (Planung, Mapping).
            </p>
            <v-select
              <v-combobox
              v-model="defaultDepartment"
              :items="['alle Departements', 'BFH-W', 'BFH-G', 'BFH-T', 'BFH-S']"
              label="Departement (freie Eingabe möglich)"
              hint="Freitext erlaubt — z.B. 'BFH-W' (Default) oder ein beliebiger Name"
              persistent-hint
              variant="outlined" density="compact" class="mb-2"
            />
            <v-select
              v-model="defaultProgram"
              :items="programOptions"
              label="Standard-Masterprogramm"
              variant="outlined" density="compact" class="mb-2"
            />
            <v-select
              v-model="defaultSemester"
              :items="semesterOptions"
              label="Standard-Semester"
              variant="outlined" density="compact" class="mb-2"
            />

            <!-- Kapitl Planungs-Voreinstellungen: erlaubte Wochentage + KW-Range -->
            <v-label class="text-caption text-medium-emphasis mb-1">Planungs-Kalender</v-label>
            <v-select
              v-model="planningDays"
              :items="weekdayOptions"
              label="Verfügbare Wochentage für On-Campus (Default: Do–Sa)"
              multiple chips closable-tags
              variant="outlined" density="compact" class="mb-2"
            />
            <v-row dense class="mb-1">
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model.number="startKW"
                  type="number" min="1" max="52"
                  label="Start-KW (leer = Default HS 39 / FS 6)"
                  variant="outlined" density="compact" clearable
                />
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model.number="endKW"
                  type="number" min="1" max="52"
                  label="End-KW (leer = Default HS 51 / FS 23)"
                  variant="outlined" density="compact" clearable
                />
              </v-col>
            </v-row>
            <v-btn color="primary" @click="saveDefaults">Save Defaults</v-btn>
            <v-alert v-if="defaultsSaved" type="success" density="compact" class="mt-2">
              Standard-Einstellungen gespeichert.
            </v-alert>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useOidc, type OidcProviderType } from '@/composables/useOidc'
import { usePostgres } from '@/composables/usePostgres'
import { useTheme } from 'vuetify'
import { useI18n, type UiLanguage } from '@/composables/useI18n'
import { loadAppDefaults, saveAppDefaults, WEEKDAY_LABELS, DEFAULT_PLANNING_DAYS, type PlanningDefaults } from '@/composables/useAppDefaults'

const activeSection = ref<'auth' | 'database' | 'display' | 'defaults'>('auth')

const sections = [
  { key: 'auth', title: 'Authentication', icon: 'mdi-lock' },
  { key: 'database', title: 'Database & API', icon: 'mdi-database' },
  { key: 'display', title: 'Darstellung', icon: 'mdi-palette' },
  { key: 'defaults', title: 'Standards (Departement/Programm)', icon: 'mdi-tune-vertical' },
] as const

const oidc = useOidc()
const postgres = usePostgres()
const vuetify = useTheme()
const { setLanguage, language: languageRef } = useI18n()

const providerType = ref<OidcProviderType>('generic')
const oidcIssuer = ref('')
const oidcClientId = ref('')
const oidcRegistrationToken = ref('')
const dbApiUrl = ref('')
const dbHost = ref('localhost')
const dbPort = ref('5432')
const dbName = ref('courseweaver')
const isRegistering = ref(false)
const registerError = ref('')
const registerSuccess = ref(false)
const isDark = ref(true)

const defaultDepartment = ref('BFH-W')
const defaultProgram = ref<'all' | string>('all')
const defaultSemester = ref('all')
const planningDays = ref<Array<PlanningDefaults['planningDays'][number]>>([...DEFAULT_PLANNING_DAYS])
const startKW = ref<number | null>(null)
const endKW = ref<number | null>(null)
const defaultsSaved = ref(false)

const programOptions = computed(() => [{ value: 'all', title: 'Alle Programme' }, ...programs.value])
const semesterOptions = computed(() => [{ value: 'all', title: 'Automatisch (nächstes Semester)' }, ...semesters.value])

const programs = ref<Array<{ value: string; title: string }>>([])
const semesters = ref<Array<{ value: string; title: string }>>([])

const weekdayOptions = Object.entries(WEEKDAY_LABELS).map(([value, title]) => ({ title, value }))

const urlRule = (v: string) =>
  !v || /^https?:\/\//i.test(v) || /^[^\s:]+$/i.test(v) || 'Enter a valid URL'

onMounted(() => {
  const oSettings = oidc.loadSettings()
  providerType.value = oSettings.providerType
  oidcIssuer.value = oSettings.issuer
  oidcClientId.value = oSettings.clientId
  oidcRegistrationToken.value = oSettings.registrationToken

  const pgSettings = postgres.loadSettings()
  dbApiUrl.value = pgSettings.apiUrl
  dbHost.value = pgSettings.host
  dbPort.value = pgSettings.port.toString()
  dbName.value = pgSettings.dbName

  // Preferences (defaults) + theme preference
  const defaults = loadAppDefaults()
  defaultDepartment.value = defaults.defaultDepartment ?? 'BFH-W'
  defaultProgram.value = defaults.defaultProgram ?? 'all'
  defaultSemester.value = defaults.defaultSemester ?? ''
  if (defaults.planning?.planningDays?.length) planningDays.value = defaults.planning.planningDays
  startKW.value = defaults.planning?.startKW ?? null
  endKW.value = defaults.planning?.endKW ?? null
  // theme preference aus Persistenz Biblical initialisieren
  const themePref = localStorage.getItem('courseweaver_theme')
  // theme initial
  isDark.value = themePref ? themePref === 'dark' : true

  // Dropdown options für Defaults (best effort — keine Fehlerwurst wenn nicht erreichbar)
  void (async () => {
    try {
      const [progs, sems] = await Promise.all([
        fetch('/api/programs').then(r => (r.ok ? r.json() : [])),
        fetch('/api/semesters').then(r => (r.ok ? r.json() : [])),
      ])
      programs.value = progs.map((p: any) => ({ value: p._id, title: p.title ?? p.name ?? p._id }))
      semesters.value = sems.map((s: any) => ({ value: s._id, title: s.identifier }))
    } catch {
      // Dropdown einfach leer lassen
    }
  })()
})


watch(isDark, (v) => {
  vuetify.global.name.value = v ? 'dark' : 'light'
  localStorage.setItem('courseweaver_theme', v ? 'dark' : 'light')
})

async function handleSave() {
  registerSuccess.value = false
  registerError.value = ''
  isRegistering.value = true
  try {
    oidc.saveSettings(
      oidcIssuer.value,
      oidcClientId.value,
      providerType.value,
      oidcRegistrationToken.value,
    )
    postgres.saveSettings({
      apiUrl: dbApiUrl.value,
      host: dbHost.value,
      port: parseInt(dbPort.value) || 5432,
      dbName: dbName.value,
    })
    registerSuccess.value = true
  } catch (e: any) {
    registerError.value = e?.message || 'Failed to save settings.'
  } finally {
    isRegistering.value = false
  }
}

function toKwOrNull(v: number | string | null | undefined): number | null {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}

function saveDefaults() {
  saveAppDefaults({
    defaultDepartment: defaultDepartment.value,
    defaultProgram: defaultProgram.value,
    defaultSemester: defaultSemester.value,
    planning: {
      // Planungs-Voreinstellungen (Tage + KW-Range): planningDays-Array in usePlanning
      planningDays: (planningDays.value.length ? planningDays.value : [...DEFAULT_PLANNING_DAYS]) as PlanningDefaults['planningDays'],
      startKW: toKwOrNull(startKW.value),
      endKW: toKwOrNull(endKW.value),
    },
  })
  defaultsSaved.value = true
}

function handleClear() {
  oidc.clearSettings()
  postgres.clearSettings()
  oidcIssuer.value = ''
  oidcClientId.value = ''
  oidcRegistrationToken.value = ''
  providerType.value = 'generic'
  dbApiUrl.value = ''
  dbHost.value = 'localhost'
  dbPort.value = '5432'
  dbName.value = 'courseweaver'
  registerSuccess.value = false
}

function goBack() {
  void 0
}
void goBack
</script>
