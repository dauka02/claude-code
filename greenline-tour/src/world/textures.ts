import * as THREE from 'three'
import { useEffect, useMemo, useState } from 'react'

/**
 * Texture layer. Higgsfield-generated files live in /public/assets/textures
 * (see docs/assets.md + npm run fetch-assets). Every texture also has a
 * procedural canvas fallback so the app runs and builds without them.
 */
export const TEX = {
  paving: '/assets/textures/paving_fan.png',
  gravel: '/assets/textures/gravel.png',
  grass: '/assets/textures/grass.png',
  stone: '/assets/textures/stone_wall.png',
  facadeLight: '/assets/textures/facade_light.png',
  facadeBrick: '/assets/textures/facade_brick.png',
  facadeLightNight: '/assets/textures/facade_light_night.png',
  facadeBrickNight: '/assets/textures/facade_brick_night.png',
  skyDay: '/assets/textures/sky_day.png',
  skyNight: '/assets/textures/sky_night.png',
} as const

type TexName = keyof typeof TEX

const loader = new THREE.TextureLoader()
const fileCache = new Map<string, THREE.Texture | 'failed' | Promise<unknown>>()

function configure(t: THREE.Texture, srgb: boolean) {
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = 4
  return t
}

/**
 * Try to load a generated texture file; until it arrives (or if it 404s)
 * return the procedural fallback. Repeat is applied to whichever is active.
 */
