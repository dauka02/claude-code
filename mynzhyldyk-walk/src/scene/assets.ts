import * as THREE from 'three'
import { useEffect, useMemo, useState } from 'react'

/**
 * Ассеты Higgsfield (public/assets/...) с процедурными фолбэками —
 * приложение полноценно работает без файлов, подхватывает их при наличии
 * (fetch-assets локально или автоматически на Vercel-сборке).
 */
export const TEX = {
  sky: '/assets/sky/steppe_sky.png',
  facadeBrick: '/assets/textures/facade_brick.png',
  facadeStone: '/assets/textures/facade_stone.png',
  facadeWhite: '/assets/textures/facade_white.png',
  facadeTower: '/assets/textures/facade_tower.png',
  granite: '/assets/textures/granite.png',
  diamond: '/assets/textures/diamond_paving.png',
  steppe: '/assets/textures/steppe.png',
  meadow: '/assets/textures/meadow.png',
  tree0: '/assets/textures/tree_birch.png',
  tree1: '/assets/textures/tree_pine.png',
  tree2: '/assets/textures/tree_elm.png',
  tree3: '/assets/textures/tree_willow.png',
  tree4: '/assets/textures/tree_maple.png',
  tree5: '/assets/textures/tree_apple.png',
  tree6: '/assets/textures/tree_blossom.png',
  diagrid: '/assets/textures/diagrid.png',
  meadow0: '/assets/textures/meadow_purple.png',
  meadow1: '/assets/textures/meadow_pink.png',
  meadow2: '/assets/textures/meadow_grass.png',
} as const

const loader = new THREE.TextureLoader()
const cache = new Map<string, THREE.Texture | 'failed' | Promise<THREE.Texture | null>>()

function conf(t: THREE.Texture, srgb: boolean, repeat = true) {
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = 4
  return t
}

/** Белый фон → альфа (для спрайтов деревьев, сгенерированных на белом). */
function keyWhiteToAlpha(img: HTMLImageElement): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = img.width
  cv.height = img.height
  const c = cv.getContext('2d')!
  c.drawImage(img, 0, 0)
  const d = c.getImageData(0, 0, cv.width, cv.height)
  const px = d.data
  for (let i = 0; i < px.length; i += 4) {
    const mn = Math.min(px[i], px[i + 1], px[i + 2])
    if (mn > 232) px[i + 3] = 0
    else if (mn > 205) px[i + 3] = Math.round(((232 - mn) / 27) * 255)
  }
  c.putImageData(d, 0, 0)
  const t = new THREE.CanvasTexture(cv)
  return t
}

