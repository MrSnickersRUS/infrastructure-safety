<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  createInfrastructure,
  getInfrastructureById,
  updateInfrastructure,
} from '../services/infrastructureApi'
import { geocodeAddress } from '../services/geocodingApi'

const route = useRoute()
const router = useRouter()

const isEdit = computed(() => Boolean(route.params.id))
const formTitle = computed(() => (isEdit.value ? 'Редактирование объекта' : 'Добавление объекта'))
const submitLabel = computed(() => (isEdit.value ? 'Сохранить изменения' : 'Создать объект'))

const form = reactive({
  name: '',
  type: 'Энергетика',
  severity: 'Значимый',
  status: 'Под угрозой',
  lastCheck: '',
  description: '',
  address: '',
  latitude: '',
  longitude: '',
})

const errors = reactive({
  name: '',
  type: '',
  severity: '',
  status: '',
  lastCheck: '',
  description: '',
  address: '',
})

const loading = ref(false)
const checkingAddress = ref(false)
const pageError = ref('')
const addressStatus = ref('')

const mapEmbedUrl = computed(() => {
  if (form.latitude === '' || form.longitude === '') return ''

  const lat = Number(form.latitude)
  const lon = Number(form.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return ''

  const delta = 0.01
  const minLon = lon - delta
  const minLat = lat - delta
  const maxLon = lon + delta
  const maxLat = lat + delta

  return `https://www.openstreetmap.org/export/embed.html?bbox=${minLon}%2C${minLat}%2C${maxLon}%2C${maxLat}&layer=mapnik&marker=${lat}%2C${lon}`
})

const mapOpenUrl = computed(() => {
  if (form.latitude === '' || form.longitude === '') return ''
  return `https://www.openstreetmap.org/?mlat=${form.latitude}&mlon=${form.longitude}#map=14/${form.latitude}/${form.longitude}`
})

function clearErrors() {
  Object.keys(errors).forEach((key) => {
    errors[key] = ''
  })
}

function validate() {
  clearErrors()
  const lat = Number(form.latitude)
  const lon = Number(form.longitude)
  const hasCoordinates =
    form.latitude !== '' &&
    form.longitude !== '' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180

  if (!form.name.trim()) errors.name = 'Укажите название объекта.'
  if (!form.type.trim()) errors.type = 'Укажите тип объекта.'
  if (!form.severity.trim()) errors.severity = 'Укажите критичность.'
  if (!form.status.trim()) errors.status = 'Укажите статус.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.lastCheck)) errors.lastCheck = 'Формат даты: YYYY-MM-DD.'
  if (!form.description.trim()) errors.description = 'Добавьте описание объекта.'
  if (!form.address.trim()) {
    errors.address = 'Укажите адрес объекта.'
  } else if (!hasCoordinates) {
    errors.address = 'Проверьте адрес кнопкой «Проверить адрес», чтобы получить координаты.'
  }

  return !Object.values(errors).some(Boolean)
}

function handleAddressInput() {
  form.latitude = ''
  form.longitude = ''
  addressStatus.value = ''
}

async function handleAddressCheck() {
  const address = form.address.trim()
  if (!address) {
    errors.address = 'Введите адрес для проверки.'
    return
  }

  checkingAddress.value = true
  addressStatus.value = ''
  errors.address = ''

  try {
    const point = await geocodeAddress(address)
    if (!point) {
      errors.address = 'Адрес не найден. Уточните формулировку.'
      return
    }

    form.address = point.displayName
    form.latitude = point.lat.toFixed(6)
    form.longitude = point.lon.toFixed(6)
    addressStatus.value = 'Адрес успешно проверен и привязан к координатам.'
  } catch (requestError) {
    errors.address = 'Не удалось проверить адрес через API карт.'
    console.error(requestError)
  } finally {
    checkingAddress.value = false
  }
}

async function loadItem() {
  if (!isEdit.value) return

  loading.value = true
  pageError.value = ''

  try {
    const item = await getInfrastructureById(route.params.id)
    form.name = item.name ?? ''
    form.type = item.type ?? ''
    form.severity = item.severity ?? 'Значимый'
    form.status = item.status ?? 'Под угрозой'
    form.lastCheck = item.lastCheck ?? ''
    form.description = item.description ?? ''
    form.address = item.address ?? ''
    form.latitude = item.latitude != null ? String(item.latitude) : ''
    form.longitude = item.longitude != null ? String(item.longitude) : ''
  } catch (requestError) {
    pageError.value = 'Не удалось загрузить данные для редактирования.'
    console.error(requestError)
  } finally {
    loading.value = false
  }
}

async function handleSubmit() {
  pageError.value = ''
  if (!validate()) {
    pageError.value = 'Проверьте обязательные поля формы.'
    return
  }

  const payload = {
    name: form.name.trim(),
    type: form.type.trim(),
    severity: form.severity.trim(),
    status: form.status.trim(),
    lastCheck: form.lastCheck,
    description: form.description.trim(),
    address: form.address.trim(),
    latitude: form.latitude === '' ? null : Number(form.latitude),
    longitude: form.longitude === '' ? null : Number(form.longitude),
  }

  loading.value = true
  try {
    const saved = isEdit.value
      ? await updateInfrastructure(route.params.id, payload)
      : await createInfrastructure(payload)

    router.push(`/detail/${saved.id}`)
  } catch (requestError) {
    pageError.value = 'Не удалось сохранить объект.'
    console.error(requestError)
  } finally {
    loading.value = false
  }
}

onMounted(loadItem)
</script>

<template>
  <section class="page">
    <div class="page__heading">
      <div>
        <p class="eyebrow">Страница формы</p>
        <h1>{{ formTitle }}</h1>
      </div>
      <RouterLink class="button button--ghost" to="/">К списку</RouterLink>
    </div>

    <p v-if="pageError" class="state state--error">{{ pageError }}</p>

    <form class="form" @submit.prevent="handleSubmit">
      <label>
        <span>Название</span>
        <input v-model="form.name" type="text" placeholder="Например, ТЭЦ-5" />
        <small v-if="errors.name" class="field-error">{{ errors.name }}</small>
      </label>

      <label>
        <span>Тип</span>
        <input v-model="form.type" type="text" placeholder="Энергетика" />
        <small v-if="errors.type" class="field-error">{{ errors.type }}</small>
      </label>

      <label>
        <span>Критичность</span>
        <select v-model="form.severity">
          <option>Незначительный</option>
          <option>Значимый</option>
          <option>Критический</option>
        </select>
        <small v-if="errors.severity" class="field-error">{{ errors.severity }}</small>
      </label>

      <label>
        <span>Статус</span>
        <select v-model="form.status">
          <option>Под угрозой</option>
          <option>Устранено</option>
        </select>
        <small v-if="errors.status" class="field-error">{{ errors.status }}</small>
      </label>

      <label>
        <span>Дата последней проверки</span>
        <input v-model="form.lastCheck" type="date" />
        <small v-if="errors.lastCheck" class="field-error">{{ errors.lastCheck }}</small>
      </label>

      <label class="form__full">
        <span>Описание</span>
        <textarea v-model="form.description" rows="5" placeholder="Краткая характеристика объекта..."></textarea>
        <small v-if="errors.description" class="field-error">{{ errors.description }}</small>
      </label>

      <label class="form__full">
        <span>Адрес объекта</span>
        <div class="form__inline">
          <input
            v-model="form.address"
            type="text"
            placeholder="Например: Новосибирск, проспект Карла Маркса, 20"
            @input="handleAddressInput"
          />
          <button class="button button--ghost" type="button" :disabled="checkingAddress" @click="handleAddressCheck">
            {{ checkingAddress ? 'Проверка...' : 'Проверить адрес' }}
          </button>
        </div>
        <small v-if="errors.address" class="field-error">{{ errors.address }}</small>
        <small v-else-if="addressStatus" class="field-info">{{ addressStatus }}</small>
      </label>

      <label>
        <span>Широта</span>
        <input v-model="form.latitude" type="text" readonly />
      </label>

      <label>
        <span>Долгота</span>
        <input v-model="form.longitude" type="text" readonly />
      </label>

      <section v-if="mapEmbedUrl" class="form__full map-preview">
        <iframe
          :src="mapEmbedUrl"
          title="Карта с адресом объекта"
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
        ></iframe>
        <a class="hint-link" :href="mapOpenUrl" target="_blank" rel="noopener noreferrer">
          Открыть точку на OpenStreetMap
        </a>
      </section>

      <div class="form__actions form__full">
        <RouterLink class="button button--ghost" to="/">Отмена</RouterLink>
        <button class="button button--primary" type="submit" :disabled="loading">
          {{ loading ? 'Сохранение...' : submitLabel }}
        </button>
      </div>
    </form>
  </section>
</template>
