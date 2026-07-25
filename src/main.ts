import './style.css'
import * as THREE from 'three'
import * as satellite from 'satellite.js'
import { SimClock } from './time'
import { FocusCamera, type FocusTarget } from './camera'
import { Earth } from './scene/earth'
import { Starfield } from './scene/starfield'
import { SolarSystem } from './scene/planets'
import { SatelliteSwarm } from './scene/satellites'
import { AsteroidField, type TrackedAsteroid } from './scene/asteroids'
import { fetchActiveCatalog } from './data/celestrak'
import { fetchCloseApproaches, fetchSmallBody, type CloseApproach } from './data/jpl'
import * as hud from './hud'

const canvas = document.getElementById('scene') as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x020304)

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.005,
  5e7,
)

const clock = new SimClock()
const earth = new Earth(scene)
const stars = new Starfield(scene)
const solar = new SolarSystem(scene)
const swarm = new SatelliteSwarm(scene)
const asteroids = new AsteroidField(scene, solar.helioGroup)

const focusCam = new FocusCamera(camera, earth.focusTarget, canvas)

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// ---------- labels ----------
for (const t of solar.focusTargets) {
  hud.addLabel(t.name, t.kind === 'planet' ? 'planet' : '', (out) => t.getPosition(out))
}
const earthLabelPos = new THREE.Vector3()
hud.addLabel('EARTH', 'planet', (out) => out.copy(earthLabelPos))

// ---------- target readout ----------
let focusedSatIndex = -1
let focusedAsteroid: TrackedAsteroid | null = null

function focusTarget(t: FocusTarget, satIndex = -1, ast: TrackedAsteroid | null = null) {
  focusedSatIndex = satIndex
  focusedAsteroid = ast
  focusCam.setFocus(t)
  hud.selectThreatRow(ast ? ast.approach.des : null)
}

function updateTargetReadout() {
  const t = focusCam.target
  if (t.kind === 'satellite' && focusedSatIndex >= 0) {
    const i = focusedSatIndex
    const s = swarm.getStats(i)
    const cat = ['STARLINK CONSTELLATION', 'ONEWEB CONSTELLATION', 'GNSS NAVIGATION', 'CREWED STATION', 'ACTIVE PAYLOAD'][swarm.cats[i]]
    hud.setTarget(t.name, `${cat} // NORAD ${swarm.norads[i]}`, [
      ['ALTITUDE', s ? s.altKm.toFixed(0) + ' KM' : '--'],
      ['VELOCITY', s ? s.speedKms.toFixed(2) + ' KM/S' : '--'],
      ['CATALOG ID', swarm.norads[i]],
      ['TRACKING', 'SGP4 / CELESTRAK GP'],
    ])
    return
  }
  if (t.kind === 'asteroid' && focusedAsteroid) {
    const a = focusedAsteroid
    const distAu = asteroids.geoDistanceAu(a)
    const dia = a.body.diameterKm != null ? (a.body.diameterKm * 1000).toFixed(0) + ' M' : 'UNKNOWN'
    hud.setTarget(a.body.fullname.toUpperCase(), `${a.body.orbitClass.toUpperCase()} // JPL SSD`, [
      ['DESIGNATION', a.approach.des],
      ['RANGE NOW', distAu.toFixed(4) + ' AU'],
      ['CLOSE APPROACH', a.approach.dateStr.slice(0, 12)],
      ['MISS DISTANCE', a.approach.distLd.toFixed(2) + ' LD'],
      ['REL VELOCITY', a.approach.vRelKms.toFixed(2) + ' KM/S'],
      ['EST DIAMETER', dia],
      ['PHA STATUS', a.body.pha ? 'POTENTIALLY HAZARDOUS' : 'NON-HAZARDOUS', a.body.pha],
    ])
    return
  }
  if (t.kind === 'earth') {
    hud.setTarget('EARTH', 'THIRD PLANET // HOMEWORLD', [
      ['RADIUS', '6371 KM'],
      ['TRACKED OBJECTS', String(swarm.count)],
      ['NEO WINDOW', asteroids.tracked.length + ' TRACKED'],
      ['STATUS', 'PROTECTED'],
    ])
    return
  }
  if (t.kind === 'moon') {
    hud.setTarget('MOON', 'NATURAL SATELLITE', [
      ['RADIUS', '1737 KM'],
      ['MEAN RANGE', '384400 KM'],
      ['REGIME', 'GEOCENTRIC'],
    ])
    return
  }
  if (t.kind === 'sun') {
    hud.setTarget('SOL', 'G2V MAIN SEQUENCE', [
      ['RADIUS', '696340 KM'],
      ['RANGE', '1.000 AU'],
      ['STATUS', 'NOMINAL'],
    ])
    return
  }
  if (t.kind === 'planet') {
    const dAu = solar.planetGeoDistanceAu(t.name.toLowerCase(), clock.simMs)
    hud.setTarget(t.name, 'PLANET // KEPLERIAN EPHEMERIS', [
      ['RANGE', dAu.toFixed(3) + ' AU'],
      ['RANGE KM', (dAu * 149.5979).toFixed(1) + ' M KM'],
      ['REGIME', 'HELIOCENTRIC'],
    ])
  }
}

