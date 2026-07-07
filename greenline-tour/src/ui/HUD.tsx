import { useEffect, useMemo, useState } from 'react'
import { SEGMENTS, bandAt, type SegId } from '../data/geometry'
import { isTouch, useTour } from '../store'
import { pointsFor } from './InfoPoints'
import ru from './ru.json'

function StartScreen() {
  const start = useTour((s) => s.start)
  const [stage, setStage] = useState<SegId>('s1')
  return (
    <div className="overlay start">
      <div className="start-card">
        <div className="brand">GREEN LINE</div>
        <h1>{ru.title}</h1>
        <p className="sub">
          Линейный парк 60 м шириной · Астана · геометрия из генплана: дождевые сады, пруды,
          фонтаны, водопады, тоннели и каскады
        </p>
        <div className="stage-select">
          <button className={stage === 's1' ? 'active' : ''} onClick={() => setStage('s1')}>
            <b>{ru.stage1Label}</b>
            <span>Култегін → Анет баба + рукав Айтеке би</span>
          </button>
          <button className={stage === 's2b' ? 'active' : ''} onClick={() => setStage('s2b')}>
            <b>{ru.stage2Label}</b>
            <span>Фонтаны, водопады, каскады · вход Толе би</span>
          </button>
        </div>
        <div className="controls-help">
          {isTouch ? (
            <p>Джойстик слева — движение · свайп справа — обзор</p>
          ) : (
            <p>
              <b>WASD</b> — движение · <b>мышь</b> — обзор · <b>Shift</b> — бег · <b>F</b> — полёт ·{' '}
              <b>N</b> — день/ночь · <b>Esc</b> — пауза
            </p>
          )}
          <p className="hint">
            Зелёные маяки раскрывают данные проекта · зелёные порталы на концах бульвара ведут между
            этапами
          </p>
        </div>
        <button className="btn-start" onClick={() => start(stage)}>
          {ru.start}
        </button>
      </div>
    </div>
  )
}

