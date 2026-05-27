import axios from 'axios'
import { clearSession, getToken } from './authStore'

const apiBase = import.meta.env.VITE_API_BASE_URL || '/api'
const normalizedBase = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase
const baseURL = `${normalizedBase}/infrastructures`

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearSession()
    }
    return Promise.reject(error)
  },
)

export async function getInfrastructures() {
  const { data } = await api.get('/')
  return data
}

export async function getInfrastructureById(id) {
  const { data } = await api.get(`/${id}`)
  return data
}

export async function createInfrastructure(payload) {
  const { data } = await api.post('/', payload)
  return data
}

export async function updateInfrastructure(id, payload) {
  const { data } = await api.put(`/${id}`, payload)
  return data
}

export async function deleteInfrastructure(id) {
  await api.delete(`/${id}`)
}