export function useTexOrFallback(
  name: TexName,
  makeFallback: () => THREE.Texture,
  repeat: [number, number] = [1, 1],
  srgb = true,
): THREE.Texture {
  const fallback = useMemo(() => configure(makeFallback(), srgb), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [file, setFile] = useState<THREE.Texture | null>(() => {
    const c = fileCache.get(TEX[name])
    return c instanceof THREE.Texture ? c : null
  })

  useEffect(() => {
    const url = TEX[name]
    const cached = fileCache.get(url)
    if (cached instanceof THREE.Texture) {
      setFile(cached)
      return
    }
    if (cached === 'failed') return
    if (cached) {
      ;(cached as Promise<THREE.Texture | null>).then((t) => t && setFile(t))
      return
    }
    const p = new Promise<THREE.Texture | null>((resolve) => {
      loader.load(
        url,
        (t) => {
          configure(t, srgb)
          fileCache.set(url, t)
          resolve(t)
        },
        undefined,
        () => {
          fileCache.set(url, 'failed')
          resolve(null)
        },
      )
    })
    fileCache.set(url, p)
    p.then((t) => t && setFile(t))
  }, [name, srgb])

  const active = file ?? fallback
  active.repeat.set(repeat[0], repeat[1])
  return active
}

function canvas(w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d')!
  draw(ctx, w, h)
  return new THREE.CanvasTexture(cv)
}

let seedState = 7
function srand(s: number) {
  seedState = s
}
function rnd() {
  seedState = (seedState * 16807) % 2147483647
  return (seedState - 1) / 2147483646
}

/* ------------------------------------------------------------------ */
/* Procedural fallbacks for the generated set                          */
/* ------------------------------------------------------------------ */

/** Fan / fish-scale paving drawn as overlapping scallop arcs of setts. */
export function fallbackPaving(): THREE.Texture {
  srand(11)
  return canvas(1024, 1024, (c, w, h) => {
    c.fillStyle = '#b9b6ae'
    c.fillRect(0, 0, w, h)
    const R = 128
    const rows = Math.ceil(h / (R * 0.78)) + 2
    const cols = Math.ceil(w / (R * 1.55)) + 2
    for (let r = rows; r >= -1; r--) {
      for (let q = -1; q <= cols; q++) {
        const cx = q * R * 1.55 + (r % 2 ? R * 0.78 : 0)
        const cy = r * R * 0.78
        const tone = 0.82 + rnd() * 0.35
        // concentric rings of setts inside the fan
        for (let ring = 4; ring >= 1; ring--) {
          const rr = (R * ring) / 4
          const n = 5 + ring * 3
          for (let i = 0; i < n; i++) {
            const a0 = Math.PI + (i / n) * Math.PI
            const a1 = Math.PI + ((i + 0.92) / n) * Math.PI
            const shade = tone * (0.9 + rnd() * 0.22)
            const g = Math.round(168 * shade)
            c.fillStyle = `rgb(${g + 8},${g + 4},${g - 4})`
            c.beginPath()
            c.arc(cx, cy, rr, a0, a1)
            c.arc(cx, cy, rr - R / 4.6, a1, a0, true)
            c.closePath()
            c.fill()
            c.strokeStyle = 'rgba(90,86,78,0.7)'
            c.lineWidth = 2.5
            c.stroke()
          }
        }
      }
    }
  })
}

export function fallbackGravel(): THREE.Texture {
  srand(23)
  return canvas(512, 512, (c, w, h) => {
    c.fillStyle = '#a8a094'
    c.fillRect(0, 0, w, h)
    for (let i = 0; i < 14000; i++) {
      const v = 0.75 + rnd() * 0.5
      c.fillStyle = `rgb(${(168 * v) | 0},${(160 * v) | 0},${(146 * v) | 0})`
      const s = 1.5 + rnd() * 3.5
      c.beginPath()
      c.ellipse(rnd() * w, rnd() * h, s, s * (0.6 + rnd() * 0.5), rnd() * 3, 0, Math.PI * 2)
      c.fill()
    }
  })
}

export function fallbackGrass(): THREE.Texture {
  srand(31)
  return canvas(512, 512, (c, w, h) => {
    c.fillStyle = '#5d7a3f'
    c.fillRect(0, 0, w, h)
    for (let i = 0; i < 9000; i++) {
      const v = rnd()
      c.strokeStyle =
        v < 0.45
          ? 'rgba(88,118,58,0.5)'
          : v < 0.8
            ? 'rgba(110,140,70,0.5)'
            : 'rgba(140,150,80,0.45)'
      c.lineWidth = 1 + rnd()
      const x = rnd() * w
      const y = rnd() * h
      c.beginPath()
      c.moveTo(x, y)
      c.lineTo(x + rnd() * 6 - 3, y - 3 - rnd() * 6)
      c.stroke()
    }
  })
}

export function fallbackStone(): THREE.Texture {
  srand(41)
  return canvas(512, 512, (c, w, h) => {
    c.fillStyle = '#8f887b'
    c.fillRect(0, 0, w, h)
    const rows = 6
    for (let r = 0; r < rows; r++) {
      const y0 = (r * h) / rows
      let x = r % 2 ? -30 : 0
      while (x < w + 30) {
        const bw = 50 + rnd() * 70
        const v = 0.85 + rnd() * 0.3
        c.fillStyle = `rgb(${(196 * v) | 0},${(188 * v) | 0},${(172 * v) | 0})`
        c.fillRect(x + 3, y0 + 3, bw - 6, h / rows - 6)
        // subtle speckle
        for (let i = 0; i < 30; i++) {
          c.fillStyle = `rgba(120,112,100,${0.1 + rnd() * 0.15})`
          c.fillRect(x + 4 + rnd() * (bw - 8), y0 + 4 + rnd() * (h / rows - 8), 2, 2)
        }
        x += bw
      }
    }
  })
}

function drawFacade(night: boolean, brick: boolean): THREE.Texture {
  srand(brick ? 77 : 55)
  return canvas(512, 640, (c, w, h) => {
    if (night) {
      c.fillStyle = brick ? '#241d1a' : '#1e2126'
    } else {
      c.fillStyle = brick ? '#7a5140' : '#d8d6d0'
    }
    c.fillRect(0, 0, w, h)
    if (!night) {
      // panel variation
      for (let i = 0; i < 40; i++) {
        c.fillStyle = brick
          ? `rgba(${100 + rnd() * 40},${60 + rnd() * 25},${45 + rnd() * 20},0.35)`
          : `rgba(${190 + rnd() * 50},${190 + rnd() * 45},${185 + rnd() * 40},0.4)`
        c.fillRect(rnd() * w, rnd() * h, 30 + rnd() * 80, 20 + rnd() * 50)
      }
    }
    const cols = 4
    const rows = 6
    for (let r = 0; r < rows; r++) {
      for (let q = 0; q < cols; q++) {
        const x = ((q + 0.22) / cols) * w
        const y = ((r + 0.2) / rows) * h
        const ww = (0.56 / cols) * w
        const wh = (0.58 / rows) * h
        if (night) {
          const lit = rnd() < 0.58
          c.fillStyle = lit
            ? `rgba(${230 + rnd() * 25},${175 + rnd() * 30},${90 + rnd() * 40},1)`
            : 'rgba(28,32,40,1)'
        } else {
          const sky = 130 + rnd() * 60
          c.fillStyle = `rgb(${sky * 0.75},${sky * 0.85},${sky})`
        }
        c.fillRect(x, y, ww, wh)
        c.strokeStyle = night ? 'rgba(10,10,12,0.9)' : 'rgba(40,42,46,0.9)'
        c.lineWidth = 3
        c.strokeRect(x, y, ww, wh)
      }
    }
  })
}

export const fallbackFacadeLight = () => drawFacade(false, false)
export const fallbackFacadeBrick = () => drawFacade(false, true)
export const fallbackFacadeLightNight = () => drawFacade(true, false)
export const fallbackFacadeBrickNight = () => drawFacade(true, true)

function drawSky(night: boolean): THREE.Texture {
  srand(night ? 99 : 88)
  return canvas(1024, 512, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h)
    if (night) {
      g.addColorStop(0, '#060a18')
      g.addColorStop(0.45, '#0b1228')
      g.addColorStop(0.55, '#18203a')
      g.addColorStop(0.62, '#2a2c42')
      g.addColorStop(1, '#0a0d1a')
    } else {
      g.addColorStop(0, '#3d74c4')
      g.addColorStop(0.4, '#7aa7dd')
      g.addColorStop(0.53, '#cfdde8')
      g.addColorStop(0.6, '#e8e3d5')
      g.addColorStop(1, '#b9c4cc')
    }
    c.fillStyle = g
    c.fillRect(0, 0, w, h)
    if (night) {
      for (let i = 0; i < 420; i++) {
        const y = rnd() * h * 0.52
        const a = 0.25 + rnd() * 0.75
        c.fillStyle = `rgba(255,255,255,${a * (1 - y / (h * 0.6))})`
        c.fillRect(rnd() * w, y, rnd() < 0.12 ? 2 : 1, rnd() < 0.12 ? 2 : 1)
      }
      // warm city glow at horizon
      const glow = c.createLinearGradient(0, h * 0.45, 0, h * 0.58)
      glow.addColorStop(0, 'rgba(120,90,50,0)')
      glow.addColorStop(1, 'rgba(150,110,60,0.35)')
      c.fillStyle = glow
      c.fillRect(0, h * 0.45, w, h * 0.13)
    } else {
      // soft cirrus streaks
      for (let i = 0; i < 26; i++) {
        const y = h * (0.12 + rnd() * 0.3)
        const x = rnd() * w
        const lw = 60 + rnd() * 180
        const grad = c.createRadialGradient(x, y, 0, x, y, lw)
        grad.addColorStop(0, 'rgba(255,255,255,0.25)')
        grad.addColorStop(1, 'rgba(255,255,255,0)')
        c.fillStyle = grad
        c.save()
        c.translate(x, y)
        c.scale(2.4, 0.4)
        c.beginPath()
        c.arc(0, 0, lw, 0, Math.PI * 2)
        c.fill()
        c.restore()
      }
    }
  })
}