export function useTexOr(
  name: keyof typeof TEX,
  make: () => THREE.Texture,
  repeat: [number, number] = [1, 1],
  srgb = true,
  keyWhite = false,
): THREE.Texture {
  const fallback = useMemo(() => conf(make(), srgb), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [file, setFile] = useState<THREE.Texture | null>(() => {
    const c = cache.get(TEX[name])
    return c instanceof THREE.Texture ? c : null
  })
  useEffect(() => {
    const url = TEX[name]
    const c = cache.get(url)
    if (c instanceof THREE.Texture) return setFile(c)
    if (c === 'failed') return
    const p =
      (c as Promise<THREE.Texture | null>) ??
      new Promise<THREE.Texture | null>((res) => {
        if (keyWhite) {
          const img = new Image()
          img.onload = () => {
            const t = conf(keyWhiteToAlpha(img), srgb)
            cache.set(url, t)
            res(t)
          }
          img.onerror = () => {
            cache.set(url, 'failed')
            res(null)
          }
          img.src = url
        } else {
          loader.load(
            url,
            (t) => {
              conf(t, srgb)
              cache.set(url, t)
              res(t)
            },
            undefined,
            () => {
              cache.set(url, 'failed')
              res(null)
            },
          )
        }
      })
    if (!c) cache.set(url, p)
    p.then((t) => t && setFile(t))
  }, [name, srgb, keyWhite])
  const active = file ?? fallback
  active.repeat.set(repeat[0], repeat[1])
  return active
}

/* ------------------ процедурные фолбэки ------------------ */

function canvas(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  draw(cv.getContext('2d')!)
  return new THREE.CanvasTexture(cv)
}
let seed = 7
function srand(s: number) {
  seed = s
}
function rnd() {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

export const fbSky = () =>
  canvas(1024, 512, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 512)
    g.addColorStop(0, '#4a7ec4')
    g.addColorStop(0.42, '#8fb4dc')
    g.addColorStop(0.52, '#e8d9b8')
    g.addColorStop(0.6, '#f2e2c2')
    g.addColorStop(1, '#c9c2ae')
    c.fillStyle = g
    c.fillRect(0, 0, 1024, 512)
    srand(5)
    for (let i = 0; i < 30; i++) {
      const y = 60 + rnd() * 160
      const x = rnd() * 1024
      const r = 60 + rnd() * 160
      const gr = c.createRadialGradient(x, y, 0, x, y, r)
      gr.addColorStop(0, 'rgba(255,252,245,0.5)')
      gr.addColorStop(1, 'rgba(255,252,245,0)')
      c.fillStyle = gr
      c.save()
      c.translate(x, y)
      c.scale(2.6, 0.35)
      c.beginPath()
      c.arc(0, 0, r, 0, Math.PI * 2)
      c.fill()
      c.restore()
    }
  })

function fbFacade(base: string, win: string, ribbon = false) {
  return () =>
    canvas(256, 384, (c) => {
      srand(base.length * 7 + 13)
      c.fillStyle = base
      c.fillRect(0, 0, 256, 384)
      if (ribbon) {
        for (let r = 0; r < 6; r++) {
          c.fillStyle = win
          c.fillRect(0, 26 + r * 62, 256, 30)
          c.fillStyle = 'rgba(30,32,36,0.5)'
          for (let q = 0; q < 8; q++) c.fillRect(q * 32, 26 + r * 62, 2, 30)
        }
      } else {
        for (let r = 0; r < 6; r++)
          for (let q = 0; q < 4; q++) {
            const v = 0.85 + rnd() * 0.3
            c.fillStyle = win
            c.globalAlpha = v
            c.fillRect(14 + q * 62, 20 + r * 62, 36, 40)
            c.globalAlpha = 1
            c.strokeStyle = 'rgba(40,42,46,0.8)'
            c.lineWidth = 2
            c.strokeRect(14 + q * 62, 20 + r * 62, 36, 40)
          }
      }
      // первый этаж — витрины
      c.fillStyle = 'rgba(70,88,100,0.9)'
      c.fillRect(0, 384 - 46, 256, 42)
      c.strokeStyle = 'rgba(230,228,220,0.9)'
      for (let q = 0; q < 4; q++) c.strokeRect(8 + q * 62, 384 - 44, 50, 38)
    })
}
export const fbFacadeBrick = fbFacade('#b98d6e', '#a8c4d4')
export const fbFacadeStone = fbFacade('#cfc2a8', '#9db4c4')
export const fbFacadeWhite = fbFacade('#e8e6e0', '#8aa8bc', true)
export const fbFacadeTower = () =>
  canvas(256, 384, (c) => {
    c.fillStyle = '#3a3f46'
    c.fillRect(0, 0, 256, 384)
    for (let r = 0; r < 12; r++) {
      c.fillStyle = r % 2 ? '#5a7285' : '#4a5a68'
      c.fillRect(0, r * 32, 256, 26)
    }
    c.fillStyle = 'rgba(30,32,34,0.8)'
    for (let q = 0; q < 10; q++) c.fillRect(q * 26, 0, 3, 384)
  })

