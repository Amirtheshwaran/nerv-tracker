import * as THREE from 'three'
import { feature } from 'topojson-client'
import { EARTH_R } from '../frames'
import type { FocusTarget } from '../camera'

const R = EARTH_R

function latLonToVec(latDeg: number, lonDeg: number, r: number): THREE.Vector3 {
  const lat = (latDeg * Math.PI) / 180
  const lon = (lonDeg * Math.PI) / 180
  // ECEF -> scene mapping (x, z, -y)
  const x = r * Math.cos(lat) * Math.cos(lon)
  const y = r * Math.cos(lat) * Math.sin(lon)
  const z = r * Math.sin(lat)
  return new THREE.Vector3(x, z, -y)
}

export class Earth {
  // rotates with the planet (GMST)
  fixed = new THREE.Group()
  // stays in ECI (range rings)
  inertial = new THREE.Group()

  focusTarget: FocusTarget = {
    name: 'EARTH',
    kind: 'earth',
    getPosition: (out) => out.set(0, 0, 0),
    viewDist: 26,
    minDist: 7.2,
  }

  constructor(scene: THREE.Scene) {
    scene.add(this.fixed, this.inertial)

    // occluder sphere: hides far-side lines
    const occ = new THREE.Mesh(
      new THREE.SphereGeometry(R * 0.995, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0x020604 }),
    )
    this.fixed.add(occ)

    // subtle hologram shell
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.001, 48, 32),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { cTint: { value: new THREE.Color(0x0a3b24) } },
        vertexShader: `
          varying vec3 vN; varying vec3 vV;
          void main() {
            vN = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform vec3 cTint; varying vec3 vN; varying vec3 vV;
          void main() {
            float f = pow(1.0 - abs(dot(vN, vV)), 2.2);
            gl_FragColor = vec4(cTint * 2.2, f * 0.85 + 0.05);
          }`,
      }),
    )
    this.fixed.add(shell)

    // atmosphere rim glow
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.035, 48, 32),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        vertexShader: `
          varying vec3 vN; varying vec3 vV;
          void main() {
            vN = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          varying vec3 vN; varying vec3 vV;
          void main() {
            float f = pow(1.0 - abs(dot(vN, vV)), 3.0);
            gl_FragColor = vec4(vec3(0.16, 0.9, 0.55) * f, f * 0.6);
          }`,
      }),
    )
    this.inertial.add(atmo)

    this.buildGraticule()
    this.buildRings()
    this.loadCoastlines()
  }

  private buildGraticule() {
    const pts: THREE.Vector3[] = []
    const seg = 90
    for (let lat = -75; lat <= 75; lat += 15) {
      for (let s = 0; s < seg; s++) {
        pts.push(latLonToVec(lat, (s / seg) * 360, R * 1.002))
        pts.push(latLonToVec(lat, ((s + 1) / seg) * 360, R * 1.002))
      }
    }
    for (let lon = 0; lon < 360; lon += 15) {
      for (let s = 0; s < seg; s++) {
        pts.push(latLonToVec(-90 + (s / seg) * 180, lon, R * 1.002))
        pts.push(latLonToVec(-90 + ((s + 1) / seg) * 180, lon, R * 1.002))
      }
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts)
    const grat = new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({ color: 0x1a5c38, transparent: true, opacity: 0.4 }),
    )
    this.fixed.add(grat)
  }

  private buildRings() {
    // equatorial range rings: LEO shell, GEO, lunar distance
    const rings: [number, number, number][] = [
      [R + 2, 0x66341a, 0.5],
      [42.164, 0xff6b1a, 0.4],
      [384.4, 0x66341a, 0.3],
    ]
    for (const [radius, color, opacity] of rings) {
      const pts: THREE.Vector3[] = []
      for (let s = 0; s <= 180; s++) {
        const a = (s / 180) * 2 * Math.PI
        pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius))
      }
      const ring = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
      )
      this.inertial.add(ring)
    }
  }

  private async loadCoastlines() {
    try {
      const res = await fetch(import.meta.env.BASE_URL + 'land-110m.json')
      const topo = await res.json()
      const land = feature(topo, topo.objects.land) as any
      const pts: THREE.Vector3[] = []
      const polys =
        land.geometry?.type === 'MultiPolygon'
          ? land.geometry.coordinates
          : land.type === 'FeatureCollection'
            ? land.features.flatMap((f: any) =>
                f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates],
              )
            : [land.coordinates]
      for (const poly of polys) {
        for (const ring of poly) {
          for (let i = 0; i < ring.length - 1; i++) {
            pts.push(latLonToVec(ring[i][1], ring[i][0], R * 1.004))
            pts.push(latLonToVec(ring[i + 1][1], ring[i + 1][0], R * 1.004))
          }
        }
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts)
      const coast = new THREE.LineSegments(
        g,
        new THREE.LineBasicMaterial({ color: 0x49ff9d, transparent: true, opacity: 0.9 }),
      )
      this.fixed.add(coast)
    } catch (e) {
      console.warn('coastlines failed', e)
    }
  }

  setRotation(gmstRad: number) {
    this.fixed.rotation.y = gmstRad
  }
}
