// NEO data via NASA NeoWs (api.nasa.gov) - the CNEOS/JPL close-approach dataset
// served with CORS headers, unlike ssd-api.jpl.nasa.gov which browsers cannot reach.
import type { SmallBodyElements } from '../kepler'

export function nasaKey(): string {
  const p = new URLSearchParams(location.search).get('key')
  if (p) {
    localStorage.setItem('nasa_api_key', p)
    return p
  }
  return localStorage.getItem('nasa_api_key') ?? 'DEMO_KEY'
}

// tiny localStorage cache so DEMO_KEY's 30 req/hr survives reloads
async function cachedJson(cacheKey: string, ttlMs: number, url: string): Promise<any> {
  try {
    const raw = localStorage.getItem(cacheKey)
    if (raw) {
      const { ts, data } = JSON.parse(raw)
      if (Date.now() - ts < ttlMs) return data
    }
  } catch { /* ignore corrupt cache */ }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url.split('?')[0]} ${res.status}`)
  const data = await res.json()
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }))
  } catch { /* quota - fine */ }
  return data
}

export interface CloseApproach {
  des: string // NeoWs id, used for lookups
  name: string
  pha: boolean
  dateStr: string
  dateMs: number
  distAu: number
  distLd: number
  vRelKms: number
  diameterKm: number | null
  h: number | null
}

export interface FeedResult {
  approaches: CloseApproach[]
  count: number
  hazardous: number
}

export async function fetchCloseApproaches(): Promise<FeedResult> {
  const start = new Date().toISOString().slice(0, 10)
  const url = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${start}&api_key=${nasaKey()}`
  const json = await cachedJson('neows_feed_v1', 30 * 60 * 1000, url)
  const approaches: CloseApproach[] = []
  let count = 0
  let hazardous = 0
  for (const day of Object.values(json.near_earth_objects ?? {}) as any[][]) {
    for (const neo of day) {
      count++
      if (neo.is_potentially_hazardous_asteroid) hazardous++
      const ca = neo.close_approach_data?.[0]
      if (!ca) continue
      const est = neo.estimated_diameter?.kilometers
      approaches.push({
        des: String(neo.id),
        name: String(neo.name).replace(/^\(|\)$/g, ''),
        pha: !!neo.is_potentially_hazardous_asteroid,
        dateStr: ca.close_approach_date_full ?? ca.close_approach_date,
        dateMs: ca.epoch_date_close_approach,
        distAu: parseFloat(ca.miss_distance?.astronomical ?? '0'),
        distLd: parseFloat(ca.miss_distance?.lunar ?? '0'),
        vRelKms: parseFloat(ca.relative_velocity?.kilometers_per_second ?? '0'),
        diameterKm: est ? (est.estimated_diameter_min + est.estimated_diameter_max) / 2 : null,
        h: neo.absolute_magnitude_h ?? null,
      })
    }
  }
  approaches.sort((a, b) => a.dateMs - b.dateMs)
  return { approaches, count, hazardous }
}

export interface SmallBody {
  des: string
  fullname: string
  pha: boolean
  orbitClass: string
  h: number | null
  diameterKm: number | null
  elements: SmallBodyElements
}

export async function fetchSmallBody(id: string): Promise<SmallBody> {
  const url = `https://api.nasa.gov/neo/rest/v1/neo/${id}?api_key=${nasaKey()}`
  const json = await cachedJson(`neows_orbit_${id}`, 7 * 24 * 3600 * 1000, url)
  const od = json.orbital_data
  if (!od?.semi_major_axis) throw new Error(`neows: no orbit for ${id}`)
  const est = json.estimated_diameter?.kilometers
  return {
    des: String(json.id),
    fullname: String(json.name).replace(/^\(|\)$/g, ''),
    pha: !!json.is_potentially_hazardous_asteroid,
    orbitClass: od.orbit_class?.orbit_class_type
      ? `${od.orbit_class.orbit_class_type} CLASS NEO`
      : 'NEO',
    h: json.absolute_magnitude_h ?? null,
    diameterKm: est ? (est.estimated_diameter_min + est.estimated_diameter_max) / 2 : null,
    elements: {
      a: parseFloat(od.semi_major_axis),
      e: parseFloat(od.eccentricity),
      i: parseFloat(od.inclination),
      om: parseFloat(od.ascending_node_longitude),
      w: parseFloat(od.perihelion_argument),
      ma: parseFloat(od.mean_anomaly),
      epochJd: parseFloat(od.epoch_osculation),
      n: parseFloat(od.mean_motion),
    },
  }
}
