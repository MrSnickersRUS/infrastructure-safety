<script setup>
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { register } from '../services/authApi'
import { setSession } from '../services/authStore'

const name = ref('')
const email = ref('')
const password = ref('')
const passwordRepeat = ref('')
const loading = ref(false)
const error = ref('')

const router = useRouter()

async function handleSubmit() {
  error.value = ''
  if (password.value !== passwordRepeat.value) {
    error.value = 'Пароли не совпадают.'
    return
  }
  if (password.value.length < 6) {
    error.value = 'Пароль должен быть не короче 6 символов.'
    return
  }

  loading.value = true
  try {
    const data = await register({
      name: name.value,
      email: email.value,
      password: password.value,
    })
    setSession(data)
    router.push('/')
  } catch (requestError) {
    error.value = 'Не удалось зарегистрироваться.'
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
          <p class="eyebrow">Новый пользователь</p>
          <h1>Регистрация</h1>
          <p class="muted">Создайте учетную запись для работы с объектами.</p>
        </div>
      </div>

      <form class="form form--single" @submit.prevent="handleSubmit">
        <label class="form__full">
          <span>Имя</span>
          <input v-model="name" type="text" placeholder="Иван Иванов" required />
        </label>

        <label class="form__full">
          <span>Email</span>
          <input v-model="email" type="email" placeholder="user@example.com" required />
        </label>

        <label class="form__full">
          <span>Пароль</span>
          <input v-model="password" type="password" placeholder="Минимум 6 символов" required />
        </label>

        <label class="form__full">
          <span>Повторите пароль</span>
          <input v-model="passwordRepeat" type="password" placeholder="Повторите пароль" required />
        </label>

        <p v-if="error" class="state state--error">{{ error }}</p>

        <div class="form__actions form__full">
          <button class="button button--primary" type="submit" :disabled="loading">
            {{ loading ? 'Создаем...' : 'Зарегистрироваться' }}
          </button>
          <RouterLink class="button button--ghost" to="/login">Уже есть аккаунт</RouterLink>
        </div>
      </form>
    </div>
  </section>
</template>
