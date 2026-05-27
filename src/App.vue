<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { clearSession, useAuth } from './services/authStore'

const router = useRouter()
const { user, isAuthenticated } = useAuth()
const userLabel = computed(() => user.value?.name || user.value?.email || '')

function handleLogout() {
  clearSession()
  router.push('/login')
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">ЛР1 · SPA</p>
        <h1>Infrastructure Safety</h1>
      </div>
      <nav class="nav">
        <RouterLink to="/">Список</RouterLink>
        <RouterLink v-if="isAuthenticated" to="/add">Добавить</RouterLink>
      </nav>
      <div class="auth-nav">
        <template v-if="isAuthenticated">
          <span class="auth-user">{{ userLabel }}</span>
          <button class="button button--ghost" type="button" @click="handleLogout">Выйти</button>
        </template>
        <template v-else>
          <RouterLink class="button button--ghost" to="/login">Вход</RouterLink>
          <RouterLink class="button button--primary" to="/register">Регистрация</RouterLink>
        </template>
      </div>
    </header>

    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>
