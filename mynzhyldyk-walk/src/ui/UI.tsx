import { useEffect, useMemo, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { ALM, quarterEntry, QUARTER_INFO } from '../data/geo'
import { playerPos, teleport, useApp, type Quality } from '../store/useAppStore'

function StartScreen() {
  const start = useApp((s) => s.start)
  const { progress, active } = useProgress()
  return (
    <div className="overlay">
      <div className="start-card">
        <div className="brand">MYNZHYLDYK ALLEY</div>
        <h1>Аллея Мыңжылдық — интерактивная прогулка</h1>
        <p className="sub">
          Мастерплан LDA Design, Stage 1 · Астана · 6 км от Ишима до вокзала Nurly Zhol ·
          шесть кварталов: Capital, Millennium, Central Park, Hub, Station, Yesil Valley
        </p>
        <div className="help-box">
          <p>
            <b>WASD</b> — движение · <b>мышь</b> — обзор · <b>Shift</b> — бег · <b>F</b> — дрон/пешком ·
            дрон: <b>Q/E</b> — вниз/вверх, <b>колесо</b> — скорость · <b>Esc</b> — курсор, клик по земле — телепорт
          </p>
        </div>
        <button className="btn" onClick={start} disabled={active && progress < 60}>
          {active && progress < 60 ? `Загрузка ${progress.toFixed(0)}%` : 'Начать прогулку'}
        </button>
      </div>
    </div>
  )
}

function Hud() {
  const mode = useApp((s) => s.mode)
  const setMode = useApp((s) => s.setMode)
  const quality = useApp((s) => s.quality)
  const setQuality = useApp((s) => s.setQuality)
  const helpOpen = useApp((s) => s.helpOpen)
  const toggleHelp = useApp((s) => s.toggleHelp)
  return (
    <div className="hud">
      <div className="logo">Mynzhyldyk Alley</div>
      <div className="mode">
        {(['walk', 'drone', 'flyover'] as const).map((m) => (
          <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
            {m === 'walk' ? '🚶 Пешком' : m === 'drone' ? '🚁 Дрон' : '🎬 Облёт'}
          </button>
        ))}
        <select value={quality} onChange={(e) => setQuality(e.target.value as Quality)}>
          <option value="low">Low</option>
          <option value="med">Medium</option>
          <option value="high">High</option>
        </select>
        <button onClick={toggleHelp}>{helpOpen ? '✕' : '?'}</button>
      </div>
      {helpOpen && (
        <div className="help">
          WASD — движение · Shift — бег · F — дрон/пешком · дрон: Q/E вниз/вверх, колесо — скорость ·
          Esc — курсор: клик по земле = телепорт, клик по миникарте = квартал
        </div>
      )}
    </div>
  )
}

function QuarterTitle() {
  const quarter = useApp((s) => s.quarter)
  const shownAt = useApp((s) => s.quarterShownAt)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!quarter) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 3000)
    return () => clearTimeout(t)
  }, [quarter, shownAt])
  if (!visible || !quarter) return null
  const info = QUARTER_INFO[quarter]
  return (
    <div className="quarter-title">
      <div className="qt-ru">{info.ru}</div>
      <div className="qt-en">{info.en} — {info.tagline}</div>
    </div>
  )
}

function PoiPanel() {
  const poiId = useApp((s) => s.activePoi)
  const poi = ALM.pois.find((p) => p.id === poiId)
  if (!poi) return null
  return (
    <div className="poi-panel">
      <div className="poi-accent" />
      <h3>{poi.title}</h3>
      <p>{poi.ru}</p>
    </div>
  )
}

function MiniMap() {
  const quarter = useApp((s) => s.quarter)
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((v) => v + 1), 500)
    return () => clearInterval(t)
  }, [])
  const view = useMemo(() => {
    const xs = ALM.sitePoly.map((p) => p[0])
    const zs = ALM.sitePoly.map((p) => p[1])
    const minX = Math.min(...xs) - 50
    const maxX = Math.max(...xs) + 50
    const minZ = Math.min(...zs) - 50
    const maxZ = Math.max(...zs) + 50
    const W = 290
    const H = Math.round(((maxZ - minZ) / (maxX - minX)) * W)
    const mx = (x: number) => ((x - minX) / (maxX - minX)) * W
    const mz = (z: number) => ((z - minZ) / (maxZ - minZ)) * H
    const sitePath = ALM.sitePoly.map((p, i) => `${i ? 'L' : 'M'}${mx(p[0]).toFixed(1)} ${mz(p[1]).toFixed(1)}`).join('') + 'Z'
    const spinePath = ALM.spine.map((p, i) => `${i ? 'L' : 'M'}${mx(p[0]).toFixed(1)} ${mz(p[1]).toFixed(1)}`).join('')
    return { W, H, mx, mz, sitePath, spinePath }
  }, [])
  return (
    <svg
      className="minimap"
      viewBox={`0 0 ${view.W} ${view.H}`}
      width={view.W}
      onClick={(e) => {
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
        const fx = (e.clientX - rect.left) / rect.width
        // ближайший квартал по X
        const xs = ALM.sitePoly.map((p) => p[0])
        const minX = Math.min(...xs)
        const maxX = Math.max(...xs)
        const wx = minX + fx * (maxX - minX)
        let best = ALM.quarters[0]
        let bd = Infinity
        for (const q of ALM.quarters) {
          const [qx] = quarterEntry(q.id)
          const d = Math.abs(qx - wx)
          if (d < bd) {
            bd = d
            best = q
          }
        }
        const [tx, tz] = quarterEntry(best.id)
        teleport.to = [tx, tz]
      }}
    >
      <path d={view.sitePath} fill="rgba(46,74,42,0.55)" stroke="#cfd8c2" strokeWidth={1.2} />
      <path d={view.spinePath} fill="none" stroke="#e8e2ce" strokeWidth={2.4} strokeLinecap="round" />
      {ALM.quarters.map((q) => {
        const [x, z] = quarterEntry(q.id)
        return (
          <circle key={q.id} cx={view.mx(x)} cy={view.mz(z)} r={4} fill={q.id === quarter ? '#ffd27a' : '#9ec48a'} stroke="#243020" />
        )
      })}
      {ALM.pois.map((p) => (
        <circle key={p.id} cx={view.mx(p.x)} cy={view.mz(p.z)} r={1.8} fill="#ffe9b0" />
      ))}
      <circle cx={view.mx(playerPos.x)} cy={view.mz(playerPos.z)} r={4.5} fill="#fff" stroke="#e07830" strokeWidth={2} />
    </svg>
  )
}

export default function UI() {
  const started = useApp((s) => s.started)
  if (!started) return <StartScreen />
  return (
    <>
      <Hud />
      <QuarterTitle />
      <PoiPanel />
      <MiniMap />
    </>
  )
}
