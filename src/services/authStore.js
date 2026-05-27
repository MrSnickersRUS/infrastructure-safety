import { computed, ref } from 'vue'

const TOKEN_KEY = 'infra_token'
const USER_KEY = 'infra_user'

const isBrowser = typeof window !== 'undefined'

function readUser() {
  if (!isBrowser) return null
  const raw = window.localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const token = ref(isBrowser ? window.localStorage.getItem(TOKEN_KEY) || '' : '')
const user = ref(isBrowser ? readUser() : null)

const isAuthenticated = computed(() => Boolean(token.value))

export function setSession({ token: newToken, user: newUser }) {
  token.value = newToken
  user.value = newUser
  if (isBrowser) {
    window.localStorage.setItem(TOKEN_KEY, newToken)
    window.localStorage.setItem(USER_KEY, JSON.stringify(newUser))
  }
}

export function clearSession() {
  token.value = ''
  user.value = null
  if (isBrowser) {
    window.localStorage.removeItem(TOKEN_KEY)
    window.localStorage.removeItem(USER_KEY)
  }
}

export function getToken() {
  return token.value
}

export function useAuth() {
  return { token, user, isAuthenticated }
}