export const fallbackSkyDay = () => drawSky(false)
export const fallbackSkyNight = () => drawSky(true)

/* ------------------------------------------------------------------ */
/* Purely procedural textures (no generated counterpart)               */
/* ------------------------------------------------------------------ */

export function makeWoodTexture(): THREE.CanvasTexture {
  srand(7)
  const t = canvas(256, 256, (c, s) => {
    c.fillStyle = '#9c7648'
    c.fillRect(0, 0, s, s)
    const planks = 6
    for (let i = 0; i < planks; i++) {
      const y0 = (i * s) / planks
      const tone = 0.85 + rnd() * 0.3
      c.fillStyle = `rgb(${Math.round(156 * tone)},${Math.round(118 * tone)},${Math.round(72 * tone)})`
      c.fillRect(0, y0, s, s / planks - 2)
      c.strokeStyle = 'rgba(60,40,20,0.55)'
      c.lineWidth = 2
      c.strokeRect(-2, y0, s + 4, s / planks - 2)
      c.strokeStyle = 'rgba(80,55,28,0.35)'
      c.lineWidth = 1
      for (let g2 = 0; g2 < 10; g2++) {
        const gy = y0 + rnd() * (s / planks - 4) + 2
        c.beginPath()
        c.moveTo(0, gy)
        c.bezierCurveTo(s * 0.3, gy + rnd() * 4 - 2, s * 0.7, gy + rnd() * 4 - 2, s, gy)
        c.stroke()
      }
    }
  }) as THREE.CanvasTexture
  return configure(t, true) as THREE.CanvasTexture
}

