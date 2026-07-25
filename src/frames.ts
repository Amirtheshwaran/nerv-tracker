import * as THREE from 'three'

// Scene scale: 1 unit = 1000 km
export const KM_PER_UNIT = 1000
export const AU_KM = 149597870.7
export const AU = AU_KM / KM_PER_UNIT
export const EARTH_R = 6371 / KM_PER_UNIT
export const LD_KM = 384400
export const OBLIQUITY = (23.43928 * Math.PI) / 180

const cosE = Math.cos(OBLIQUITY)
const sinE = Math.sin(OBLIQUITY)

// ECI equatorial frame (km): X = vernal equinox, Z = north pole.
// Scene mapping: three.x = eci.x, three.y = eci.z, three.z = -eci.y (Y-up, pole up)
export function eciKmToScene(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(x / KM_PER_UNIT, z / KM_PER_UNIT, -y / KM_PER_UNIT)
}

// Heliocentric/geocentric ecliptic (AU) -> equatorial "ECI-style" scene units
export function eclAuToScene(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  const yq = y * cosE - z * sinE
  const zq = y * sinE + z * cosE
  return out.set(x * AU, zq * AU, -yq * AU)
}

export function julianDate(ms: number): number {
  return ms / 86400000 + 2440587.5
}

export function centuriesJ2000(jd: number): number {
  return (jd - 2451545.0) / 36525
}
