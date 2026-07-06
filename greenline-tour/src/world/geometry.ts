import * as THREE from 'three'

export interface Pt {
  x: number
  z: number
}

/** Sample a THREE.Curve on the XZ plane into equally spaced points. */
export function samplePath(curve: THREE.Curve<THREE.Vector3>, n: number): Pt[] {
  return curve.getSpacedPoints(n).map((p) => ({ x: p.x, z: p.z }))
}

function normals(pts: Pt[]): Pt[] {
  const res: Pt[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(pts.length - 1, i + 1)]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len = Math.hypot(dx, dz) || 1
    res.push({ x: -dz / len, z: dx / len })
  }
  return res
}

/**
 * Flat ribbon following a polyline (path/plaza paving).
 * uvScale = meters per texture tile.
 */
export function ribbonGeometry(
  pts: Pt[],
  width: number,
  yOf: (x: number, z: number) => number,
  uvScale = 4,
  lift = 0.03,
): THREE.BufferGeometry {
  const nrm = normals(pts)
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
    const half = width / 2
    const lx = pts[i].x - nrm[i].x * half
    const lz = pts[i].z - nrm[i].z * half
    const rx = pts[i].x + nrm[i].x * half
    const rz = pts[i].z + nrm[i].z * half
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

/**
 * Low wall following a polyline: top + both sides + caps.
 * uvScale = meters per texture tile.
 */
export function wallGeometry(
  pts: Pt[],
  width: number,
  height: number,
  yOf: (x: number, z: number) => number,
  uvScale = 2,
): THREE.BufferGeometry {
  const nrm = normals(pts)
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const half = width / 2
  const n = pts.length

  // ground heights along both edges, kept monotone-smooth so the wall sits well
  const yb: number[] = pts.map((p) => yOf(p.x, p.z) - 0.15)
  const yt: number[] = yb.map((y) => y + height + 0.15)

  let s = 0
  const ring: number[][] = [] // per point: [li, ri, liTop, riTop] vertex indices
  for (let i = 0; i < n; i++) {
    if (i > 0) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
    const lx = pts[i].x - nrm[i].x * half
    const lz = pts[i].z - nrm[i].z * half
    const rx = pts[i].x + nrm[i].x * half
    const rz = pts[i].z + nrm[i].z * half
    const base = pos.length / 3
    // 0: left bottom, 1: left top, 2: right top, 3: right bottom
    pos.push(lx, yb[i], lz, lx, yt[i], lz, rx, yt[i], rz, rx, yb[i], rz)
    uv.push(s / uvScale, 0, s / uvScale, height / uvScale, s / uvScale, height / uvScale + width / uvScale, s / uvScale, 2 * (height / uvScale) + width / uvScale)
    ring.push([base, base + 1, base + 2, base + 3])
    if (i > 0) {
      const [a0, a1, a2, a3] = ring[i - 1]
      const [b0, b1, b2, b3] = ring[i]
      // left side
      idx.push(a0, a1, b0, a1, b1, b0)
      // top
      idx.push(a1, a2, b1, a2, b2, b1)
      // right side
      idx.push(a2, a3, b2, a3, b3, b2)
    }
  }
  // end caps
  const [f0, f1, f2, f3] = ring[0]
  idx.push(f0, f3, f1, f3, f2, f1)
  const [l0, l1, l2, l3] = ring[n - 1]
  idx.push(l0, l1, l3, l3, l1, l2)

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** Offset a polyline sideways (positive = right of direction of travel). */
export function offsetPolyline(pts: Pt[], offset: number): Pt[] {
  const nrm = normals(pts)
  return pts.map((p, i) => ({ x: p.x + nrm[i].x * offset, z: p.z + nrm[i].z * offset }))
}

/** Organic blob outline (for rubber surface, pond rims). */
export function blobPoints(
  cx: number,
  cz: number,
  rx: number,
  rz: number,
  rot: number,
  wobble = 0.18,
  seed = 1,
  n = 48,
): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const w =
      1 +
      wobble * Math.sin(a * 3 + seed * 1.7) * 0.6 +
      wobble * Math.sin(a * 5 + seed * 3.1) * 0.4
    const x0 = Math.cos(a) * rx * w
    const z0 = Math.sin(a) * rz * w
    pts.push({
      x: cx + x0 * Math.cos(rot) - z0 * Math.sin(rot),
      z: cz + x0 * Math.sin(rot) + z0 * Math.cos(rot),
    })
  }
  return pts
}

/** Filled blob as a fan (flat, for water / rubber surfaces). */
export function blobGeometry(pts: Pt[], y: number, uvScale = 8): THREE.BufferGeometry {
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length
  const cz = pts.reduce((a, p) => a + p.z, 0) / pts.length
  const pos: number[] = [cx, y, cz]
  const uv: number[] = [cx / uvScale, cz / uvScale]
  const idx: number[] = []
  for (let i = 0; i < pts.length; i++) {
    pos.push(pts[i].x, y, pts[i].z)
    uv.push(pts[i].x / uvScale, pts[i].z / uvScale)
    const a = i + 1
    const b = ((i + 1) % pts.length) + 1
    idx.push(0, b, a)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
