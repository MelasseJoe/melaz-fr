import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowUpRight, CalendarDays, Check, Dumbbell, Gamepad2, LoaderCircle, Timer } from 'lucide-react'

const apps = [
  { name: 'Dofus tracker', description: 'Suivi de tes quêtes et de tes succès.', url: '/apps/dofus-tracker', icon: Gamepad2, color: 'green' },
  { name: 'Pulse', description: 'Suivi de tes séances et habitudes.', url: '/apps/pulse', icon: Dumbbell, color: 'orange' },
  { name: 'Focus room', description: 'Des sessions pour rester concentré.', url: '/apps/focus-room', icon: Timer, color: 'purple' },
] as const

const dailyQuests = ["L'Almanax", 'Aller hue', "Bien velu c'est Kérubim"]
const weeklyQuest = "L'école fantastique"
const almanaxUrl = 'https://api.dofusdb.fr/almanax'

type AlmanaxData = { resource: string; quantity: number; kamasRatio: number; optimalLevel: number; duration: number; levelMax: number; scalesWithLevel: boolean }
type SavedProgress = { dailyKey: string; weeklyKey: string; completed: string[] }

function App() {
  return window.location.pathname === '/apps/dofus-tracker' ? <DofusTracker /> : <Hub />
}

function Hub() {
  return <main className="hub"><header className="hub-header"><div className="brand-mark">m</div><span className="brand-name">melaz</span></header><section className="hub-content"><p className="eyebrow">Ton espace</p><h1>Où veux-tu aller ?</h1><p className="subtitle">Choisis une application pour commencer.</p><div className="app-grid">{apps.map((app) => <AppCard key={app.name} app={app} />)}</div></section><footer className="hub-footer">melaz · un espace pour tes projets</footer></main>
}

function AppCard({ app }: { app: (typeof apps)[number] }) {
  const Icon = app.icon
  return <a className="app-card" href={app.url}><div className={`app-icon ${app.color}`}><Icon size={24} strokeWidth={1.8} /></div><div className="card-copy"><h2>{app.name}</h2><p>{app.description}</p></div><span className="card-arrow"><ArrowUpRight size={19} /></span></a>
}

