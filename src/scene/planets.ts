import * as THREE from 'three'
import { eclAuToScene, KM_PER_UNIT } from '../frames'
import { moonGeoEcl, orbitPathEcl, planetHelioEcl, PLANET_NAMES } from '../kepler'
import type { FocusTarget } from '../camera'

interface PlanetStyle {
  colorA: number // dominant surface tone
  colorB: number // band / secondary tone
  bandFreq: number // latitude band frequency (0 = none)
  bandWarp: number // noise distortion of bands
  noiseAmp: number // surface mottling (craters, storms)
  caps: number // polar cap strength
  rim: number
  radiusKm: number
  spinHours: number
  tiltRad: number
  ring?: boolean
}

const STYLES: Record<string, PlanetStyle> = {
  mercury: { colorA: 0x8d8378, colorB: 0x4e463e, bandFreq: 0, bandWarp: 0, noiseAmp: 0.85, caps: 0, rim: 0.55, radiusKm: 2440, spinHours: 1407, tiltRad: 0.0 },
  venus: { colorA: 0xe6c388, colorB: 0xb08c4f, bandFreq: 3.2, bandWarp: 2.6, noiseAmp: 0.3, caps: 0, rim: 0.8, radiusKm: 6052, spinHours: -5832, tiltRad: 0.05 },
  mars: { colorA: 0xc65f38, colorB: 0x7c3a20, bandFreq: 1.6, bandWarp: 1.8, noiseAmp: 0.65, caps: 1.0, rim: 0.6, radiusKm: 3390, spinHours: 24.6, tiltRad: 0.44 },
  jupiter: { colorA: 0xd9b28a, colorB: 0x8a5a3d, bandFreq: 11.0, bandWarp: 1.9, noiseAmp: 0.35, caps: 0, rim: 0.7, radiusKm: 69911, spinHours: 9.9, tiltRad: 0.05 },
  saturn: { colorA: 0xe3cf9d, colorB: 0xb59a63, bandFreq: 8.0, bandWarp: 1.1, noiseAmp: 0.22, caps: 0, rim: 0.7, radiusKm: 58232, spinHours: 10.7, tiltRad: 0.47, ring: true },
  uranus: { colorA: 0x9adbe0, colorB: 0x5fa8b8, bandFreq: 2.4, bandWarp: 0.7, noiseAmp: 0.12, caps: 0, rim: 0.85, radiusKm: 25362, spinHours: -17.2, tiltRad: 1.71 },
  neptune: { colorA: 0x4f74d8, colorB: 0x2b4494, bandFreq: 4.6, bandWarp: 1.5, noiseAmp: 0.3, caps: 0, rim: 0.9, radiusKm: 24622, spinHours: 16.1, tiltRad: 0.49 },
  moon: { colorA: 0xa8a6a0, colorB: 0x5c5a55, bandFreq: 0, bandWarp: 0, noiseAmp: 0.9, caps: 0, rim: 0.5, radiusKm: 1737, spinHours: 655, tiltRad: 0.03 },
}

// orbit shape elements (J2000): a, e, i, node, argPeri
const PATHS: Record<string, [number, number, number, number, number]> = {
  mercury: [0.387098, 0.205636, 7.005, 48.331, 29.124],
  venus: [0.723336, 0.006777, 3.395, 76.68, 54.884],
  earth: [1.000003, 0.016711, 0.0, 0.0, 102.937],
  mars: [1.52371, 0.093394, 1.85, 49.56, 286.5],
  jupiter: [5.202887, 0.048386, 1.304, 100.474, 273.867],
  saturn: [9.536676, 0.053862, 2.486, 113.662, 339.392],
  uranus: [19.189165, 0.047257, 0.773, 74.017, 96.998],
  neptune: [30.069923, 0.00859, 1.77, 131.784, 273.187],
}

const PLANET_VERT = `
  varying vec3 vObjN;
  varying vec3 vWorldN;
  varying vec3 vViewPos;
  void main() {
    vObjN = normalize(position);
    vWorldN = normalize(mat3(modelMatrix) * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`

