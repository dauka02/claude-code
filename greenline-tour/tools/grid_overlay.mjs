#!/usr/bin/env node
/**
 * Crop a region from a plan PNG and burn a coordinate grid into it,
 * so control points can be read off visually while digitizing.
 * Thin lines every 50 px, thick every 250 px (source pixels).
 *
 * usage: node tools/grid_overlay.mjs <in.png> <out.png> [x y w h] [scale]
 */
import fs from 'node:fs'
import { PNG } from 'pngjs'

const [inFile, outFile, xs, ys, ws, hs, ss] = process.argv.slice(2)
const src = PNG.sync.read(fs.readFileSync(inFile))
const x0 = xs ? parseInt(xs) : 0
const y0 = ys ? parseInt(ys) : 0
const w = ws ? parseInt(ws) : src.width - x0
const h = hs ? parseInt(hs) : src.height - y0
const scale = ss ? parseFloat(ss) : 1

const ow = Math.floor(w * scale)
const oh = Math.floor(h * scale)
const out = new PNG({ width: ow, height: oh })

for (let oy = 0; oy < oh; oy++) {
  for (let ox = 0; ox < ow; ox++) {
    const sx = x0 + Math.floor(ox / scale)
    const sy = y0 + Math.floor(oy / scale)
    const si = (sy * src.width + sx) * 4
    const oi = (oy * ow + ox) * 4
    // grid in SOURCE coordinates so readings are absolute
    const gx = sx % 50 === 0 || (sx + 1) % 50 === 0
    const gy = sy % 50 === 0 || (sy + 1) % 50 === 0
    const thick = sx % 250 <= 1 || sy % 250 <= 1
    const major = sx % 500 <= 1 || sy % 500 <= 1
    if (major && (gx || gy)) {
      out.data[oi] = 255
      out.data[oi + 1] = 0
      out.data[oi + 2] = 200
      out.data[oi + 3] = 255
    } else if (thick && (gx || gy)) {
      out.data[oi] = 255
      out.data[oi + 1] = 80
      out.data[oi + 2] = 0
      out.data[oi + 3] = 255
    } else if (gx || gy) {
      out.data[oi] = Math.min(255, src.data[si] * 0.55 + 90)
      out.data[oi + 1] = src.data[si + 1] * 0.55
      out.data[oi + 2] = src.data[si + 2] * 0.55
      out.data[oi + 3] = 255
    } else {
      out.data[oi] = src.data[si]
      out.data[oi + 1] = src.data[si + 1]
      out.data[oi + 2] = src.data[si + 2]
      out.data[oi + 3] = 255
    }
  }
}
fs.writeFileSync(outFile, PNG.sync.write(out))
console.log(`${outFile}: crop(${x0},${y0},${w},${h}) scale ${scale} -> ${ow}x${oh}`)
