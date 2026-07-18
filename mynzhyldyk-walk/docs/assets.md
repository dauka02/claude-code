# Higgsfield-ассеты (манифест)

Все уникальные ассеты сгенерированы через Higgsfield MCP специально для проекта
(изображения — nano banana; 3D — Meshy image-to-3D, PBR + texture). Скачивание —
`npm run fetch-assets` (локально) или автоматически на Vercel (`vercel.json`).
При недоступности CDN каждый ассет замещается процедурным фолбэком в
`src/scene/assets.ts` — приложение работает в любом случае.

Хосты: изображения `d8j0ntlcm91z4.cloudfront.net`, GLB `d3u0tzju9qaucj.cloudfront.net`.

## Изображения (job ID → файл)

| Файл | Job ID | Назначение |
|---|---|---|
| `sky/steppe_sky.png` | `d01b9ad4-253c-40af-ab04-2839c3256b8a` | Equirect-панорама степного неба (env + фон) |
| `textures/facade_brick.png` | `0a6bd47d-1ba6-4797-92ca-616d8cfa048f` | Фасадный атлас: кирпич, 4–6 эт. |
| `textures/facade_stone.png` | `b2b54eca-e230-441b-b931-77e0f333b1b3` | Фасадный атлас: камень/травертин |
| `textures/facade_white.png` | `7989d04b-fb13-41d1-b9a5-dc4fdfe24904` | Фасадный атлас: светлая штукатурка |
| `textures/facade_tower.png` | `c6b46931-28d1-4860-930f-c4bd007f5df4` | Фасадный атлас: стеклянная башня |
| `textures/granite.png` | `209f734f-54d8-4b01-aced-b524db8b5651` | Гранитное мощение площадей |
| `textures/diamond_paving.png` | `31d0f0eb-d9fd-404b-9c55-54ef3944a1b5` | Ромбовидное мощение Diamond Village |
| `textures/steppe.png` | `cbb3b1a0-31ef-424b-acd2-41374585c84c` | Степная трава (дальний ландшафт) |
| `textures/meadow.png` | `daf16550-103a-4bab-bdde-e3ffec3d4f4e` | Луговой газон (полоса аллеи) |
| `textures/tree_birch.png` | `8af518ff-c478-46a0-bbb0-c1ad0f7bc3d3` | Спрайт: берёза (белый фон → альфа) |
| `textures/tree_pine.png` | `181ec22c-2e75-4b1b-ac4d-ba0decdd4cfd` | Спрайт: сосна |
| `textures/tree_willow.png` | `c26fce03-d41f-45c3-b6ef-faad1f70e183` | Спрайт: ива (набережная Есиля) |
| `textures/tree_elm.png` | `89c2f6a3-bc7e-4085-922e-2c102e206f83` | Спрайт: вяз |
| `textures/tree_maple.png` | `11242e31-4df9-42a5-be4e-d0ac5f9eec4f` | Спрайт: клён |
| `textures/tree_apple.png` | `5ed51db3-a69c-4d43-954e-0288ea5525bc` | Спрайт: яблоня Сиверса |
| `textures/meadow_purple.png` | `d2715dec-43dc-4c89-b16d-ed92ff4eca61` | Куртина: шалфей + ковыль (луга аллеи) |
| `textures/meadow_pink.png` | `2bdae15f-8254-41ef-ad1d-5ec964870ff2` | Куртина: эхинацея + ромашки |
| `textures/meadow_grass.png` | `dd64bbd9-6284-471a-a0fd-ae217ed27cc0` | Куртина: мискантус (злаки) |
| `textures/tree_blossom.png` | `55d55e59-5577-4cc5-bb16-746a791ae5a8` | Спрайт: розовое цветущее дерево |

## 3D-модели (Meshy image-to-3D)

| Файл | 3D job ID | Изображение-источник | Где стоит |
|---|---|---|---|
| `models/pavilion.glb` | `c9f17ec6-bba7-415b-9437-d17cf0a92559` | `492bd3b9-9664-4eab-b2da-55200e77137c` | Павильон-кафе у Lake of Galaxy (Central Park) |
| `models/diamond_canopy.glb` | `5f6d0916-1a56-4709-9756-c622db742d03` | `dd034809-e268-45e1-aca6-48f27a6baa3c` | Ромбо-навес на площади Diamond Village (Hub) |
| `models/snow_leopard.glb` | `a5ec6b9e-cdce-4468-a6f9-c8585f90c038` | `9457a44f-4b71-4b0e-af04-d4a7d2abc961` | Снежный барс — игровая структура (Привокзальный парк) |

GLB rawUrl:

- pavilion: `…/7d051b5a-7bfe-49fe-a484-24e7b3a9458a/cb789d9a-a1ba-40a7-bcf6-4e2c83180ced.glb`
- canopy: `…/7d051b5a-7bfe-49fe-a484-24e7b3a9458a/e4f9ab56-7e2a-4767-a6ed-eca2cf4fd2a9.glb`
