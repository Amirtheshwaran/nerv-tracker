import * as THREE from 'three'

// Camera-following star sphere (no parallax, reads as infinitely far)
export class Starfield {
  group = new THREE.Group()

  constructor(scene: THREE.Scene, count = 5000, radius = 1.0e7) {
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    const c = new THREE.Color()
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1
      const t = Math.random() * Math.PI * 2
      const s = Math.sqrt(1 - u * u)
      pos[i * 3] = radius * s * Math.cos(t)
      pos[i * 3 + 1] = radius * u
      pos[i * 3 + 2] = radius * s * Math.sin(t)
      const w = 0.25 + Math.pow(Math.random(), 3) * 0.75
      c.setHSL(0.35 + Math.random() * 0.25, 0.25, 0.5 + Math.random() * 0.3)
      col[i * 3] = c.r * w
      col[i * 3 + 1] = c.g * w
      col[i * 3 + 2] = c.b * w
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const stars = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        size: 2.2,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    )
    stars.frustumCulled = false
    this.group.add(stars)
    scene.add(this.group)
  }

  update(cameraPos: THREE.Vector3) {
    this.group.position.copy(cameraPos)
  }
}