export function makeBirchTexture(): THREE.CanvasTexture {
  srand(21)
  const t = canvas(128, 128, (c, s) => {
    c.fillStyle = '#e8e6e0'
    c.fillRect(0, 0, s, s)
    c.fillStyle = 'rgba(200,198,192,0.6)'
    for (let i = 0; i < 20; i++) c.fillRect(rnd() * s, rnd() * s, 2 + rnd() * 6, 8 + rnd() * 20)
    c.fillStyle = '#1c1a18'
    for (let i = 0; i < 26; i++) {
      const w2 = 6 + rnd() * 26
      const h2 = 2 + rnd() * 5
      c.beginPath()
      c.ellipse(rnd() * s, rnd() * s, w2 / 2, h2 / 2, 0, 0, Math.PI * 2)
      c.fill()
    }
  }) as THREE.CanvasTexture
  return configure(t, true) as THREE.CanvasTexture
}

export function makeChainlinkTexture(): THREE.CanvasTexture {
  const t = canvas(128, 128, (c, s) => {
    c.clearRect(0, 0, s, s)
    c.strokeStyle = 'rgba(200,205,210,1)'
    c.lineWidth = 3
    const step = 32
    for (let i = -1; i <= s / step + 1; i++) {
      c.beginPath()
      c.moveTo(i * step - s, -4)
      c.lineTo(i * step + s, s + 4)
      c.stroke()
      c.beginPath()
      c.moveTo(i * step + s, -4)
      c.lineTo(i * step - s, s + 4)
      c.stroke()
    }
  }) as THREE.CanvasTexture
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

export function makeGlowTexture(): THREE.CanvasTexture {
  const t = canvas(128, 128, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    g.addColorStop(0, 'rgba(255,220,170,1)')
    g.addColorStop(0.3, 'rgba(255,205,140,0.55)')
    g.addColorStop(1, 'rgba(255,190,120,0)')
    c.fillStyle = g
    c.fillRect(0, 0, s, s)
  }) as THREE.CanvasTexture
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function makeRubberTexture(): THREE.CanvasTexture {
  srand(33)
  const t = canvas(256, 256, (c, s) => {
    c.fillStyle = '#3f8f96'
    c.fillRect(0, 0, s, s)
    for (let i = 0; i < 2600; i++) {
      const v = rnd()
      c.fillStyle =
        v < 0.5 ? 'rgba(52,125,133,0.8)' : v < 0.8 ? 'rgba(80,160,165,0.8)' : 'rgba(38,100,110,0.8)'
      c.fillRect(rnd() * s, rnd() * s, 2, 2)
    }
  }) as THREE.CanvasTexture
  return configure(t, true) as THREE.CanvasTexture
}

export function makeCourtTexture(): THREE.CanvasTexture {
  const t = canvas(512, 512, (c, s) => {
    c.fillStyle = '#2e6f7d'
    c.fillRect(0, 0, s, s)
    c.fillStyle = '#38808f'
    c.fillRect(s * 0.08, s * 0.08, s * 0.84, s * 0.84)
    c.strokeStyle = '#eef2f0'
    c.lineWidth = 4
    c.strokeRect(s * 0.08, s * 0.08, s * 0.84, s * 0.84)
    c.beginPath()
    c.moveTo(s * 0.08, s / 2)
    c.lineTo(s * 0.92, s / 2)
    c.stroke()
    c.beginPath()
    c.arc(s / 2, s / 2, s * 0.09, 0, Math.PI * 2)
    c.stroke()
    for (const end of [0.08, 0.92]) {
      const dir = end < 0.5 ? 1 : -1
      c.strokeRect(s / 2 - s * 0.12, s * end, s * 0.24, dir * s * 0.16)
      c.beginPath()
      c.arc(s / 2, s * end + dir * s * 0.16, s * 0.12, end > 0.5 ? Math.PI : 0, end > 0.5 ? 0 : Math.PI, false)
      c.stroke()
      c.beginPath()
      c.arc(s / 2, s * end, s * 0.3, end > 0.5 ? Math.PI : 0, end > 0.5 ? 0 : Math.PI, false)
      c.stroke()
    }
  }) as THREE.CanvasTexture
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function makeWaterNormalTexture(): THREE.CanvasTexture {
  srand(55)
  const t = canvas(256, 256, (c, s) => {
    c.fillStyle = 'rgb(128,128,255)'
    c.fillRect(0, 0, s, s)
    for (let i = 0; i < 900; i++) {
      const x = rnd() * s
      const y = rnd() * s
      const r = 4 + rnd() * 14
      const g = c.createRadialGradient(x, y, 0, x, y, r)
      const nx = 128 + (rnd() * 70 - 35)
      const ny = 128 + (rnd() * 70 - 35)
      g.addColorStop(0, `rgba(${nx | 0},${ny | 0},255,0.5)`)
      g.addColorStop(1, 'rgba(128,128,255,0)')
      c.fillStyle = g
      c.fillRect(x - r, y - r, r * 2, r * 2)
    }
  }) as THREE.CanvasTexture
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.NoColorSpace
  return t
}

/** Route map graphic for the stela front (fallback). */
export function makeStelaTexture(): THREE.CanvasTexture {
  const t = canvas(256, 1024, (c, w, h) => {
    c.fillStyle = '#20242a'
    c.fillRect(0, 0, w, h)
    c.fillStyle = '#f2f4f1'
    c.font = 'bold 44px Inter, sans-serif'
    c.save()
    c.translate(70, h * 0.62)
    c.rotate(-Math.PI / 2)
    c.fillText('THE GREEN LINE', 0, 0)
    c.restore()
    // route line with zone stops
    c.strokeStyle = '#4CAF50'
    c.lineWidth = 6
    c.beginPath()
    c.moveTo(w * 0.62, h * 0.08)
    c.bezierCurveTo(w * 0.75, h * 0.3, w * 0.5, h * 0.5, w * 0.65, h * 0.72)
    c.stroke()
    c.fillStyle = '#dfe5df'
    for (let i = 0; i < 6; i++) {
      c.beginPath()
      c.arc(w * (0.62 + Math.sin(i * 1.4) * 0.08), h * (0.1 + i * 0.125), 8, 0, Math.PI * 2)
      c.fill()
    }
    c.fillStyle = '#9aa39c'
    c.font = '20px Inter, sans-serif'
    c.fillText('GREENLINE · 721 м', 20, h * 0.95)
  }) as THREE.CanvasTexture
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
