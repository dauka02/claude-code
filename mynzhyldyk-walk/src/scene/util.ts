import * as THREE from 'three'
import type { Pt } from '../data/geo'

/** Лента вдоль полилинии, y задаёт функция (рельеф + подъём). */
export function ribbon(
  pts: Pt[],
  width: number,
  yOf: (x: number, z: number) => number,
  uvScale = 4,
  lift = 0.04,
): THREE.BufferGeometry {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(pts.length - 1, i + 1)]
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const len = Math.hypot(dx, dz) || 1
    const nx = -dz / len
    const nz = dx / len
    if (i > 0) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    const half = width / 2
    const lx = pts[i][0] - nx * half
    const lz = pts[i][1] - nz * half
    const rx = pts[i][0] + nx * half
    const rz = pts[i][1] + nz * half
    pos.push(lx, yOf(lx, lz) + lift, lz, rx, yOf(rx, rz) + lift, rz)
    uv.push(0, s / uvScale, width / uvScale, s / uvScale)
    if (i > 0) {
      const k = i * 2
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** Сэмплирование полилинии с равным шагом. */
export function resample(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [pts[0]]
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    let [x0, z0] = pts[i - 1]
    const [x1, z1] = pts[i]
    let seg = Math.hypot(x1 - x0, z1 - z0)
    while (acc + seg >= step) {
      const f = (step - acc) / seg
      const nx = x0 + (x1 - x0) * f
      const nz = z0 + (z1 - z0) * f
      out.push([nx, nz])
      seg -= step - acc
      acc = 0
      x0 = nx
      z0 = nz
    }
    acc += seg
  }
  return out
}

export function polyLength(pts: Pt[]): number {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return s
}

/** Точка и направление на полилинии по дистанции. */
export function alongPoly(pts: Pt[], d: number): { x: number; z: number; dx: number; dz: number } {
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    if (acc + seg >= d) {
      const f = (d - acc) / seg
      return {
        x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f,
        z: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f,
        dx: (pts[i][0] - pts[i - 1][0]) / seg,
        dz: (pts[i][1] - pts[i - 1][1]) / seg,
      }
    }
    acc += seg
  }
  const n = pts.length
  const seg = Math.hypot(pts[n - 1][0] - pts[n - 2][0], pts[n - 1][1] - pts[n - 2][1])
  return { x: pts[n - 1][0], z: pts[n - 1][1], dx: (pts[n - 1][0] - pts[n - 2][0]) / seg, dz: (pts[n - 1][1] - pts[n - 2][1]) / seg }
}
