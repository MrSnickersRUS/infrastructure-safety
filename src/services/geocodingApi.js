export async function geocodeAddress(address) {
  const params = new URLSearchParams({
    q: address,
    format: 'jsonv2',
    limit: '1',
    addressdetails: '1',
  })

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      'Accept-Language': 'ru',
    },
  })

  if (!response.ok) {
    throw new Error('Ошибка геокодирования адреса')
  }

  const results = await response.json()
  if (!Array.isArray(results) || results.length === 0) {
    return null
  }

  const point = results[0]
  return {
    displayName: point.display_name,
    lat: Number(point.lat),
    lon: Number(point.lon),
  }
}