const PLANET_FRAG = `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uSunDir;
  uniform float uBandFreq;
  uniform float uBandWarp;
  uniform float uNoiseAmp;
  uniform float uCaps;
  uniform float uRim;
  varying vec3 vObjN;
  varying vec3 vWorldN;
  varying vec3 vViewPos;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }
  float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash(i);
    float n100 = hash(i + vec3(1, 0, 0));
    float n010 = hash(i + vec3(0, 1, 0));
    float n110 = hash(i + vec3(1, 1, 0));
    float n001 = hash(i + vec3(0, 0, 1));
    float n101 = hash(i + vec3(1, 0, 1));
    float n011 = hash(i + vec3(0, 1, 1));
    float n111 = hash(i + vec3(1, 1, 1));
    return mix(
      mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
      mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
      f.z
    );
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * vnoise(p);
      p *= 2.13;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 n = normalize(vObjN);
    float lat = asin(clamp(n.y, -1.0, 1.0));
    float lon = atan(n.z, n.x);

    float rough = fbm(n * 6.0);
    float fine = fbm(n * 16.0 + 7.3);

    // latitude banding, warped by noise (gas giants); zero freq = rocky blend
    float t;
    if (uBandFreq > 0.5) {
      t = 0.5 + 0.5 * sin(lat * uBandFreq + (rough - 0.5) * uBandWarp * 3.0);
    } else {
      t = rough;
    }
    vec3 col = mix(uColorA, uColorB, t);

    // mottling: craters on rocky bodies, storm texture on giants
    col *= 1.0 - uNoiseAmp * 0.55 * (fine - 0.35);

    // polar caps
    col = mix(col, vec3(0.92, 0.93, 0.95), uCaps * smoothstep(0.86, 0.95, abs(n.y)) * (0.7 + 0.3 * rough));

    // 15-degree graticule, echoing the earth hologram
    float gLon = abs(fract(lon / 0.5235988) - 0.5);
    float gLat = abs(fract(lat / 0.2617994) - 0.5);
    float grid = 1.0 - smoothstep(0.0, 0.06, min(gLon, gLat));
    col += vec3(0.15, 0.75, 0.45) * grid * 0.14;

    // sun terminator
    float light = 0.22 + 0.78 * pow(max(dot(normalize(vWorldN), uSunDir), 0.0), 0.75);
    col *= light;

    // holographic rim
    vec3 viewDir = normalize(-vViewPos);
    float rim = pow(1.0 - abs(dot(normalize(vWorldN), viewDir)), 2.6);
    col += mix(uColorA, vec3(0.4, 1.0, 0.7), 0.5) * rim * uRim;

    gl_FragColor = vec4(col, 1.0);
  }
`

const RING_VERT = `
  varying vec3 vObjP;
  varying vec3 vWorldN;
  void main() {
    vObjP = position;
    vWorldN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const RING_FRAG = `
  uniform vec3 uColorA;
  uniform vec3 uSunDir;
  varying vec3 vObjP;
  varying vec3 vWorldN;
  float hash1(float p) { return fract(sin(p * 127.1) * 43758.5453); }
  void main() {
    // ring spans radius 1.35 - 2.35 in object space; normalize to 0..1
    float r = clamp((length(vObjP.xy) - 1.35), 0.0, 1.0);
    // banded annulus: density variation + inner fade + cassini-like gap
    float band = 0.45 + 0.55 * hash1(floor(r * 46.0));
    float fade = smoothstep(0.0, 0.08, r) * (1.0 - smoothstep(0.94, 1.0, r));
    float cassini = 1.0 - smoothstep(0.58, 0.6, r) * (1.0 - smoothstep(0.68, 0.7, r));
    float a = band * fade * cassini * 0.8;
    float light = 0.35 + 0.65 * abs(dot(normalize(vWorldN), uSunDir));
    gl_FragColor = vec4(uColorA * light * 1.1, a);
  }
