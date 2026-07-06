import { useEffect, useState } from 'react'
import { LENGTH, ZONES, zoneAt } from '../world/constants'
import { isTouch, useTour } from '../store'
import { POINTS } from './InfoPoints'
import ru from './ru.json'

function StartScreen() {
  const start = useTour((s) => s.start)
  return (
    <div className="overlay start">
      <div className="start-card">
        <div className="brand">GREENLINE</div>
        <h1>{ru.title}</h1>
        <p className="sub">
          Линейный парк 721 м · Астана · дождевые сады, пруды, игровые и спортивные зоны
        </p>
        <div className="controls-help">
          {isTouch ? (
            <p>
              Джойстик слева — движение · свайп справа — обзор
            </p>
          ) : (
            <p>
              <b>WASD</b> — движение · <b>мышь</b> — обзор · <b>Shift</b> — бег ·{' '}
              <b>F</b> — режим полёта · <b>N</b> — день/ночь · <b>Esc</b> — пауза
            </p>
          )}
          <p className="hint">Подходите к зелёным маякам — они раскрывают данные проекта</p>
        </div>
        <button className="btn-start" onClick={start}>
          {ru.start}
        </button>
      </div>
    </div>
  )
}

function InfoCard() {
  const activeId = useTour((s) => s.activePoint)
  const point = POINTS.find((p) => p.id === activeId)
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

function ProgressBar() {
  const meters = useTour((s) => s.meters)
  const zone = zoneAt(meters)
  return (
    <div className="progress">
      <div className="progress-track">
        {ZONES.map((z) => (
          <div
            key={z.id}
            className="progress-zone"
            title={z.name}
            style={{
              left: `${(z.from / LENGTH) * 100}%`,
              width: `${((z.to - z.from) / LENGTH) * 100}%`,
              background: z.color,
            }}
          />
        ))}
        {POINTS.map((p) => (
          <div key={p.id} className="progress-poi" style={{ left: `${(p.z / LENGTH) * 100}%` }} />
        ))}
        <div className="progress-dot" style={{ left: `${(meters / LENGTH) * 100}%` }} />
      </div>
      <div className="progress-label">
        {Math.round(meters)} м из {LENGTH} м · {zone.name}
      </div>
    </div>
  )
}

function TopBar() {
  const night = useTour((s) => s.night)
  const quality = useTour((s) => s.quality)
  const fly = useTour((s) => s.fly)
  const toggleNight = useTour((s) => s.toggleNight)
  const toggleQuality = useTour((s) => s.toggleQuality)
  const setFly = useTour((s) => s.setFly)
  return (
    <div className="topbar">
      <div className="topbar-title">Бульвар Greenline · 1 этап</div>
      <div className="topbar-buttons">
        <button onClick={toggleNight} title="День / ночь">
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

export default function HUD() {
  const started = useTour((s) => s.started)
  if (!started) return <StartScreen />
  return (
    <>
      <TopBar />
      <InfoCard />
      <ProgressBar />
      <PauseHint />
    </>
  )
}
