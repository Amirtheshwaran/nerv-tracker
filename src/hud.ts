import * as THREE from 'three'

const $ = (id: string) => document.getElementById(id)!

export type MagiId = 'jpl' | 'neows' | 'celestrak'

export function setMagi(id: MagiId, state: 'busy' | 'ok' | 'err', text: string) {
  const row = $(`magi-${id}`)
  row.className = `magi-row ${state}`
  row.querySelector('.magi-state')!.textContent = text
}

export function setBoot(status: string) {
  $('boot-status').textContent = status
}

export function bootDone() {
  $('boot-screen').classList.add('done')
}

export function setAlert(text: string | null) {
  const b = $('alert-banner')
  if (!text) {
    b.classList.add('hidden')
  } else {
    b.classList.remove('hidden')
    $('alert-text').textContent = text
  }
}

export function setCensus(counts: number[], total: number) {
  $('n-starlink').textContent = String(counts[0])
  $('n-oneweb').textContent = String(counts[1])
  $('n-gnss').textContent = String(counts[2])
  $('n-other').textContent = String(counts[4] + counts[3])
  $('n-total').textContent = String(total)
}

export function setNeoCensus(count: number, hazardous: number) {
  $('n-neo').textContent = String(count)
  $('n-haz').textContent = String(hazardous)
}

export function setClocks(realMs: number, simMs: number) {
  const fmt = (ms: number) => {
    const d = new Date(ms)
    return (
      d.toISOString().slice(0, 10).replace(/-/g, '.') + ' ' + d.toISOString().slice(11, 19)
    )
  }
  $('clock-utc').textContent = fmt(realMs)
  $('clock-sim').textContent = fmt(simMs)
}

export function bindWarpButtons(onWarp: (w: number) => void) {
  const btns = document.querySelectorAll<HTMLButtonElement>('#warp-controls button')
  btns.forEach((b) =>
    b.addEventListener('click', () => {
      btns.forEach((x) => x.classList.remove('on'))
      b.classList.add('on')
      onWarp(Number(b.dataset.warp))
    }),
  )
}

export function bindQuickFocus(onFocus: (what: string) => void) {
  document
    .querySelectorAll<HTMLButtonElement>('.quick')
    .forEach((b) => b.addEventListener('click', () => onFocus(b.dataset.focus!)))
}

export interface ThreatRow {
  key: string
  name: string
  pha: boolean
  dateStr: string
  distLd: number
  vRelKms: number
  diameterKm: number | null
}

export function renderThreatBoard(rows: ThreatRow[], onSelect: (key: string) => void) {
  const ul = $('threat-list')
  ul.innerHTML = ''
  if (!rows.length) {
    ul.innerHTML = '<li class="loading-row">NO OBJECTS IN WINDOW</li>'
    return
  }
  for (const r of rows) {
    const li = document.createElement('li')
    li.dataset.key = r.key
    if (r.pha) li.classList.add('pha')
    const dia = r.diameterKm != null ? (r.diameterKm * 1000).toFixed(0) + ' M' : '?'
    li.innerHTML =
      `<div class="t-name">${r.name}${r.pha ? ' ⚠' : ''}</div>` +
      `<div class="t-row"><span>CA ${r.dateStr.slice(0, 12)}</span><b>${r.distLd.toFixed(1)} LD</b></div>` +
      `<div class="t-row"><span>VEL ${r.vRelKms.toFixed(1)} KM/S</span><b>Ø ${dia}</b></div>`
    li.addEventListener('click', () => onSelect(r.key))
    ul.appendChild(li)
  }
}

export function selectThreatRow(key: string | null) {
  document.querySelectorAll('#threat-list li').forEach((li) => {
    li.classList.toggle('sel', (li as HTMLElement).dataset.key === key)
  })
}

export function setTarget(name: string, klass: string, rows: [string, string, boolean?][]) {
  $('target-name').textContent = name
  $('target-class').textContent = klass
  const table = $('target-data')
  table.innerHTML = rows
    .map(
      ([k, v, warn]) =>
        `<tr${warn ? ' class="warn"' : ''}><td>${k}</td><td>${v}</td></tr>`,
    )
    .join('')
}

// ---------- floating 3D labels ----------
export interface SceneLabel {
  el: HTMLDivElement
  getPos: (out: THREE.Vector3) => void
}

const labelLayer = () => $('labels')
const labels: SceneLabel[] = []
const tmpV = new THREE.Vector3()

export function addLabel(text: string, cls: string, getPos: (out: THREE.Vector3) => void): SceneLabel {
  const el = document.createElement('div')
  el.className = `obj-label ${cls}`
  el.textContent = text
  labelLayer().appendChild(el)
  const l = { el, getPos }
  labels.push(l)
  return l
}

export function updateLabels(camera: THREE.PerspectiveCamera) {
  const w = window.innerWidth
  const h = window.innerHeight
  for (const l of labels) {
    l.getPos(tmpV)
    tmpV.project(camera)
    if (tmpV.z > 1 || tmpV.x < -1.05 || tmpV.x > 1.05 || tmpV.y < -1.05 || tmpV.y > 1.05) {
      l.el.style.display = 'none'
      continue
    }
    l.el.style.display = 'block'
    l.el.style.left = ((tmpV.x + 1) / 2) * w + 'px'
    l.el.style.top = ((1 - tmpV.y) / 2) * h + 'px'
  }
}