export const fbGranite = () =>
  canvas(512, 512, (c) => {
    srand(21)
    c.fillStyle = '#b5b0a5'
    c.fillRect(0, 0, 512, 512)
    for (let r = 0; r < 4; r++)
      for (let q = 0; q < 4; q++) {
        const v = 0.9 + rnd() * 0.18
        c.fillStyle = `rgb(${(182 * v) | 0},${(176 * v) | 0},${(165 * v) | 0})`
        c.fillRect(q * 128 + 2, r * 128 + 2, 124, 124)
      }
  })

export const fbDiamond = () =>
  canvas(512, 512, (c) => {
    c.fillStyle = '#cfc0a2'
    c.fillRect(0, 0, 512, 512)
    c.fillStyle = '#4a4440'
    const s = 64
    for (let y = -1; y < 9; y++)
      for (let x = -1; x < 9; x++) {
        if ((x + y) % 2) continue
        c.beginPath()
        c.moveTo(x * s + s / 2, y * s)
        c.lineTo(x * s + s, y * s + s / 2)
        c.lineTo(x * s + s / 2, y * s + s)
        c.lineTo(x * s, y * s + s / 2)
        c.closePath()
        c.fill()
      }
  })

export const fbSteppe = () =>
  canvas(512, 512, (c) => {
    srand(31)
    c.fillStyle = '#a89562'
    c.fillRect(0, 0, 512, 512)
    for (let i = 0; i < 9000; i++) {
      const v = rnd()
      c.fillStyle = v < 0.4 ? 'rgba(140,130,80,0.6)' : v < 0.75 ? 'rgba(120,124,70,0.5)' : 'rgba(90,105,60,0.5)'
      c.fillRect(rnd() * 512, rnd() * 512, 2, 3 + rnd() * 3)
    }
  })

export const fbMeadow = () =>
  canvas(512, 512, (c) => {
    srand(41)
    c.fillStyle = '#5f7c3e'
    c.fillRect(0, 0, 512, 512)
    for (let i = 0; i < 9000; i++) {
      const v = rnd()
      c.fillStyle = v < 0.5 ? 'rgba(88,120,58,0.55)' : v < 0.9 ? 'rgba(110,140,72,0.5)' : 'rgba(230,225,200,0.7)'
      c.fillRect(rnd() * 512, rnd() * 512, 2, 2)
    }
  })

/** Процедурный силуэт дерева (fallback спрайта): вид, оттенок. */
export function fbTree(species: number) {
  const palette: [string, string, number, number][] = [
    ['#e8e4dc', '#7fa055', 0.32, 0.62], // берёза: белый ствол, светлая крона
    ['#a06a42', '#3d5a38', 0.42, 0.5], // сосна: голый ствол, тёмная крона сверху
    ['#5a4a38', '#4a6e35', 0.3, 0.68], // вяз: плотная круглая
    ['#6b5a44', '#8fa876', 0.3, 0.72], // ива: плакучая
    ['#5f4f3c', '#5d8040', 0.3, 0.66], // клён
    ['#6b5a48', '#e8dce4', 0.35, 0.5], // яблоня в цвету
    ['#6b5648', '#e8a4c4', 0.32, 0.6], // цветущая розовая (сакура/яблоня Недзвецкого)
  ]
  const [trunkC, crownC, trunkH, crownS] = palette[species]
  return () => {
    const t = canvas(256, 384, (c) => {
      c.clearRect(0, 0, 256, 384)
      srand(60 + species * 17)
      // ствол
      c.fillStyle = trunkC
      c.beginPath()
      c.moveTo(120, 384)
      c.lineTo(126, 384 * (1 - trunkH) )
      c.lineTo(132, 384 * (1 - trunkH))
      c.lineTo(140, 384)
      c.closePath()
      c.fill()
      if (species === 0) {
        c.fillStyle = '#2a2826'
        for (let i = 0; i < 8; i++) c.fillRect(120 + rnd() * 14, 384 * 0.55 + rnd() * 384 * 0.4, 8, 3)
      }
      // крона — облако кругов
      const cy = species === 1 ? 120 : 150
      const n = species === 3 ? 26 : 18
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2
        const rr = rnd() * 88 * crownS
        let x = 128 + Math.cos(a) * rr * 1.15
        let y = cy + Math.sin(a) * rr * (species === 1 ? 1.25 : 0.95)
        if (species === 3 && rnd() < 0.5) y += 60 + rnd() * 90 // плакучие пряди
        const r = 20 + rnd() * 26
        const g = c.createRadialGradient(x, y, r * 0.2, x, y, r)
        g.addColorStop(0, crownC)
        g.addColorStop(1, shade(crownC, 0.75))
        c.fillStyle = g
        c.beginPath()
        c.arc(x, y, r, 0, Math.PI * 2)
        c.fill()
      }
    })
    return t
  }
}
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) * k
  const g = ((n >> 8) & 255) * k
  const b = (n & 255) * k
  return `rgb(${r | 0},${g | 0},${b | 0})`
}