// ---------- picking ----------
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
let downX = 0
let downY = 0
canvas.addEventListener('pointerdown', (e) => {
  downX = e.clientX
  downY = e.clientY
})
canvas.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1)
  raycaster.setFromCamera(pointer, camera)

  // 1. asteroid markers + planets + moon
  const meshes = [...asteroids.pickables, ...solar.pickables]
  const hit = raycaster.intersectObjects(meshes, false)[0]
  if (hit) {
    const ud = (hit.object as any).userData
    if (ud.pick === 'asteroid') {
      focusTarget(ud.ref.focusTarget, -1, ud.ref)
      return
    }
    if (ud.pick === 'moon') {
      focusTarget(solar.focusTargets.find((f) => f.kind === 'moon')!)
      return
    }
    if (ud.pick === 'planet') {
      focusTarget(solar.focusTargets.find((f) => f.name === ud.name.toUpperCase())!)
      return
    }
  }

  // 2. satellites (points)
  if (swarm.points) {
    raycaster.params.Points.threshold = Math.max(0.05, focusCam.distance * 0.008)
    const sh = raycaster.intersectObject(swarm.points, false)[0]
    if (sh && sh.index != null) {
      focusTarget(swarm.makeFocusTarget(sh.index), sh.index)
      return
    }
  }

  // 3. earth
  const er = raycaster.ray.distanceToPoint(new THREE.Vector3(0, 0, 0))
  if (er < 7) focusTarget(earth.focusTarget)
})

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') focusTarget(earth.focusTarget)
})

hud.bindWarpButtons((w) => clock.setWarp(w))
hud.bindQuickFocus((what) => {
  if (what === 'earth') focusTarget(earth.focusTarget)
  if (what === 'moon') focusTarget(solar.focusTargets.find((f) => f.kind === 'moon')!)
  if (what === 'sun') focusTarget(solar.focusTargets.find((f) => f.kind === 'sun')!)
  if (what === 'iss' && swarm.issIndex >= 0)
    focusTarget(swarm.makeFocusTarget(swarm.issIndex), swarm.issIndex)
})

// ---------- data loading ----------
async function loadSatellites() {
  hud.setMagi('celestrak', 'busy', 'SYNC')
  try {
    const { records, source } = await fetchActiveCatalog()
    swarm.onReady = () => {
      hud.setMagi('celestrak', 'ok', source === 'LIVE' ? 'ONLINE' : source)
      hud.setCensus(swarm.counts, swarm.count)
      if (swarm.issIndex >= 0) {
        hud.addLabel('ISS', '', (out) => swarm.getScenePos(swarm.issIndex, out))
      }
    }
    swarm.init(records)
  } catch (e) {
    console.error(e)
    hud.setMagi('celestrak', 'err', 'OFFLINE')
  }
}

async function loadAsteroids() {
  hud.setMagi('jpl', 'busy', 'SYNC')
  try {
    const feed = await fetchCloseApproaches()
    hud.setNeoCensus(feed.count, feed.hazardous)
    // dedupe by object, keep soonest approach
    const seen = new Map<string, CloseApproach>()
    for (const a of feed.approaches) if (!seen.has(a.des)) seen.set(a.des, a)
    const unique = [...seen.values()].slice(0, 14)

    hud.renderThreatBoard(
      unique.map((ap) => ({
        key: ap.des,
        name: ap.name,
        pha: ap.pha,
        dateStr: ap.dateStr,
        distLd: ap.distLd,
        vRelKms: ap.vRelKms,
        diameterKm: ap.diameterKm,
      })),
      (key) => {
        const tr = asteroids.tracked.find((x) => x.approach.des === key)
        if (tr) focusTarget(tr.focusTarget, -1, tr)
      },
    )
    hud.setMagi('jpl', 'ok', 'ONLINE')
    if (unique.some((a) => a.pha)) {
      hud.setAlert('PATTERN ORANGE : POTENTIALLY HAZARDOUS OBJECT IN APPROACH WINDOW')
    }

    // orbital elements per object (cached in localStorage after first load)
    hud.setMagi('neows', 'busy', 'SYNC')
    let okCount = 0
    for (const ap of unique) {
      try {
        const body = await fetchSmallBody(ap.des)
        const t = asteroids.add(ap, body)
        hud.addLabel(ap.name, body.pha ? 'ast pha' : 'ast', (out) => out.copy(t.geoPos))
        okCount++
      } catch (e) {
        console.warn('orbit failed for', ap.des, e)
      }
    }
    hud.setMagi('neows', okCount ? 'ok' : 'err', okCount ? 'ONLINE' : 'DEGRADED')
  } catch (e) {
    console.error(e)
    hud.setMagi('jpl', 'err', 'OFFLINE')
    hud.setMagi('neows', 'err', 'OFFLINE')
  }
}

hud.setBoot('ACQUIRING ORBITAL ELEMENTS...')
loadSatellites()
loadAsteroids()
setTimeout(() => hud.bootDone(), 2600)

// ---------- main loop ----------
let lastReal = performance.now()
let readoutTimer = 0

function animate() {
  requestAnimationFrame(animate)
  const now = performance.now()
  const dt = Math.min(0.1, (now - lastReal) / 1000)
  lastReal = now

  clock.tick(dt)
  const simMs = clock.simMs

  earth.setRotation(satellite.gstime(new Date(simMs)))
  solar.update(simMs, camera)
  asteroids.update(simMs, camera)
  swarm.update(simMs, clock.warp)
  focusCam.update(dt)
  stars.update(camera.position)

  hud.setClocks(Date.now(), simMs)
  hud.updateLabels(camera)
  readoutTimer += dt
  if (readoutTimer > 0.25) {
    readoutTimer = 0
    updateTargetReadout()
  }

  renderer.render(scene, camera)
}

updateTargetReadout()
animate()
