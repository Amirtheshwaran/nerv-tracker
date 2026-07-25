import * as THREE from 'three'

export interface FocusTarget {
  name: string
  kind: 'earth' | 'moon' | 'sun' | 'planet' | 'satellite' | 'asteroid'
  // Fill `out` with the target's current scene position
  getPosition(out: THREE.Vector3): void
  // Comfortable viewing distance in scene units
  viewDist: number
  minDist: number
}

const tmp = new THREE.Vector3()

export class FocusCamera {
  camera: THREE.PerspectiveCamera
  target: FocusTarget
  private theta = 0.6
  private phi = 1.15
  private dist: number
  private distGoal: number
  private focus = new THREE.Vector3()
  private focusGoal = new THREE.Vector3()
  private transition = 1 // 0..1, 1 = settled
  private dragging = false
  private lastX = 0
  private lastY = 0
  onFocusChange?: (t: FocusTarget) => void

  constructor(camera: THREE.PerspectiveCamera, initial: FocusTarget, dom: HTMLElement) {
    this.camera = camera
    this.target = initial
    this.dist = this.distGoal = initial.viewDist
    initial.getPosition(this.focus)
    this.focusGoal.copy(this.focus)

    dom.addEventListener('pointerdown', (e) => {
      this.dragging = true
      this.lastX = e.clientX
      this.lastY = e.clientY
    })
    window.addEventListener('pointerup', () => (this.dragging = false))
    window.addEventListener('pointermove', (e) => {
      if (!this.dragging) return
      const dx = e.clientX - this.lastX
      const dy = e.clientY - this.lastY
      this.lastX = e.clientX
      this.lastY = e.clientY
      this.theta -= dx * 0.005
      this.phi = Math.max(0.05, Math.min(Math.PI - 0.05, this.phi - dy * 0.005))
    })
    dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        const f = Math.exp(e.deltaY * 0.002)
        this.distGoal = Math.max(this.target.minDist, Math.min(9e5, this.distGoal * f))
      },
      { passive: false },
    )
  }

  setFocus(t: FocusTarget) {
    if (t === this.target) return
    this.target = t
    this.distGoal = t.viewDist
    this.transition = 0
    this.onFocusChange?.(t)
  }

  update(dt: number) {
    this.target.getPosition(this.focusGoal)
    if (this.transition < 1) {
      this.transition = Math.min(1, this.transition + dt / 1.4)
      const k = 1 - Math.pow(1 - this.transition, 3)
      this.focus.lerp(this.focusGoal, Math.max(k, 0.04))
    } else {
      // smooth toward a moving target so per-tick jumps don't snap the view
      this.focus.lerp(this.focusGoal, 1 - Math.exp(-dt * 20))
    }
    this.dist += (this.distGoal - this.dist) * Math.min(1, dt * 4)

    const sp = Math.sin(this.phi)
    tmp.set(
      this.dist * sp * Math.cos(this.theta),
      this.dist * Math.cos(this.phi),
      this.dist * sp * Math.sin(this.theta),
    )
    this.camera.position.copy(this.focus).add(tmp)
    this.camera.lookAt(this.focus)
  }

  get distance(): number {
    return this.dist
  }
}