/** Куртина луговых многолетников (fallback спрайта): 0 шалфей, 1 эхинацея+ромашки, 2 злаки. */
export function fbMeadowClump(variant: number) {
  return () => {
    const t = canvas(256, 256, (c) => {
      c.clearRect(0, 0, 256, 256)
      srand(140 + variant * 29)
      // стебли
      for (let i = 0; i < 26; i++) {
        const x = 24 + rnd() * 208
        c.strokeStyle = `rgba(${70 + rnd() * 40},${105 + rnd() * 40},${50 + rnd() * 25},0.95)`
        c.lineWidth = 2 + rnd() * 1.6
        c.beginPath()
        c.moveTo(x, 256)
        c.quadraticCurveTo(x + rnd() * 22 - 11, 170, x + rnd() * 34 - 17, 70 + rnd() * 70)
        c.stroke()
      }
      if (variant === 0) {
        // свечи шалфея
        for (let i = 0; i < 20; i++) {
          const x = 30 + rnd() * 196
          const y = 60 + rnd() * 90
          const h = 34 + rnd() * 40
          for (let s = 0; s < h; s += 4) {
            c.fillStyle = `rgba(${104 + rnd() * 40},${66 + rnd() * 30},${168 + rnd() * 50},0.96)`
            c.beginPath()
            c.arc(x + rnd() * 5 - 2.5, y + s, 3.2 + rnd() * 1.6, 0, 6.28)
            c.fill()
          }
        }
      } else if (variant === 1) {
        // эхинацея + ромашки
        for (let i = 0; i < 18; i++) {
          const x = 28 + rnd() * 200
          const y = 66 + rnd() * 96
          const r = 8 + rnd() * 6
          const pink = rnd() < 0.62
          c.fillStyle = pink ? `rgba(${212 + rnd() * 30},${118 + rnd() * 30},${158 + rnd() * 30},0.97)` : 'rgba(245,242,232,0.97)'
          for (let p = 0; p < 8; p++) {
            const a = (p / 8) * 6.28 + rnd()
            c.beginPath()
            c.ellipse(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, r * 0.62, r * 0.3, a, 0, 6.28)
            c.fill()
          }
          c.fillStyle = pink ? '#a3541e' : '#d8a020'
          c.beginPath()
          c.arc(x, y, r * 0.38, 0, 6.28)
          c.fill()
        }
      } else {
        // злаки-мискантус с метёлками
        for (let i = 0; i < 30; i++) {
          const x = 26 + rnd() * 204
          c.strokeStyle = `rgba(${168 + rnd() * 50},${146 + rnd() * 40},${86 + rnd() * 30},0.9)`
          c.lineWidth = 2
          c.beginPath()
          c.moveTo(x, 256)
          const tx = x + rnd() * 44 - 22
          const ty = 46 + rnd() * 60
          c.quadraticCurveTo(x + rnd() * 20 - 10, 150, tx, ty)
          c.stroke()
          c.fillStyle = `rgba(${218 + rnd() * 30},${198 + rnd() * 30},${150 + rnd() * 30},0.85)`
          for (let s = 0; s < 7; s++) {
            c.beginPath()
            c.ellipse(tx + rnd() * 8 - 4, ty + s * 4, 3.4, 1.8, rnd(), 0, 6.28)
            c.fill()
          }
        }
      }
    })
    return t
  }
}

