# Higgsfield MCP — сгенерированные ассеты

Все ассеты сгенерированы через Higgsfield MCP (18 генераций: 10 текстур,
4 hero-изображения, 4 конвертации в GLB через `image_to_3d` / Meshy,
с текстурированием и PBR).

**Скачать всё одной командой:** `npm run fetch-assets` (кладёт файлы в
`public/assets/`). Без файлов приложение тоже работает — на процедурных
фолбэках; при появлении файлов сцена автоматически использует их.

> Замечание: из среды, где собирался проект, egress-политика не пропускала
> хосты CDN (`*.cloudfront.net`), поэтому бинарники не закоммичены в репо —
> выполните fetch-assets локально или добавьте хосты в allowlist окружения.

## Текстуры → `public/assets/textures/`

| Файл | Job ID | URL |
|---|---|---|
| paving_fan.png (веерная брусчатка, 2K) | `312a3f70` | https://d8j0ntlcm91z4.cloudfront.net/user_34oyBf1C2JQ9p77OPjDAeczkRHb/hf_20260706_072903_312a3f70-ebc6-459e-ae39-a89673e99425.png |
| gravel.png (гравий) | `3d3dac0a` | https://d8j0ntlcm91z4.cloudfront.net/user_34oyBf1C2JQ9p77OPjDAeczkRHb/hf_20260706_074642_3d3dac0a-9b2f-40c0-9578-70ccaaa28732.png |
| grass.png (газон) | `33e4cd44` | https://d8j0ntlcm91z4.cloudfront.net/user_34oyBf1C2JQ9p77OPjDAeczkRHb/hf_20260706_072907_33e4cd44-3582-4a96-a01c-946a8bf234d7.png |
| stone_wall.png (камень подпорных стен) | `c1734519` | https://d8j0ntlcm91z4.cloudfront.net/user_34oyBf1C2JQ9p77OPjDAeczkRHb/hf_20260706_072909_c1734519-e053-471f-b1f9-5c341fd57117.png |
| facade_light.png (белый/серый фасад, день) | `8999d69a` | https://d8j0ntlcm91z4.cloudfront.net/user_34oyBf1C2JQ9p77OPjDAeczkRHb/hf_20260706_072911_8999d69a-e172-49b3-ac90-f39ab2d25700.png |
| facade_brick.png (кирпичный фасад, день) | `723bb16c` | https://d8j0ntlcm91z4.cloudfront.net/user_34oyBf1C2JQ9p77OPjDAeczkRHb/hf_20260706_072913_723bb16c-b1c4-4f45-934b-16f12f04b6bc.png |
| facade_light_night.png (ночная emissive-версия) | `5123263d` | https://d8j0ntlcm91z4.cloudfront.net/user_34oyBf1C2JQ9p77OPjDAeczkRHb/hf_20260706_073549_5123263d-7300-4785-976c-9a2ba3835281.png |
| facade_brick_night.png (ночная emissive-версия) | `cb08a397` | https://d8j0ntlcm91z4.cloudfront.net/user_34oyBf1C2JQ9p77OPjDAeczkRHb/hf_20260706_073550_cb08a397-7f8e-4124-9d14-e866bacfc58c.png |
| sky_day.png (панорама неба, день, 2K) | `74407979` | https://d8j0ntlcm91z4.cloudfront.net/user_34oyBf1C2JQ9p77OPjDAeczkRHb/hf_20260706_072934_74407979-573e-48c2-a160-98743d8fd784.png |
| sky_night.png (панорама неба, ночь, 2K) | `2705ddc0` | https://d8j0ntlcm91z4.cloudfront.net/user_34oyBf1C2JQ9p77OPjDAeczkRHb/hf_20260706_072937_2705ddc0-eda0-446f-97de-698f79af4607.png |

## Hero-модели GLB → `public/assets/models/`

| Файл | 3D Job | URL |
|---|---|---|
| kulan.glb (скульптура-кулан ~6 м) | `1cb02bfa` | https://d3u0tzju9qaucj.cloudfront.net/7d051b5a-7bfe-49fe-a484-24e7b3a9458a/12a9c05a-7f6b-4ff0-a6c0-2e3f73fe7b0e.glb |
| stela.glb (стела THE GREEN LINE) | `f10cf5d1` | https://d3u0tzju9qaucj.cloudfront.net/7d051b5a-7bfe-49fe-a484-24e7b3a9458a/61d33dc4-c2d6-4772-8ccd-c7a4f373a9d0.glb |
| bench_angular.glb (угловая скамья) | `1d562cd8` | https://d3u0tzju9qaucj.cloudfront.net/7d051b5a-7bfe-49fe-a484-24e7b3a9458a/19edf837-a468-4718-acf9-cbcc06a8fffb.glb |
| lamp.glb (фонарь 8,5 м, 4 светильника) | `76d98e62` | https://d3u0tzju9qaucj.cloudfront.net/7d051b5a-7bfe-49fe-a484-24e7b3a9458a/0d891b38-bb5e-4f03-ab13-6b95344e4785.glb |

## Исходные hero-изображения (для конвертации в 3D)

| Объект | Job ID | URL |
|---|---|---|
| Кулан | `2808efd6` | https://d8j0ntlcm91z4.cloudfront.net/user_34oyBf1C2JQ9p77OPjDAeczkRHb/hf_20260706_072939_2808efd6-bb38-4286-8f2a-cfc67a099391.png |
| Стела | `3c7bf580` | https://d8j0ntlcm91z4.cloudfront.net/user_34oyBf1C2JQ9p77OPjDAeczkRHb/hf_20260706_072942_3c7bf580-6e41-4a74-9c56-8f8e1971d204.png |
| Скамья | `3787d8a2` | https://d8j0ntlcm91z4.cloudfront.net/user_34oyBf1C2JQ9p77OPjDAeczkRHb/hf_20260706_072944_3787d8a2-dbe7-4c57-886b-3e0cd9b8f154.png |
| Фонарь | `641d4ed6` | https://d8j0ntlcm91z4.cloudfront.net/user_34oyBf1C2JQ9p77OPjDAeczkRHb/hf_20260706_072946_641d4ed6-18ba-4a4b-a9f1-77af3be1cbac.png |
