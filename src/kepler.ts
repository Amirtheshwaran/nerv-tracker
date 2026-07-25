// Keplerian orbit propagation: planets (JPL approximate elements, 1800-2050 AD)
// and small bodies (osculating elements from SBDB/NeoWs).
import { centuriesJ2000, julianDate } from './frames'

const DEG = Math.PI / 180

export interface Ecl {
  x: number
  y: number
  z: number
}

export function solveKepler(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI
  for (let i = 0; i < 12; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    E -= d
    if (Math.abs(d) < 1e-9) break
  }
  return E
}

// a in AU, angles in radians -> heliocentric ecliptic position in AU
export function elementsToEcl(
  a: number,
  e: number,
  inc: number,
  Om: number,
  w: number,
  M: number,
): Ecl {
  const E = solveKepler(M, e)
  const xp = a * (Math.cos(E) - e)
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E)
  const cO = Math.cos(Om), sO = Math.sin(Om)
  const cw = Math.cos(w), sw = Math.sin(w)
  const ci = Math.cos(inc), si = Math.sin(inc)
  return {
    x: (cO * cw - sO * sw * ci) * xp + (-cO * sw - sO * cw * ci) * yp,
    y: (sO * cw + cO * sw * ci) * xp + (-sO * sw + cO * cw * ci) * yp,
    z: sw * si * xp + cw * si * yp,
  }
}

// JPL approximate planetary elements, J2000 ecliptic, valid 1800-2050.
// [a, e, I, L, longPeri, longNode] + rates per Julian century
const PLANET_ELEMENTS: Record<string, [number[], number[]]> = {
  mercury: [
    [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  ],
  venus: [
    [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
  ],
  earth: [
    [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
    [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  ],
  mars: [
    [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  ],
  jupiter: [
    [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  ],
  saturn: [
    [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  ],
  uranus: [
    [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
    [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  ],
  neptune: [
    [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
  ],
}

export const PLANET_NAMES = Object.keys(PLANET_ELEMENTS)

export function planetHelioEcl(name: string, ms: number): Ecl {
  const [el, rate] = PLANET_ELEMENTS[name]
  const T = centuriesJ2000(julianDate(ms))
  const a = el[0] + rate[0] * T
  const e = el[1] + rate[1] * T
  const inc = (el[2] + rate[2] * T) * DEG
  const L = (el[3] + rate[3] * T) * DEG
  const lp = (el[4] + rate[4] * T) * DEG
  const Om = (el[5] + rate[5] * T) * DEG
  const w = lp - Om
  let M = L - lp
  M = M % (2 * Math.PI)
  if (M > Math.PI) M -= 2 * Math.PI
  if (M < -Math.PI) M += 2 * Math.PI
  return elementsToEcl(a, e, inc, Om, w, M)
}

// Small body osculating elements (angles in degrees, epoch as JD, n in deg/day)
export interface SmallBodyElements {
  a: number
  e: number
  i: number
  om: number
  w: number
  ma: number
  epochJd: number
  n: number
}

export function smallBodyHelioEcl(el: SmallBodyElements, ms: number): Ecl {
  const dDays = julianDate(ms) - el.epochJd
  const M = (el.ma + el.n * dDays) * DEG
  return elementsToEcl(el.a, el.e, el.i * DEG, el.om * DEG, el.w * DEG, M)
}

// Sample one full orbit as ecliptic points (for orbit line rendering)
export function orbitPathEcl(
  a: number,
  e: number,
  iDeg: number,
  omDeg: number,
  wDeg: number,
  segments = 256,
): Ecl[] {
  const pts: Ecl[] = []
  for (let s = 0; s <= segments; s++) {
    const M = (s / segments) * 2 * Math.PI
    pts.push(elementsToEcl(a, e, iDeg * DEG, omDeg * DEG, wDeg * DEG, M))
  }
  return pts
}

// Low-precision geocentric Moon (Astronomical Almanac approximation).
// Returns geocentric ecliptic position in AU. Good to ~0.3 deg.
export function moonGeoEcl(ms: number): Ecl {
  const T = centuriesJ2000(julianDate(ms))
  const s = (x: number) => Math.sin(x * DEG)
  const c = (x: number) => Math.cos(x * DEG)
  const lam =
    218.32 + 481267.883 * T +
    6.29 * s(134.9 + 477198.85 * T) -
    1.27 * s(259.2 - 413335.38 * T) +
    0.66 * s(235.7 + 890534.23 * T) +
    0.21 * s(269.9 + 954397.7 * T) -
    0.19 * s(357.5 + 35999.05 * T) -
    0.11 * s(186.6 + 966404.05 * T)
  const bet =
    5.13 * s(93.3 + 483202.03 * T) +
    0.28 * s(228.2 + 960400.87 * T) -
    0.28 * s(318.3 + 6003.18 * T) -
    0.17 * s(217.6 - 407332.2 * T)
  const par =
    0.9508 +
    0.0518 * c(134.9 + 477198.85 * T) +
    0.0095 * c(259.2 - 413335.38 * T) +
    0.0078 * c(235.7 + 890534.23 * T) +
    0.0028 * c(269.9 + 954397.7 * T)
  const distAu = 6378.14 / Math.sin(par * DEG) / 149597870.7
  return {
    x: distAu * c(bet) * c(lam),
    y: distAu * c(bet) * s(lam),
    z: distAu * s(bet),
  }
}
