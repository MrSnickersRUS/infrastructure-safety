<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { deleteInfrastructure, getInfrastructures } from '../services/infrastructureApi'
import { useAuth } from '../services/authStore'

const items = ref([])
const loading = ref(true)
const error = ref('')
const search = ref('')
const router = useRouter()
const { isAuthenticated } = useAuth()

const filteredItems = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return items.value

  return items.value.filter((item) =>
    [item.name, item.type, item.severity, item.status, item.description, item.address]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  )
})

async function loadItems() {
  loading.value = true
  error.value = ''

  try {
    items.value = await getInfrastructures()
  } catch (requestError) {
    error.value = 'Не удалось загрузить список объектов.'
    console.error(requestError)
  } finally {
    loading.value = false
  }
}

async function handleDelete(id) {
  if (!isAuthenticated.value) {
    router.push('/login')
    return
  }
  const confirmed = window.confirm('Удалить объект из списка?')
  if (!confirmed) return

  try {
    await deleteInfrastructure(id)
    items.value = items.value.filter((item) => item.id !== id)
  } catch (requestError) {
    error.value = 'Не удалось удалить объект.'
    console.error(requestError)
  }
}

onMounted(loadItems)

const totalCount = computed(() => items.value.length)
const threatenedCount = computed(
  () => items.value.filter((item) => item.status === 'Под угрозой').length,
)
</script>

<template>
  <section class="page">
    <div class="page__heading">
      <div>
        <p class="eyebrow">Главная страница</p>
        <h1>Объекты инфраструктурной безопасности</h1>
        <p class="muted">
          Список сущностей с просмотром, созданием, редактированием и удалением через REST API.
        </p>
      </div>

      <RouterLink
        v-if="isAuthenticated"
        class="button button--primary"
        to="/add"
      >
        Добавить объект
      </RouterLink>
      <RouterLink
        v-else
        class="button button--ghost"
        to="/login"
      >
        Войти для добавления
      </RouterLink>
    </div>

    <div class="stats">
      <article class="stat-card">
        <span class="stat-card__label">Всего объектов</span>
        <strong>{{ totalCount }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-card__label">Под угрозой</span>
        <strong>{{ threatenedCount }}</strong>
      </article>
    </div>

    <label class="search">
      <span>Поиск по списку</span>
      <input v-model="search" type="search" placeholder="Название, тип, статус..." />
    </label>

    <div v-if="loading" class="state state--info">
      <span class="spinner" aria-hidden="true"></span>
      Загрузка списка...
    </div>
    <p v-else-if="error" class="state state--error">{{ error }}</p>

    <div v-else-if="filteredItems.length" class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Объект</th>
            <th>Тип</th>
            <th>Критичность</th>
            <th>Статус</th>
            <th>Проверка</th>
            <th>Адрес</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in filteredItems" :key="item.id">
            <td>
              <RouterLink class="link" :to="`/detail/${item.id}`">{{ item.name }}</RouterLink>
            </td>
            <td>{{ item.type }}</td>
            <td>{{ item.severity }}</td>
            <td>
              <span class="badge" :class="`badge--${item.status === 'Под угрозой' ? 'danger' : 'success'}`">
                {{ item.status }}
              </span>
            </td>
            <td>{{ item.lastCheck }}</td>
            <td>{{ item.address || '—' }}</td>
            <td class="actions">
              <template v-if="isAuthenticated">
                <RouterLink class="button button--ghost" :to="`/edit/${item.id}`">Редактировать</RouterLink>
                <button class="button button--danger" type="button" @click="handleDelete(item.id)">
                  Удалить
                </button>
              </template>
              <RouterLink v-else class="button button--ghost" to="/login">Войти</RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-else class="state state--empty">Объекты не найдены.</p>
  </section>
</template>
