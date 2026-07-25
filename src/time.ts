export class SimClock {
  simMs: number = Date.now()
  warp = 1
  private lastWarp = 1

  tick(dtRealSec: number) {
    this.simMs += dtRealSec * 1000 * this.warp
  }

  setWarp(w: number) {
    if (w === 0 && this.warp !== 0) this.lastWarp = this.warp
    this.warp = w
  }

  togglePause() {
    this.warp = this.warp === 0 ? this.lastWarp : 0
  }

  get date(): Date {
    return new Date(this.simMs)
  }
}
