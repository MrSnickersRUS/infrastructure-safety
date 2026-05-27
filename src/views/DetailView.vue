<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { deleteInfrastructure, getInfrastructureById } from '../services/infrastructureApi'
import { useAuth } from '../services/authStore'

const route = useRoute()
const router = useRouter()

const item = ref(null)
const loading = ref(true)
const error = ref('')
const { isAuthenticated } = useAuth()

const mapEmbedUrl = computed(() => {
  if (!item.value) return ''
  const lat = Number(item.value.latitude)
  const lon = Number(item.value.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return ''

  const delta = 0.01
  const minLon = lon - delta
  const minLat = lat - delta
  const maxLon = lon + delta
  const maxLat = lat + delta

  return `https://www.openstreetmap.org/export/embed.html?bbox=${minLon}%2C${minLat}%2C${maxLon}%2C${maxLat}&layer=mapnik&marker=${lat}%2C${lon}`
})

const mapOpenUrl = computed(() => {
  if (!item.value) return ''
  if (item.value.latitude == null || item.value.longitude == null) return ''
  return `https://www.openstreetmap.org/?mlat=${item.value.latitude}&mlon=${item.value.longitude}#map=14/${item.value.latitude}/${item.value.longitude}`
})

async function loadItem() {
  loading.value = true
  error.value = ''

  try {
    item.value = await getInfrastructureById(route.params.id)
  } catch (requestError) {
    error.value = 'Не удалось загрузить карточку объекта.'
    console.error(requestError)
  } finally {
    loading.value = false
  }
}

async function handleDelete() {
  if (!isAuthenticated.value) {
    router.push('/login')
    return
  }
  const confirmed = window.confirm('Удалить объект?')
  if (!confirmed || !item.value) return

  try {
    await deleteInfrastructure(item.value.id)
    router.push('/')
  } catch (requestError) {
    error.value = 'Не удалось удалить объект.'
    console.error(requestError)
  }
}

onMounted(loadItem)
</script>

<template>
  <section class="page">
    <div class="page__heading">
      <div>
        <p class="eyebrow">Страница детализации</p>
        <h1>Карточка объекта</h1>
      </div>
      <RouterLink class="button button--ghost" to="/">К списку</RouterLink>
    </div>

    <div v-if="loading" class="state state--info">
      <span class="spinner" aria-hidden="true"></span>
      Загрузка карточки...
    </div>
    <p v-else-if="error" class="state state--error">{{ error }}</p>

    <article v-else-if="item" class="detail-card">
      <div class="detail-card__header">
        <div>
          <p class="eyebrow">{{ item.type }}</p>
          <h2>{{ item.name }}</h2>
        </div>
        <div v-if="isAuthenticated" class="actions">
          <RouterLink class="button button--ghost" :to="`/edit/${item.id}`">Редактировать</RouterLink>
          <button class="button button--danger" type="button" @click="handleDelete">Удалить</button>
        </div>
      </div>

      <dl class="detail-grid">
        <div>
          <dt>Критичность</dt>
          <dd>{{ item.severity }}</dd>
        </div>
        <div>
          <dt>Статус</dt>
          <dd>{{ item.status }}</dd>
        </div>
        <div>
          <dt>Последняя проверка</dt>
          <dd>{{ item.lastCheck }}</dd>
        </div>
        <div>
          <dt>Адрес</dt>
          <dd>{{ item.address || 'Не указан' }}</dd>
        </div>
        <div>
          <dt>Координаты</dt>
          <dd>{{ item.latitude ?? '—' }}, {{ item.longitude ?? '—' }}</dd>
        </div>
        <div class="detail-grid__wide">
          <dt>Описание</dt>
          <dd>{{ item.description }}</dd>
        </div>
      </dl>

      <section v-if="mapEmbedUrl" class="map-preview">
        <iframe
          :src="mapEmbedUrl"
          title="Карта объекта"
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
        ></iframe>
        <a class="hint-link" :href="mapOpenUrl" target="_blank" rel="noopener noreferrer">
          Открыть точку на OpenStreetMap
        </a>
      </section>
    </article>
  </section>
</template>
