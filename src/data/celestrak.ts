// Active satellite catalog as OMM JSON records (consumed by satellite.js json2satrec).
// Source chain: live CelesTrak -> browser Cache API copy -> bundled snapshot.
export interface OmmRecord {
  OBJECT_NAME: string
  NORAD_CAT_ID: number
  EPOCH: string
  [k: string]: unknown
}

export type CatalogSource = 'LIVE' | 'CACHE' | 'ARCHIVE'

const LIVE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json'
const CACHE_NAME = 'nerv-data-v1'
const FRESH_MS = 3 * 3600 * 1000

async function readCache(): Promise<{ records: OmmRecord[]; ageMs: number } | null> {
  try {
    const cache = await caches.open(CACHE_NAME)
    const hit = await cache.match(LIVE_URL)
    if (!hit) return null
    const ageMs = Date.now() - Number(hit.headers.get('x-cached-at') ?? 0)
    return { records: await hit.json(), ageMs }
  } catch {
    return null
  }
}

export async function fetchActiveCatalog(): Promise<{
  records: OmmRecord[]
  source: CatalogSource
}> {
  const cached = await readCache()
  if (cached && cached.ageMs < FRESH_MS) return { records: cached.records, source: 'CACHE' }

  try {
    // time out so a slow or blocked host drops to the fallback instead of hanging
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(LIVE_URL, { signal: ctrl.signal }).finally(() => clearTimeout(timer))
    if (!res.ok) throw new Error(`celestrak ${res.status}`)
    const records: OmmRecord[] = await res.json()
    if (records.length < 100) throw new Error('celestrak: suspiciously few records')
    try {
      const cache = await caches.open(CACHE_NAME)
      await cache.put(
        LIVE_URL,
        new Response(JSON.stringify(records), {
          headers: { 'x-cached-at': String(Date.now()), 'content-type': 'application/json' },
        }),
      )
    } catch { /* cache write is best-effort */ }
    return { records, source: 'LIVE' }
  } catch (e) {
    console.warn('celestrak live fetch failed, falling back', e)
    if (cached) return { records: cached.records, source: 'CACHE' }
    const res = await fetch(import.meta.env.BASE_URL + 'tle-active.json')
    if (!res.ok) throw new Error('no catalog available')
    return { records: await res.json(), source: 'ARCHIVE' }
  }
}

export type SatCategory = 0 | 1 | 2 | 3 | 4 // starlink, oneweb, gnss, iss, other

export function categorize(name: string): SatCategory {
  const n = name.toUpperCase()
  if (n.startsWith('STARLINK')) return 0
  if (n.startsWith('ONEWEB')) return 1
  if (
    n.includes('NAVSTAR') || n.startsWith('GPS') || n.startsWith('GLONASS') ||
    n.startsWith('GALILEO') || n.startsWith('GSAT0') ||
    n.startsWith('BEIDOU') || n.includes('IRNSS') || n.includes('QZS')
  ) return 2
  if (n.startsWith('ISS (ZARYA)')) return 3
  return 4
}
