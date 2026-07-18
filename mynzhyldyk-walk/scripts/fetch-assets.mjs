#!/usr/bin/env node
/**
 * Скачивает Higgsfield-ассеты в public/assets/. Локально: npm run fetch-assets.
 * На Vercel запускается автоматически перед сборкой (vercel.json).
 * Без файлов приложение работает на процедурных фолбэках.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const IMG = 'https://d8j0ntlcm91z4.cloudfront.net/user_34oyBf1C2JQ9p77OPjDAeczkRHb'
const GLB = 'https://d3u0tzju9qaucj.cloudfront.net/7d051b5a-7bfe-49fe-a484-24e7b3a9458a'

const ASSETS = {
  // дневное небо (v2 — согласовано с дневным светом сцены)
  'public/assets/sky/steppe_sky.png': `${IMG}/hf_20260718_143946_c849f785-2636-4a1d-b7d7-f8ab5dd0a3f9.png`,
  'public/assets/textures/facade_brick.png': `${IMG}/hf_20260711_100823_0a6bd47d-1ba6-4797-92ca-616d8cfa048f.png`,
  'public/assets/textures/facade_stone.png': `${IMG}/hf_20260711_100825_b2b54eca-e230-441b-b931-77e0f333b1b3.png`,
  'public/assets/textures/facade_white.png': `${IMG}/hf_20260711_100827_7989d04b-fb13-41d1-b9a5-dc4fdfe24904.png`,
  'public/assets/textures/facade_tower.png': `${IMG}/hf_20260711_100828_c6b46931-28d1-4860-930f-c4bd007f5df4.png`,
  'public/assets/textures/granite.png': `${IMG}/hf_20260711_100830_209f734f-54d8-4b01-aced-b524db8b5651.png`,
  'public/assets/textures/diamond_paving.png': `${IMG}/hf_20260711_100842_31d0f0eb-d9fd-404b-9c55-54ef3944a1b5.png`,
  'public/assets/textures/steppe.png': `${IMG}/hf_20260711_100844_cbb3b1a0-31ef-424b-acd2-41374585c84c.png`,
  'public/assets/textures/meadow.png': `${IMG}/hf_20260711_100846_daf16550-103a-4bab-bdde-e3ffec3d4f4e.png`,
  'public/assets/textures/tree_birch.png': `${IMG}/hf_20260711_100847_8af518ff-c478-46a0-bbb0-c1ad0f7bc3d3.png`,
  'public/assets/textures/tree_pine.png': `${IMG}/hf_20260711_100848_181ec22c-2e75-4b1b-ac4d-ba0decdd4cfd.png`,
  'public/assets/textures/tree_willow.png': `${IMG}/hf_20260711_100849_c26fce03-d41f-45c3-b6ef-faad1f70e183.png`,
  'public/assets/textures/tree_elm.png': `${IMG}/hf_20260711_100900_89c2f6a3-bc7e-4085-922e-2c102e206f83.png`,
  'public/assets/textures/tree_maple.png': `${IMG}/hf_20260711_100900_11242e31-4df9-42a5-be4e-d0ac5f9eec4f.png`,
  'public/assets/textures/tree_apple.png': `${IMG}/hf_20260711_100901_5ed51db3-a69c-4d43-954e-0288ea5525bc.png`,
  'public/assets/textures/diagrid.png': `${IMG}/hf_20260718_205714_dc39af49-6937-48a4-b048-8b1ae81b0f36.png`,
  // v2 (детализация по русской презентации): луга, цветущее дерево
  'public/assets/textures/meadow_purple.png': `${IMG}/hf_20260718_140956_d2715dec-43dc-4c89-b16d-ed92ff4eca61.png`,
  'public/assets/textures/meadow_pink.png': `${IMG}/hf_20260718_141002_2bdae15f-8254-41ef-ad1d-5ec964870ff2.png`,
  'public/assets/textures/meadow_grass.png': `${IMG}/hf_20260718_141010_dd64bbd9-6284-471a-a0fd-ae217ed27cc0.png`,
  'public/assets/textures/tree_blossom.png': `${IMG}/hf_20260718_141014_55d55e59-5577-4cc5-bb16-746a791ae5a8.png`,
  // GLB МАФы (Meshy image_to_3d): павильон-кафе, ромбо-навес, снежный барс; при 404 — фолбэки.
  'public/assets/models/pavilion.glb': `${GLB}/cb789d9a-a1ba-40a7-bcf6-4e2c83180ced.glb`,
  'public/assets/models/diamond_canopy.glb': `${GLB}/e4f9ab56-7e2a-4767-a6ed-eca2cf4fd2a9.glb`,
  'public/assets/models/snow_leopard.glb': `${GLB}/cc4c3078-c0a8-4e25-9f55-7aac8bc2bb59.glb`,
  // якоря (пл. Казак Ели): Самрук, мечеть Хазрет Султан, юрта Этноаула
  'public/assets/models/samruk.glb': `${GLB}/ded5fd5c-d186-4a94-88c3-226182e28564.glb`,
  'public/assets/models/mosque.glb': `${GLB}/d86947f1-8e00-4b68-8ef4-49315315425c.glb`,
  'public/assets/models/yurt.glb': `${GLB}/a070cf28-afd5-4cda-85f4-5647572178a1.glb`,
}

let ok = 0
let fail = 0
for (const [file, url] of Object.entries(ASSETS)) {
  if (url.includes('PLACEHOLDER')) continue
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
console.log(`\n${ok} downloaded, ${fail} failed (фолбэки покрывают отсутствующие).`)
