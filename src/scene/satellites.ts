import * as THREE from 'three'
import { KM_PER_UNIT } from '../frames'
import { categorize, type OmmRecord, type SatCategory } from '../data/celestrak'
import type { FocusTarget } from '../camera'

const CAT_COLORS: [number, number, number][] = [
  [0.3, 0.85, 0.76], // starlink teal
  [0.7, 0.55, 1.0], // oneweb violet
  [1.0, 0.76, 0.2], // gnss amber
  [1.0, 1.0, 1.0], // iss white
  [0.25, 0.48, 0.33], // other dim green
]

export class SatelliteSwarm {
  points!: THREE.Points
  names: string[] = []
  norads: string[] = []
  cats: SatCategory[] = []
  count = 0
  counts = [0, 0, 0, 0, 0]
  issIndex = -1
  ready = false

  private worker: Worker
  private eciPos: Float32Array | null = null
  private eciVel: Float32Array | null = null
  private tickSimMs = 0
  private waiting = false
  private lastReqReal = 0
  private lastTookMs = 120
  private posAttr!: THREE.BufferAttribute
  private geometry = new THREE.BufferGeometry()
  private scene: THREE.Scene
  onReady?: () => void

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.worker = new Worker(new URL('../workers/sgp4.worker.ts', import.meta.url), {
      type: 'module',
    })
    this.worker.onmessage = (ev) => this.onWorker(ev)
  }

  init(records: OmmRecord[]) {
    this.names = records.map((r) => r.OBJECT_NAME)
    this.norads = records.map((r) => String(r.NORAD_CAT_ID))
    this.cats = records.map((r) => categorize(r.OBJECT_NAME))
    this.count = records.length
    this.counts = [0, 0, 0, 0, 0]
    for (const c of this.cats) this.counts[c]++
    this.issIndex = this.names.findIndex((n) => n.toUpperCase().startsWith('ISS (ZARYA)'))

    const pos = new Float32Array(this.count * 3).fill(1e9)
    const col = new Float32Array(this.count * 3)
    const size = new Float32Array(this.count)
    for (let i = 0; i < this.count; i++) {
      const [r, g, b] = CAT_COLORS[this.cats[i]]
      col[i * 3] = r
      col[i * 3 + 1] = g
      col[i * 3 + 2] = b
      size[i] = this.cats[i] === 3 ? 3.2 : this.cats[i] === 4 ? 0.85 : 1.25
    }
    this.posAttr = new THREE.BufferAttribute(pos, 3)
    this.posAttr.setUsage(THREE.DynamicDrawUsage)
    this.geometry.setAttribute('position', this.posAttr)
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(col, 3))
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1))

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        varying vec3 vColor;
        void main() {
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float d = length(mv.xyz);
          gl_PointSize = clamp(140.0 / d, 1.6, 14.0) * aSize;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float r = length(gl_PointCoord - vec2(0.5));
          float a = smoothstep(0.5, 0.12, r);
          gl_FragColor = vec4(vColor, a * 0.95);
        }`,
    })
    this.points = new THREE.Points(this.geometry, mat)
    this.points.frustumCulled = false
    this.scene.add(this.points)

    this.worker.postMessage({ type: 'init', omm: records })
  }

  private onWorker(ev: MessageEvent) {
    const msg = ev.data
    if (msg.type === 'ready') {
      this.ready = true
      this.onReady?.()
      return
    }
    if (msg.type === 'pos') {
      this.eciPos = msg.pos
      this.eciVel = msg.vel
      this.tickSimMs = msg.tMs
      this.lastTookMs = msg.tookMs
      this.waiting = false
    }
  }

  // between worker ticks, sweep each satellite along a circular arc in its orbit
  // plane (rotate by omega*dt, drift radius by radial velocity) so positions stay
  // coherent at high time warp
  update(simMs: number, _warp: number) {
    if (!this.ready) return
    const now = performance.now()
    const interval = Math.max(200, this.lastTookMs * 1.6)
    if (!this.waiting && now - this.lastReqReal > interval) {
      this.waiting = true
      this.lastReqReal = now
      this.worker.postMessage({ type: 'tick', tMs: simMs })
    }
    if (!this.eciPos) return

    const pos = this.posAttr.array as Float32Array
    const p = this.eciPos
    const v = this.eciVel!
    const dtSec = (simMs - this.tickSimMs) / 1000
    for (let i = 0; i < this.count; i++) {
      const ix = i * 3
      const px = p[ix]
      if (Number.isNaN(px)) {
        pos[ix] = 1e9
        pos[ix + 1] = 1e9
        pos[ix + 2] = 1e9
        continue
      }
      const py = p[ix + 1]
      const pz = p[ix + 2]
      const vx = v[ix]
      const vy = v[ix + 1]
      const vz = v[ix + 2]
      const r2 = px * px + py * py + pz * pz
      const r = Math.sqrt(r2)
      const vr = (px * vx + py * vy + pz * vz) / r
      // angular rate from specific angular momentum |r x v| / r^2
      const cx = py * vz - pz * vy
      const cy = pz * vx - px * vz
      const cz = px * vy - py * vx
      const w = Math.sqrt(cx * cx + cy * cy + cz * cz) / r2
      let x: number, y: number, z: number
      if (w > 1e-9) {
        const ang = w * dtSec
        const cosA = Math.cos(ang)
        const sinAoW = Math.sin(ang) / w
        // tangential velocity component (perpendicular to r)
        const vpx = vx - (px / r) * vr
        const vpy = vy - (py / r) * vr
        const vpz = vz - (pz / r) * vr
        const s = Math.max(0.2, (r + vr * dtSec) / r)
        x = (px * cosA + vpx * sinAoW) * s
        y = (py * cosA + vpy * sinAoW) * s
        z = (pz * cosA + vpz * sinAoW) * s
      } else {
        x = px + vx * dtSec
        y = py + vy * dtSec
        z = pz + vz * dtSec
      }
      // ECI km -> scene units, (x, z, -y)
      pos[ix] = x / KM_PER_UNIT
      pos[ix + 1] = z / KM_PER_UNIT
      pos[ix + 2] = -y / KM_PER_UNIT
    }
    this.posAttr.needsUpdate = true
  }

  getScenePos(i: number, out: THREE.Vector3): THREE.Vector3 {
    const a = this.posAttr.array as Float32Array
    return out.set(a[i * 3], a[i * 3 + 1], a[i * 3 + 2])
  }

  // altitude km, speed km/s from latest propagation
  getStats(i: number): { altKm: number; speedKms: number } | null {
    if (!this.eciPos) return null
    const ix = i * 3
    const p = this.eciPos
    const v = this.eciVel!
    const r = Math.hypot(p[ix], p[ix + 1], p[ix + 2])
    if (Number.isNaN(r)) return null
    return { altKm: r - 6371, speedKms: Math.hypot(v[ix], v[ix + 1], v[ix + 2]) }
  }

  makeFocusTarget(i: number): FocusTarget {
    return {
      name: this.names[i],
      kind: 'satellite',
      getPosition: (out) => this.getScenePos(i, out),
      viewDist: 1.6,
      minDist: 0.03,
    }
  }
}
