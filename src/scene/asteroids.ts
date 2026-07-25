import * as THREE from 'three'
import { eclAuToScene, AU } from '../frames'
import { orbitPathEcl, planetHelioEcl, smallBodyHelioEcl } from '../kepler'
import type { CloseApproach, SmallBody } from '../data/jpl'
import type { FocusTarget } from '../camera'

export interface TrackedAsteroid {
  approach: CloseApproach
  body: SmallBody
  marker: THREE.Mesh
  orbitLine: THREE.Line
  geoPos: THREE.Vector3
  focusTarget: FocusTarget
}

export class AsteroidField {
  tracked: TrackedAsteroid[] = []
  private scene: THREE.Scene
  private helioGroup: THREE.Group

  constructor(scene: THREE.Scene, helioGroup: THREE.Group) {
    this.scene = scene
    this.helioGroup = helioGroup
  }

  add(approach: CloseApproach, body: SmallBody): TrackedAsteroid {
    const color = body.pha ? 0xff2d2d : 0xffc233
    const el = body.elements
    const pts = orbitPathEcl(el.a, el.e, el.i, el.om, el.w, 512).map((p) =>
      eclAuToScene(p.x, p.y, p.z, new THREE.Vector3()),
    )
    const orbitLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: body.pha ? 0.55 : 0.35,
      }),
    )
    this.helioGroup.add(orbitLine)

    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(1),
      new THREE.MeshBasicMaterial({ color, wireframe: true }),
    )
    const geoPos = new THREE.Vector3()
    const t: TrackedAsteroid = {
      approach,
      body,
      marker,
      orbitLine,
      geoPos,
      focusTarget: {
        name: body.fullname.toUpperCase(),
        kind: 'asteroid',
        getPosition: (out) => out.copy(geoPos),
        viewDist: 60,
        minDist: 0.5,
      },
    }
    ;(marker as any).userData = { pick: 'asteroid', ref: t }
    this.scene.add(marker)
    this.tracked.push(t)
    return t
  }

  update(simMs: number, camera: THREE.PerspectiveCamera) {
    if (!this.tracked.length) return
    const eh = planetHelioEcl('earth', simMs)
    for (const t of this.tracked) {
      const p = smallBodyHelioEcl(t.body.elements, simMs)
      eclAuToScene(p.x - eh.x, p.y - eh.y, p.z - eh.z, t.geoPos)
      t.marker.position.copy(t.geoPos)
      const d = camera.position.distanceTo(t.geoPos)
      t.marker.scale.setScalar(Math.max(0.02, d * 0.006))
      t.marker.rotation.y += 0.004
      t.marker.rotation.x += 0.002
    }
  }

  geoDistanceAu(t: TrackedAsteroid): number {
    return t.geoPos.length() / AU
  }

  get pickables(): THREE.Object3D[] {
    return this.tracked.map((t) => t.marker)
  }
}
