// Propagates every tracked satellite with SGP4 off the main thread.
// init: { type:'init', omm: OmmRecord[] } -> { type:'ready', ok: Uint8Array }
// tick: { type:'tick', tMs } -> { type:'pos', tMs, pos: Float32Array (ECI km), vel: Float32Array (km/s), tookMs }
import * as satellite from 'satellite.js'

let satrecs: (satellite.SatRec | null)[] = []

self.onmessage = (ev: MessageEvent) => {
  const msg = ev.data
  if (msg.type === 'init') {
    satrecs = (msg.omm as any[]).map((rec) => {
      try {
        const sr = satellite.json2satrec(rec)
        return sr.error === 0 ? sr : null
      } catch {
        return null
      }
    })
    const ok = new Uint8Array(satrecs.map((r) => (r ? 1 : 0)))
    ;(self as any).postMessage({ type: 'ready', ok }, [ok.buffer])
    return
  }
  if (msg.type === 'tick') {
    const t0 = performance.now()
    const date = new Date(msg.tMs)
    const n = satrecs.length
    const pos = new Float32Array(n * 3)
    const vel = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const rec = satrecs[i]
      if (!rec) {
        pos[i * 3] = NaN
        continue
      }
      try {
        const pv = satellite.propagate(rec, date)
        const p = pv?.position
        if (p && typeof p !== 'boolean') {
          pos[i * 3] = p.x
          pos[i * 3 + 1] = p.y
          pos[i * 3 + 2] = p.z
          const v = pv.velocity
          if (v && typeof v !== 'boolean') {
            vel[i * 3] = v.x
            vel[i * 3 + 1] = v.y
            vel[i * 3 + 2] = v.z
          }
        } else {
          pos[i * 3] = NaN
        }
      } catch {
        pos[i * 3] = NaN
      }
    }
    ;(self as any).postMessage(
      { type: 'pos', tMs: msg.tMs, pos, vel, tookMs: performance.now() - t0 },
      [pos.buffer, vel.buffer],
    )
  }
}