function DofusTracker() {
  const now = new Date()
  const [completed, setCompleted] = useState<string[]>(() => readProgress(now))
  const [almanax, setAlmanax] = useState<AlmanaxData | null>(null)
  const [almanaxError, setAlmanaxError] = useState(false)

  useEffect(() => {
    let cancelled = false
    const date = formatApiDate(new Date())
    Promise.all([
      fetch(`${almanaxUrl}?date=${date}`).then((response) => response.ok ? response.json() : Promise.reject(new Error('Almanax indisponible'))),
      fetch('https://api.dofusdb.fr/quests/966').then((response) => response.ok ? response.json() : Promise.reject(new Error('Récompense indisponible'))),
    ])
      .then(([data, questData]) => {
        if (cancelled) return
        const questStep = questData.data?.[0]?.steps?.[0]
        const reward = questStep?.rewards?.[0]
        const optimalLevel = questStep?.optimalLevel ?? 200
        const kamasRatio = reward?.kamasRatio ?? 0.181
        const duration = questStep?.duration ?? 0.5
        setAlmanax({ resource: data.items?.[0]?.name?.fr ?? 'Ressource inconnue', quantity: data.quantities?.[0] ?? 0, kamasRatio, optimalLevel, duration, levelMax: reward?.levelMax ?? 200, scalesWithLevel: reward?.kamasScaleWithPlayerLevel ?? false })
      })
      .catch(() => { if (!cancelled) setAlmanaxError(true) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const refreshPeriod = () => {
      const current = new Date()
      const saved = readSavedProgress()
      if (!saved) return
      const next = saved.completed.filter((quest) => saved.dailyKey === dailyKey(current) || !dailyQuests.includes(quest))
        .filter((quest) => saved.weeklyKey === weeklyKey(current) || quest !== weeklyQuest)
      if (next.length !== saved.completed.length) {
        setCompleted(next)
        localStorage.setItem('melaz-dofus-progress', JSON.stringify({ dailyKey: dailyKey(current), weeklyKey: weeklyKey(current), completed: next } satisfies SavedProgress))
      }
    }
    const interval = window.setInterval(refreshPeriod, 30_000)
    return () => window.clearInterval(interval)
  }, [])

  const toggleQuest = (quest: string) => {
    const next = completed.includes(quest) ? completed.filter((item) => item !== quest) : [...completed, quest]
    setCompleted(next)
    localStorage.setItem('melaz-dofus-progress', JSON.stringify({ dailyKey: dailyKey(new Date()), weeklyKey: weeklyKey(new Date()), completed: next } satisfies SavedProgress))
  }
  const kamas = almanax ? calculateKamas(almanax, 200) : 0
  const dateLabel = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now)

  return <main className="tracker-page"><header className="tracker-header"><a className="back-link" href="/"><ArrowLeft size={17} /> Retour</a><div className="tracker-brand"><div className="brand-mark">m</div><span className="brand-name">melaz</span></div></header><section className="tracker-content"><div className="tracker-intro"><p className="eyebrow">Dofus tracker</p><h1>Mes quêtes</h1><p className="subtitle">{capitalize(dateLabel)}.</p></div><AlmanaxCard almanax={almanax} error={almanaxError} kamas={kamas} /><div className="quest-groups"><section className="quest-section"><div className="section-title"><div><span className="section-label">Aujourd'hui</span><h2>Quêtes quotidiennes</h2></div><span className="quest-count">{dailyQuests.filter((quest) => completed.includes(quest)).length}/{dailyQuests.length}</span></div><p className="reset-note">Réinitialisation automatique à minuit</p><div className="quest-list">{dailyQuests.map((quest) => <QuestRow key={quest} name={quest} done={completed.includes(quest)} onToggle={() => toggleQuest(quest)} />)}</div></section><section className="quest-section weekly-section"><div className="section-title"><div><span className="section-label weekly-label"><CalendarDays size={14} /> Chaque semaine</span><h2>Quête hebdomadaire</h2></div><span className="quest-count">{completed.includes(weeklyQuest) ? '1' : '0'}/1</span></div><p className="weekly-note">Réinitialisation automatique chaque mardi à 08:00</p><div className="quest-list"><QuestRow name={weeklyQuest} done={completed.includes(weeklyQuest)} onToggle={() => toggleQuest(weeklyQuest)} weekly /></div></section></div><p className="data-source">Données Almanax : DofusDB · Utilisation soumise à la LPNC-IA 1.0.</p></section></main>
}

function AlmanaxCard({ almanax, error, kamas }: { almanax: AlmanaxData | null; error: boolean; kamas: number }) {
  return <section className="almanax-card"><div className="almanax-heading"><div><span className="section-label almanax-label">L'Almanax du jour</span><h2>{almanax ? almanax.resource : error ? 'Donnée indisponible' : 'Chargement...'}</h2></div>{!almanax && !error && <LoaderCircle className="loading-icon" size={20} />}</div>{almanax && <div className="almanax-details"><div><span>Offrande</span><strong>x{almanax.quantity} {almanax.resource}</strong></div><div><span>Kamas estimés</span><strong>{kamas.toLocaleString('fr-FR')} kamas</strong></div></div>}{error && <p className="almanax-error">La ressource du jour n'a pas pu être récupérée. Réessaie plus tard.</p>}{almanax && <p className="almanax-formula">Formule Ganymède : niveau optimal {almanax.optimalLevel}, durée {almanax.duration} h, coefficient {almanax.kamasRatio}.</p>}</section>
}

function QuestRow({ name, done, onToggle, weekly = false }: { name: string; done: boolean; onToggle: () => void; weekly?: boolean }) {
  return <button className={`quest-row ${done ? 'done' : ''} ${weekly ? 'weekly-row' : ''}`} onClick={onToggle}><span className="quest-check">{done && <Check size={16} />}</span><span className="quest-name">{name}</span><span className="quest-action">{done ? 'Terminée' : 'À faire'}</span></button>
}

function formatApiDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function dailyKey(date: Date) { return formatApiDate(date) }
function weeklyKey(date: Date) { const reset = new Date(date); const daysSinceTuesday = (reset.getDay() - 2 + 7) % 7; reset.setDate(reset.getDate() - daysSinceTuesday); if (date.getDay() === 2 && date.getHours() < 8) reset.setDate(reset.getDate() - 7); reset.setHours(8, 0, 0, 0); return reset.toISOString() }
function readSavedProgress(): SavedProgress | null { try { return JSON.parse(localStorage.getItem('melaz-dofus-progress') ?? 'null') as SavedProgress | null } catch { return null } }
function readProgress(date: Date) {
  const saved = readSavedProgress()
  if (!saved) return []
  return saved.completed.filter((quest) => saved.dailyKey === dailyKey(date) || !dailyQuests.includes(quest)).filter((quest) => saved.weeklyKey === weeklyKey(date) || quest !== weeklyQuest)
}
function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1) }
function calculateKamas(almanax: AlmanaxData, level: number) {
  const rewardLevel = almanax.scalesWithLevel ? (almanax.levelMax === -1 ? level : almanax.levelMax) : almanax.optimalLevel
  return Math.trunc((rewardLevel ** 2 + 20 * rewardLevel - 20) * almanax.kamasRatio * almanax.duration)
}

export default App