export const mkAsphalt = (tone = '#54565a') =>
  conf(
    canvas(256, 256, (c) => {
      srand(51)
      c.fillStyle = tone
      c.fillRect(0, 0, 256, 256)
      for (let i = 0; i < 2200; i++) {
        c.fillStyle = `rgba(${120 + rnd() * 60},${120 + rnd() * 60},${120 + rnd() * 60},0.12)`
        c.fillRect(rnd() * 256, rnd() * 256, 2, 2)
      }
    }),
    true,
  )

export const mkConcretePath = () =>
  conf(
    canvas(256, 256, (c) => {
      srand(61)
      c.fillStyle = '#c9c4b8'
      c.fillRect(0, 0, 256, 256)
      for (let i = 0; i < 1600; i++) {
        c.fillStyle = `rgba(150,145,132,${0.1 + rnd() * 0.15})`
        c.fillRect(rnd() * 256, rnd() * 256, 2, 2)
      }
      c.strokeStyle = 'rgba(120,116,105,0.5)'
      c.lineWidth = 2
      for (let i = 0; i < 4; i++) {
        c.beginPath()
        c.moveTo(0, i * 64 + 32)
        c.lineTo(256, i * 64 + 32)
        c.stroke()
      }
    }),
    true,
  )

export const mkRedBike = () =>
  conf(
    canvas(128, 128, (c) => {
      srand(71)
      c.fillStyle = '#9e3f2e'
      c.fillRect(0, 0, 128, 128)
      for (let i = 0; i < 700; i++) {
        c.fillStyle = `rgba(60,25,15,${0.1 + rnd() * 0.2})`
        c.fillRect(rnd() * 128, rnd() * 128, 1.5, 1.5)
      }
    }),
    true,
  )

export const mkWood = () =>
  conf(
    canvas(256, 256, (c) => {
      srand(81)
      c.fillStyle = '#a58054'
      c.fillRect(0, 0, 256, 256)
      for (let p = 0; p < 6; p++) {
        const v = 0.85 + rnd() * 0.3
        c.fillStyle = `rgb(${(165 * v) | 0},${(128 * v) | 0},${(84 * v) | 0})`
        c.fillRect(0, p * 43, 256, 40)
      }
    }),
    true,
  )

export const mkWaterNormal = () => {
  const t = canvas(256, 256, (c) => {
    srand(91)
    c.fillStyle = 'rgb(128,128,255)'
    c.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 800; i++) {
      const x = rnd() * 256
      const y = rnd() * 256
      const r = 5 + rnd() * 16
      const g = c.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, `rgba(${128 + (rnd() * 64 - 32) | 0},${128 + (rnd() * 64 - 32) | 0},255,0.5)`)
      g.addColorStop(1, 'rgba(128,128,255,0)')
      c.fillStyle = g
      c.fillRect(x - r, y - r, r * 2, r * 2)
    }
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.NoColorSpace
  return t
}

/** Силуэт человека (билборд). */
export const mkPeople = () =>
  conf(
    canvas(64, 192, (c) => {
      c.clearRect(0, 0, 64, 192)
      c.fillStyle = '#43505c'
      c.beginPath()
      c.arc(32, 26, 11, 0, Math.PI * 2)
      c.fill()
      c.fillRect(20, 40, 24, 74)
      c.fillRect(22, 114, 8, 66)
      c.fillRect(34, 114, 8, 66)
      c.fillRect(12, 44, 8, 56)
      c.fillRect(44, 44, 8, 56)
    }),
    true,
  )