`

function makePlanetMaterial(style: PlanetStyle): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColorA: { value: new THREE.Color(style.colorA) },
      uColorB: { value: new THREE.Color(style.colorB) },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uBandFreq: { value: style.bandFreq },
      uBandWarp: { value: style.bandWarp },
      uNoiseAmp: { value: style.noiseAmp },
      uCaps: { value: style.caps },
      uRim: { value: style.rim },
    },
    vertexShader: PLANET_VERT,
    fragmentShader: PLANET_FRAG,
  })
}

const tmpSun = new THREE.Vector3()

export class SolarSystem {
  // heliocentric drawing frame: positioned at the Sun's geocentric location
  helioGroup = new THREE.Group()
  sun: THREE.Sprite
  moonMesh: THREE.Mesh
  private markers = new Map<string, THREE.Mesh>()
  private materials = new Map<string, THREE.ShaderMaterial>()
  private geoPos = new Map<string, THREE.Vector3>()
  private moonPos = new THREE.Vector3()
  private sunPos = new THREE.Vector3()
  focusTargets: FocusTarget[] = []

  constructor(scene: THREE.Scene) {
    scene.add(this.helioGroup)

    // sun sprite
    const cv = document.createElement('canvas')
    cv.width = cv.height = 128
    const ctx = cv.getContext('2d')!
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, 'rgba(255,240,200,1)')
    grad.addColorStop(0.25, 'rgba(255,190,90,0.9)')
    grad.addColorStop(0.6, 'rgba(255,110,30,0.25)')
    grad.addColorStop(1, 'rgba(255,80,20,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 128, 128)
    const tex = new THREE.CanvasTexture(cv)
    this.sun = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    scene.add(this.sun)

    // planet orbit lines around the sun
    for (const name of PLANET_NAMES) {
      const [a, e, i, om, w] = PATHS[name]
      const pts = orbitPathEcl(a, e, i, om, w, 360).map((p) =>
        eclAuToScene(p.x, p.y, p.z, new THREE.Vector3()),
      )
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color: name === 'earth' ? 0x2c7a4b : 0x3a3f66,
          transparent: true,
          opacity: name === 'earth' ? 0.5 : 0.4,
        }),
      )
      this.helioGroup.add(line)

      if (name === 'earth') continue
      const style = STYLES[name]
      const mat = makePlanetMaterial(style)
      const marker = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), mat)
      marker.rotation.order = 'ZXY'
      marker.rotation.z = style.tiltRad
      ;(marker as any).userData = { pick: 'planet', name }
      if (style.ring) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(1.35, 2.35, 128, 1),
          new THREE.ShaderMaterial({
            uniforms: {
              uColorA: { value: new THREE.Color(0xcbb385) },
              uSunDir: { value: mat.uniforms.uSunDir.value },
            },
            vertexShader: RING_VERT,
            fragmentShader: RING_FRAG,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        )
        ring.rotation.x = -Math.PI / 2
        ;(ring as any).userData = { pick: 'planet', name }
        marker.add(ring)
      }
      scene.add(marker)
      this.markers.set(name, marker)
      this.materials.set(name, mat)
      this.geoPos.set(name, new THREE.Vector3())
      this.focusTargets.push({
        name: name.toUpperCase(),
        kind: 'planet',
        getPosition: (out) => out.copy(this.geoPos.get(name)!),
        viewDist: Math.max((style.radiusKm / KM_PER_UNIT) * 8, 40),
        minDist: (style.radiusKm / KM_PER_UNIT) * 2.2,
      })
    }

    // moon: same holographic surface treatment, geocentric
    const moonMat = makePlanetMaterial(STYLES.moon)
    this.moonMesh = new THREE.Mesh(new THREE.SphereGeometry(1737 / KM_PER_UNIT, 48, 32), moonMat)
    ;(this.moonMesh as any).userData = { pick: 'moon' }
    this.materials.set('moon', moonMat)
    scene.add(this.moonMesh)
    const moonRing: THREE.Vector3[] = []
    for (let s = 0; s <= 180; s++) {
      const a = (s / 180) * 2 * Math.PI
      moonRing.push(eclAuToScene(Math.cos(a) * 0.00257, Math.sin(a) * 0.00257, 0, new THREE.Vector3()))
    }
    const ring = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(moonRing),
      new THREE.LineBasicMaterial({ color: 0x3a5c66, transparent: true, opacity: 0.35 }),
    )
    scene.add(ring)

    this.focusTargets.push(
      {
        name: 'MOON',
        kind: 'moon',
        getPosition: (out) => out.copy(this.moonPos),
        viewDist: 9,
        minDist: 2.2,
      },
      {
        name: 'SOL',
        kind: 'sun',
        getPosition: (out) => out.copy(this.sunPos),
        viewDist: 260000,
        minDist: 800,
      },
    )
  }

  update(simMs: number, camera: THREE.PerspectiveCamera) {
    const eh = planetHelioEcl('earth', simMs)
    // sun geocentric = -earth heliocentric
    eclAuToScene(-eh.x, -eh.y, -eh.z, this.sunPos)
    this.helioGroup.position.copy(this.sunPos)
    this.sun.position.copy(this.sunPos)
    const sunDist = camera.position.distanceTo(this.sunPos)
    this.sun.scale.setScalar(Math.max(sunDist * 0.055, 1392684 / KM_PER_UNIT / 2))

    for (const [name, marker] of this.markers) {
      const p = planetHelioEcl(name, simMs)
      const gp = this.geoPos.get(name)!
      eclAuToScene(p.x - eh.x, p.y - eh.y, p.z - eh.z, gp)
      marker.position.copy(gp)
      const style = STYLES[name]
      const d = camera.position.distanceTo(gp)
      const real = style.radiusKm / KM_PER_UNIT
      marker.scale.setScalar(Math.max(real, d * 0.0045))
      // spin on sim time so time warp shows rotation
      marker.rotation.y = ((simMs / 3600000) * (2 * Math.PI)) / style.spinHours
      this.materials.get(name)!.uniforms.uSunDir.value
        .copy(tmpSun.copy(this.sunPos).sub(gp).normalize())
    }

    const m = moonGeoEcl(simMs)
    eclAuToScene(m.x, m.y, m.z, this.moonPos)
    this.moonMesh.position.copy(this.moonPos)
    const md = camera.position.distanceTo(this.moonPos)
    this.moonMesh.scale.setScalar(Math.max(1, (md * 0.004) / (1737 / KM_PER_UNIT)))
    this.materials.get('moon')!.uniforms.uSunDir.value
      .copy(tmpSun.copy(this.sunPos).sub(this.moonPos).normalize())
  }

  getSunPos(out: THREE.Vector3) {
    return out.copy(this.sunPos)
  }

  // for pick raycasting
  get pickables(): THREE.Object3D[] {
    return [...this.markers.values(), this.moonMesh]
  }

  planetGeoDistanceAu(name: string, simMs: number): number {
    const eh = planetHelioEcl('earth', simMs)
    const p = planetHelioEcl(name, simMs)
    const dx = p.x - eh.x
    const dy = p.y - eh.y
    const dz = p.z - eh.z
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }
}
