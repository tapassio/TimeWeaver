<template>
  <v-app>
    <v-app-bar color="primary" prominent>
      <v-app-bar-nav-icon @click="drawer = !drawer" />
      <v-app-bar-title>
        <img
          src="/Logo.png"
          class="bar-logo"
          alt="TimeWeaver"
          role="button"
          tabindex="0"
          @click="goHome"
          @keydown.enter.prevent="goHome"
        >
      </v-app-bar-title>
      <v-spacer />
      <v-btn icon to="/settings" v-if="auth.isAuthenticated">
        <v-icon>mdi-cog</v-icon>
        <v-tooltip activator="parent">Settings</v-tooltip>
      </v-btn>
      <v-btn v-if="auth.isAuthenticated" icon @click="handleLogout">
        <v-icon>mdi-logout</v-icon>
        <v-tooltip activator="parent">Logout</v-tooltip>
      </v-btn>
    </v-app-bar>

    <v-navigation-drawer v-model="drawer" temporary>
      <div class="brand" role="button" tabindex="0" @click="goHome" @keydown.enter.prevent="goHome">
        <img src="/Logo.png" class="brand-logo" alt="TimeWeaver" />
      </div>
      <v-list nav>
        <v-list-item
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          :prepend-icon="item.icon"
          :title="item.title"
          @click="drawer = false"
        />
      </v-list>
      <template v-slot:append>
        <div class="user-card" @click="userMenuOpen = !userMenuOpen">
          <span class="avatar">{{ initials }}</span>
          <div class="user-info">
            <div class="user-name">{{ userName || 'Unbekannt' }}</div>
            <div class="user-sub">{{ userRole || 'BFH' }}</div>
          </div>
          <v-icon size="small" color="grey">mdi-chevron-down</v-icon>
        </div>
        <div v-if="userMenuOpen" class="user-menu">
          <div class="user-role-label">{{ userEmail }}<br><span style="font-size:11px">Rolle: {{ isAdminLabel }}</span></div>
          <v-btn small class="mb-2" block variant="tonal" color="error" @click="handleLogout">Abmelden</v-btn>
        </div>
        <v-list-item
          to="/settings"
          prepend-icon="mdi-cog-outline"
          title="Einstellungen"
          @click="drawer = false"
        />
      </template>
    </v-navigation-drawer>

    <v-main>
      <router-view />
    </v-main>
  </v-app>
</template>
<style scoped>
.link-item {
  color: inherit;
  text-decoration: none;
}
.bar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
.bar-logo {
  height: 45px;
  width: auto;
  display: block;
  cursor: pointer;
  /* freigestellt: nur Symbol+ Schrift, kein Hintergrund */
}
.bar-logo ~ span,
.bar-brand > span {
  font-weight: 600;
}
.brand-logo {
  height: 26px;
  width: auto;
  display: block;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px 20px;
  font-weight: 700;
  font-size: 16px;
  cursor: pointer;
}
.brand:hover {
  background: rgba(25, 118, 210, 0.08);
}
.user-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 8px;
  border-radius: 12px;
  background: rgba(var(--v-theme-surface-variant), 0.4);
  cursor: pointer;
  margin: 8px;
}
.user-card:hover {
  background: rgba(25, 118, 210, 0.06);
}
.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #1976d2;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}
.user-info { flex: 1; min-width: 0; }
.user-name { font-size: 13px; font-weight: 600; line-height: 1.1; }
.user-sub {
  font-size: 11.5px;
  color: rgba(0,0,0,0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.user-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  margin: 0 8px 4px;
  background: rgba(255,255,255,0.98);
  border: 1px solid rgba(0,0,0,0.12);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}
.user-role-label {
  padding: 8px 10px;
  font-size: 12px;
  color: rgba(0,0,0,0.6);
}
</style>


<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useOidc } from '@/composables/useOidc'
import { useI18n } from '@/composables/useI18n'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

const drawer = ref(false)
const auth = useAuthStore()
const oidc = useOidc()

const userMenuOpen = ref(false)
const userName = computed(() => auth.userName || oidc.currentUser.value?.name || 'Anonym')
const userEmail = computed(() => oidc.currentUser.value?.email ?? '')
const isAdminLabel = computed(() => (auth.isAdmin ? 'Admin' : 'Benutzer'))
const userRole = computed(() => auth.isAdmin ? 'Administration' : 'Programmleitung · BFH')
const initials = computed(() => {
  const parts = userName.value.split(' ')
  const a = parts[0]?.[0] ?? 'U'
  const b = parts[1]?.[0] ?? ''
  return (a + b).toUpperCase()
})
const router = useRouter()
const { t } = useI18n()

function goHome(): void {
  drawer.value = false
  void router.push('/')
}

function closeDrawerAfterNavigation() {
  drawer.value = false
}

onMounted(() => {
  router.afterEach(closeDrawerAfterNavigation)
})

const navItems = computed(() => {
  const items = [
    { title: t('nav.dashboard'), icon: 'mdi-view-dashboard', to: '/' },
    { title: t('nav.curriculum'), icon: 'mdi-book-education', to: '/curriculum' },
    { title: t('nav.schedule'), icon: 'mdi-calendar-clock', to: '/schedule' },
    { title: t('nav.modules'), icon: 'mdi-view-module', to: '/modules' },
    // "Mapping" bewusst nicht als eigener Nav-Punkt: die Mapping/Review-Matrix
    // (/mapping, MappingView) ist Schritt 5 der Pipeline in /curriculum und via
    // Stepper erreichbar; der Legacy-Nav-Eintrag zeigte auf denselben Screen.
    { title: t('nav.constraints'), icon: 'mdi-filter-variant', to: '/constraints' },
    { title: t('nav.todos'), icon: 'mdi-clipboard-check-outline', to: '/todos' },
    { title: t('nav.taxonomy'), icon: 'mdi-sitemap', to: '/taxonomy' },
    { title: t('nav.rooms'), icon: 'mdi-door-open', to: '/rooms' },
  ]
  if (auth.isAdmin) {
    items.push({ title: t('nav.admin'), icon: 'mdi-shield-account', to: '/admin' })
  }
  return items
})

async function handleLogout() {
  await auth.logout()
  router.push({ name: 'login' })
}
</script>