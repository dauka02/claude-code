#!/usr/bin/env node
/**
 * Downloads the Higgsfield-generated assets (textures + GLB hero models)
 * into public/assets/. Run `npm run fetch-assets` from greenline-tour/.
 *
 * The app works without these files (procedural fallbacks), but looks
 * best with them. URLs are also listed in docs/assets.md.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const IMG = 'https://d8j0ntlcm91z4.cloudfront.net/user_34oyBf1C2JQ9p77OPjDAeczkRHb'
const GLB = 'https://d3u0tzju9qaucj.cloudfront.net/7d051b5a-7bfe-49fe-a484-24e7b3a9458a'

const ASSETS = {
  'public/assets/textures/paving_fan.png': `${IMG}/hf_20260706_072903_312a3f70-ebc6-459e-ae39-a89673e99425.png`,
  'public/assets/textures/gravel.png': `${IMG}/hf_20260706_074642_3d3dac0a-9b2f-40c0-9578-70ccaaa28732.png`,
  'public/assets/textures/grass.png': `${IMG}/hf_20260706_072907_33e4cd44-3582-4a96-a01c-946a8bf234d7.png`,
  'public/assets/textures/stone_wall.png': `${IMG}/hf_20260706_072909_c1734519-e053-471f-b1f9-5c341fd57117.png`,
  'public/assets/textures/facade_light.png': `${IMG}/hf_20260706_072911_8999d69a-e172-49b3-ac90-f39ab2d25700.png`,
  'public/assets/textures/facade_brick.png': `${IMG}/hf_20260706_072913_723bb16c-b1c4-4f45-934b-16f12f04b6bc.png`,
  'public/assets/textures/facade_light_night.png': `${IMG}/hf_20260706_073549_5123263d-7300-4785-976c-9a2ba3835281.png`,
  'public/assets/textures/facade_brick_night.png': `${IMG}/hf_20260706_073550_cb08a397-7f8e-4124-9d14-e866bacfc58c.png`,
  'public/assets/textures/sky_day.png': `${IMG}/hf_20260706_072934_74407979-573e-48c2-a160-98743d8fd784.png`,
  'public/assets/textures/sky_night.png': `${IMG}/hf_20260706_072937_2705ddc0-eda0-446f-97de-698f79af4607.png`,
  'public/assets/models/kulan.glb': `${GLB}/12a9c05a-7f6b-4ff0-a6c0-2e3f73fe7b0e.glb`,
  'public/assets/models/stela.glb': `${GLB}/61d33dc4-c2d6-4772-8ccd-c7a4f373a9d0.glb`,
  'public/assets/models/bench_angular.glb': `${GLB}/19edf837-a468-4718-acf9-cbcc06a8fffb.glb`,
  'public/assets/models/lamp.glb': `${GLB}/0d891b38-bb5e-4f03-ab13-6b95344e4785.glb`,
  // ---- 2 очередь ----
  'public/assets/textures/rock_concrete.png': `${IMG}/hf_20260707_044353_64cf6a73-64eb-4c9b-830d-9e0345bdf287.png`,
  'public/assets/textures/tulips.png': `${IMG}/hf_20260707_044355_b4572bb3-c276-46ae-8b44-e1d0ee94580f.png`,
  'public/assets/models/pergola.glb': `${GLB}/195634dc-505e-4313-a93c-d5c8428bc245.glb`,
  'public/assets/models/tunnel_portal.glb': `${GLB}/529cdb08-1611-46eb-acf3-92b8d3eb728b.glb`,
  'public/assets/models/stela_greenline.glb': `${GLB}/c959a09a-2b1f-4665-b4e9-4d7a46267c81.glb`,
}

let ok = 0
let fail = 0
for (const [file, url] of Object.entries(ASSETS)) {
  const dest = join(root, file)
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, Buffer.from(await res.arrayBuffer()))
    ok++
    console.log(`✓ ${file}`)
  } catch (e) {
    fail++
    console.error(`✗ ${file}: ${e.message}`)
  }
}
console.log(`\n${ok} downloaded, ${fail} failed.`)
if (fail > 0) {
  console.log('The app still runs — procedural fallbacks cover missing files.')
  process.exitCode = 1
}
