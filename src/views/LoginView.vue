<script setup>
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { login } from '../services/authApi'
import { setSession } from '../services/authStore'

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

const route = useRoute()
const router = useRouter()
const redirectTo = computed(() => (route.query.redirect ? String(route.query.redirect) : '/'))

async function handleSubmit() {
  error.value = ''
  loading.value = true
  try {
    const data = await login({ email: email.value, password: password.value })
    setSession(data)
    router.push(redirectTo.value)
  } catch (requestError) {
    error.value = 'Неверный email или пароль.'
    console.error(requestError)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="page auth-page">
    <div class="auth-card">
      <div class="page__heading">
        <div>
          <p class="eyebrow">Доступ к системе</p>
          <h1>Вход</h1>
          <p class="muted">Авторизуйтесь, чтобы создавать и редактировать объекты.</p>
        </div>
      </div>

      <form class="form form--single" @submit.prevent="handleSubmit">
        <label class="form__full">
          <span>Email</span>
          <input v-model="email" type="email" placeholder="user@example.com" required />
        </label>

        <label class="form__full">
          <span>Пароль</span>
          <input v-model="password" type="password" placeholder="Введите пароль" required />
        </label>

        <p v-if="error" class="state state--error">{{ error }}</p>

        <div class="form__actions form__full">
          <button class="button button--primary" type="submit" :disabled="loading">
            {{ loading ? 'Входим...' : 'Войти' }}
          </button>
          <RouterLink class="button button--ghost" to="/register">Регистрация</RouterLink>
        </div>
      </form>
    </div>
  </section>
</template>