function InfoCard() {
  const activeId = useTour((s) => s.activePoint)
  const stage = useTour((s) => s.stage)
  const point = useMemo(() => pointsFor(stage).find((p) => p.id === activeId), [stage, activeId])
  if (!point) return null
  return (
    <div className="info-card">
      <div className="info-accent" />
      <h2>{point.title}</h2>
      <ul>
        {point.lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  )
}

/** Миникарта: реальная геометрия сегмента из JSON (променад, вело, пруды). */
function Minimap() {
  const stage = useTour((s) => s.stage)
  const meters = useTour((s) => s.meters)
  const onBranch = useTour((s) => s.onBranch)
  const seg = SEGMENTS[stage]
  const view = useMemo(() => {
    const W = 560
    const H = onlyBranchExtra(stage) ? 74 : 56
    const pad = 6
    const minX = -10
    const maxX = seg.lengthM + 10
    const minZ = -seg.halfW - 4
    const maxZ = seg.branch ? 80 : seg.halfW + 4
    const sx = (W - pad * 2) / (maxX - minX)
    const sz = (H - pad * 2) / (maxZ - minZ)
    const map = (x: number, z: number) => [pad + (x - minX) * sx, pad + (z - minZ) * sz] as [number, number]
    const pathD = (pts: { x: number; z: number }[], every = 3) => {
      let d = ''
      for (let i = 0; i < pts.length; i += every) {
        const [px, pz] = map(pts[i].x, pts[i].z)
        d += (i === 0 ? 'M' : 'L') + px.toFixed(1) + ' ' + pz.toFixed(1)
      }
      return d
    }
    return { W, H, map, pathD }
  }, [seg, stage])

  const playerXY = useMemo(() => {
    // позиция вдоль променада → точка на карте
    const idx = Math.round((meters / (onBranch && seg.branch ? seg.branch.length : seg.lengthM)) * ((onBranch && seg.branch ? seg.branch : seg.promenade).pts.length - 1))
    const arr = (onBranch && seg.branch ? seg.branch : seg.promenade).pts
    const p = arr[Math.max(0, Math.min(arr.length - 1, idx))]
    return view.map(p.x, p.z)
  }, [meters, onBranch, seg, view])

  return (
    <svg className="minimap" viewBox={`0 0 ${view.W} ${view.H}`} width="100%">
      <rect x={0} y={0} width={view.W} height={view.H} rx={8} fill="rgba(14,20,18,0.55)" />
      {seg.paths.map((p) => (
        <path
          key={p.id}
          d={view.pathD(p.pts)}
          fill="none"
          stroke={p.kind === 'bike' ? '#c04a30' : p.kind === 'run' ? '#d78145' : '#e8e5dc'}
          strokeWidth={p.kind === 'promenade' || p.kind === 'branch' ? 3 : 1.4}
          strokeLinecap="round"
          opacity={0.9}
        />
      ))}
      {seg.ponds.map((p, i) => {
        const [cx, cz] = view.map(p.cx, p.cz)
        return <ellipse key={i} cx={cx} cy={cz} rx={Math.max(4, p.rx * 0.55)} ry={Math.max(2.5, p.rz * 0.55)} fill="#6fb3d8" opacity={0.95} />
      })}
      {seg.plazas.map((p, i) => {
        const [cx, cz] = view.map(p.cx, p.cz)
        return <circle key={i} cx={cx} cy={cz} r={Math.max(3, p.r * 0.5)} fill="none" stroke="#cfc9ba" strokeWidth={1.5} />
      })}
      {seg.lawns.map((p, i) => {
        const [cx, cz] = view.map(p.cx, p.cz)
        return <circle key={i} cx={cx} cy={cz} r={Math.max(3, p.r * 0.5)} fill="#79b356" opacity={0.9} />
      })}
      {pointsFor(stage).map((p) => {
        const [cx, cz] = view.map(p.x, p.z)
        return <circle key={p.id} cx={cx} cy={cz} r={2} fill="#4CAF50" />
      })}
      <circle cx={playerXY[0]} cy={playerXY[1]} r={4.5} fill="#fff" stroke="#4CAF50" strokeWidth={2.5} />
    </svg>
  )
}

function onlyBranchExtra(stage: SegId) {
  return stage === 's1'
}

function ProgressLabel() {
  const meters = useTour((s) => s.meters)
  const onBranch = useTour((s) => s.onBranch)
  const stage = useTour((s) => s.stage)
  const seg = SEGMENTS[stage]
  const total = onBranch && seg.branch ? Math.round(seg.branch.length) : seg.lengthM
  return (
    <div className="progress-label">
      {seg.name} · {Math.round(meters)} м из {total} м · {bandAt(seg, meters, onBranch)}
    </div>
  )
}

function TopBar() {
  const night = useTour((s) => s.night)
  const quality = useTour((s) => s.quality)
  const fly = useTour((s) => s.fly)
  const stage = useTour((s) => s.stage)
  const toggleNight = useTour((s) => s.toggleNight)
  const toggleQuality = useTour((s) => s.toggleQuality)
  const setFly = useTour((s) => s.setFly)
  const setStage = useTour((s) => s.setStage)
  return (
    <div className="topbar">
      <div className="topbar-title">Green Line · {stage === 's1' ? '1 очередь' : '2 очередь'}</div>
      <div className="topbar-buttons">
        <button
          onClick={() => setStage(stage === 's1' ? 's2b' : 's1')}
          title="Переключить этап (или пройдите в портал)"
        >
          {stage === 's1' ? '2️⃣ Этап 2' : '1️⃣ Этап 1'}
        </button>
        <button onClick={toggleNight} title="День / ночь (N)">
          {night ? '☀️ День' : '🌙 Ночь'}
        </button>
        <button onClick={toggleQuality} title="Качество графики">
          {quality === 'high' ? '⚙️ Высокое' : '⚙️ Низкое'}
        </button>
        <button onClick={() => setFly(!fly)} className={fly ? 'active' : ''} title="Свободный полёт (F)">
          {fly ? '🚶 Идти' : '🕊 Полёт'}
        </button>
      </div>
    </div>
  )
}

function PauseHint() {
  const [locked, setLocked] = useState(false)
  useEffect(() => {
    const onChange = () => setLocked(document.pointerLockElement != null)
    document.addEventListener('pointerlockchange', onChange)
    return () => document.removeEventListener('pointerlockchange', onChange)
  }, [])
  if (isTouch || locked) return null
  return <div className="pause-hint">Кликните по сцене, чтобы продолжить прогулку</div>
}

function Fade() {
  const fade = useTour((s) => s.fade)
  if (fade <= 0.01) return null
  return <div className="fade" style={{ opacity: fade }} />
}

export default function HUD() {
  const started = useTour((s) => s.started)
  if (!started) return <StartScreen />
  return (
    <>
      <TopBar />
      <InfoCard />
      <div className="progress">
        <Minimap />
        <ProgressLabel />
      </div>
      <PauseHint />
      <Fade />
    </>
  )
}
