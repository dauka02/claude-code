# Mynzhyldyk Alley — Interactive Walk

Браузерная интерактивная 3D-прогулка по мастерплану **Аллеи Мыңжылдық** (Астана,
LDA Design «Concept Landscape Masterplan, Stage 1», Dec 2023). ~6 км от излучины
Ишима до вокзала Nurly Zhol, шесть кварталов, LRT-эстакада вдоль оси, озёра
Lake of Galaxy и Mynzhyldyk Lake, SuDS-каналы, амфитеатр, Diamond Village.

**Стек:** Vite · React · TypeScript · Three.js (@react-three/fiber, drei,
postprocessing) · zustand. Уникальные текстуры и МАФы — **Higgsfield MCP**
(skybox степного неба, 4 фасадных атласа, гранит/ромбовидное мощение, степь,
луг, 6 спрайтов деревьев, павильон-кафе и ромбо-навес в GLB).

## Запуск

```bash
npm install
npm run fetch-assets   # скачать Higgsfield-ассеты (опционально; есть фолбэки)
npm run dev            # http://localhost:5173
npm run build          # прод-сборка в dist/
```

Пайплайн данных (повторяемый, seed-детерминированный):

```bash
npm run trace-plan     # tools/plan_points.json → src/data/alm.json (планировка)
npm run gen-trees      # alm.json → src/data/trees.json (19 200 деревьев)
```

## Управление

| Действие | Клавиши |
|---|---|
| Движение / бег | **WASD** / **Shift** (1.5 → 4.5 м/с) |
| Обзор | мышь (PointerLock) |
| Пешком ⇄ Дрон | **F** или кнопки HUD |
| Дрон: вниз/вверх · скорость | **Q/E** (или Space/C) · колесо мыши (10–60 м/с) |
| Облёт (кинематографичный, ~90 с) | кнопка «Облёт»; любой ввод прерывает |
| Телепорт | **Esc** → клик по земле; клик по миникарте → квартал |

Титры кварталов появляются при входе; POI-панели — при приближении к маякам
(10 точек: Independence Square, набережная, амфитеатр у Lake of Galaxy,
SuDS-сад, Diamond Village, LRT, Station Plaza, Mynzhyldyk Lake, Yesil…).

## Геометрия из мастерплана

`reference/` — отрендеренные страницы отчёта (см. корневой `reference/alm/`).
Ключевые страницы (3.2 Masterplan, 4.4 Streetscape, 5.1 Overview) оцифрованы
по координатной сетке в `tools/plan_points.json` (масштаб калиброван линейкой
0–500 м, ось повёрнута на 15°); `tools/trace_plan.ts` пересчитывает в мировые
метры → `src/data/alm.json`: спайн аллеи, границы шести кварталов, дороги
(City/Boulevard/District), LRT со станциями, река, озёра, SuDS, landform-холмы,
30 объектов мастерплана, POI. Рендер читает только эти данные.

## Производительность

- Вся растительность (19 200 деревьев, трава), фонари, машины, люди — instancing;
  статика слита по материалам. Деревья — crossed-plane спрайты с ветром в
  вершинном шейдере; белый фон генераций выбивается в альфу на клиенте.
- Пресеты Low/Med/High: dpr 0.75/1.25/1.5, тени off/1k/2k, плотность деревьев
  1/2 шага/полная, постпроцессинг off/on/on+MSAA.
- Тени — одна карта у камеры (follow), объекты дальше ~250 м не отбрасывают.
- Дымка 400→2600 м скрывает край мира; ACES-тонмаппинг, тёплое солнце ~35°.
- `?debug=1` — r3f-perf оверлей (FPS/draw calls/треугольники).

## Деплой на Vercel

Import → Root Directory **`mynzhyldyk-walk`** → Deploy. `vercel.json` перед
сборкой сам скачивает Higgsfield-ассеты (при недоступности CDN соберётся на
процедурных фолбэках).
