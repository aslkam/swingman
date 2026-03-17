'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, ChevronRight, RotateCcw, CheckCircle2, Loader2,
  TrendingUp, AlertCircle, Share2, X, Clock, Check,
  Sparkles, Info, BookOpen,
} from 'lucide-react'
import axios from 'axios'

// ─── Constants ────────────────────────────────────────────────────────────────

const BACKEND_URL    = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
const ONBOARDING_KEY = 'swingman_onboarding_dismissed'
const HISTORY_KEY    = 'swingman_history'

const PHASE_LABELS: Record<string, string> = {
  address: 'Adresse', backswing_top: 'Backswing', impact: 'Impact', follow_through: 'Follow-through',
}

const IMPACT_CONFIG = {
  high:   { label: 'Høy effekt', pill: 'bg-rose-50 border-rose-200 text-rose-600' },
  medium: { label: 'Middels',    pill: 'bg-amber-50 border-amber-200 text-amber-600' },
  low:    { label: 'Lav',        pill: 'bg-slate-100 border-slate-200 text-slate-500' },
}

const SKILL_LEVELS = [
  {
    key: 'nybegynner' as const,
    label: 'Nybegynner',
    emoji: '🌱',
    desc: 'Ny i golf eller spiller sjeldnere enn månedlig. AI-en gir enkle, konkrete råd om grunnleggende teknikk og holder forklaringene korte.',
  },
  {
    key: 'middels' as const,
    label: 'Middels',
    emoji: '⛳',
    desc: 'Spiller regelmessig og kjenner grunnleggende teknikk. Handicap 18–36 eller tilsvarende. AI-en gir mer detaljerte tekniske råd.',
  },
  {
    key: 'avansert' as const,
    label: 'Avansert',
    emoji: '🏆',
    desc: 'Erfaren spiller med stabil teknikk og handicap under 18. AI-en bruker golfterminologi og gir presise, avanserte justeringer.',
  },
]

const BALL_FLIGHT_OPTIONS = [
  { key: 'tykk',     label: 'Tykk',      emoji: '⛏️', desc: 'Treffer bakken før ballen' },
  { key: 'tynn',     label: 'Tynn',      emoji: '🪶', desc: 'Skraper toppen av ballen' },
  { key: 'høyre',    label: 'Høyre',     emoji: '↗️', desc: 'Ballen sveier til høyre' },
  { key: 'venstre',  label: 'Venstre',   emoji: '↖️', desc: 'Ballen sveier til venstre' },
  { key: 'vet_ikke', label: 'Vet ikke',  emoji: '🤷', desc: '' },
]

const GOLF_TIPS = [
  '70% av alle golfslag skjer innen 100 meter fra hullet — kortspillet er nøkkelen.',
  'Grep-trykket bør være som å holde en fugl: fast nok til at den ikke flyr.',
  'Den gjennomsnittlige PGA Tour-proffen driver ballen ca. 295 meter.',
  'God adressestilling er fundamentet i enhver god golfsving.',
  'Prøv 80% kraft — de fleste amatørgolfere svinger altfor hardt.',
  'Tiger Woods har vunnet 15 majors gjennom fokusert, metodisk trening.',
  'Hodet ditt veier ca. 5 kg — hold det stille for mer presisjon.',
  '90° hofterotasjon i backswing gir maksimal kraft i nedsvingen.',
  'Det tar typisk 2 år med jevn trening å gå ned 10 slag i handicap.',
  'God fotarbeid er undervurdert — det gir energi til hele svingen.',
  'St. Andrews i Skottland er over 600 år gammel og golfens hjemsted.',
  'Den beste enkeltinvesteringen i golfen er en time med sertifisert instruktør.',
  'Golf ble tatt ut av OL i 1904 og kom tilbake i Rio 2016.',
  '15 minutter putting daglig kan alene ta deg ned 3–4 slag per runde.',
  'Vann dekker ~20% av en gjennomsnittlig golfbane. Presisjon lønner seg.',
]

const STEPS = [
  { key: 'uploading',  label: 'Laster opp',          sub: 'Sender video til server' },
  { key: 'analyzing',  label: 'Analyserer bevegelse', sub: 'Identifiserer 33 kroppspunkter' },
  { key: 'generating', label: 'AI coacher deg',       sub: 'Genererer personlige råd' },
]

// ─── Animation presets ────────────────────────────────────────────────────────

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number]
const fadeUp = {
  initial:    { opacity: 0, y: 20, filter: 'blur(6px)' },
  animate:    { opacity: 1, y: 0,  filter: 'blur(0px)' },
  exit:       { opacity: 0, y: -8, filter: 'blur(4px)' },
  transition: { duration: 0.45, ease },
}
const stagger = { animate: { transition: { staggerChildren: 0.08 } } }
const item = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0  },
  transition: { duration: 0.38, ease },
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Stage      = 'idle' | 'uploading' | 'analyzing' | 'generating' | 'done'
type SkillLevel = 'nybegynner' | 'middels' | 'avansert'

interface AngleSnapshot { shoulder: number; hip: number; spine: number }
interface HistoryEntry {
  id: string; date: string; score: number; summary: string
  improvements_count: number; angles?: AngleSnapshot
}

// Nøkkelmålinger å vise med referanseverdier
const KEY_ANGLES = [
  { phase: 'backswing_top', key: 'shoulder_rotation', label: 'Skulderrotasjon', sub: 'Topp av backswing', min: 80, max: 95 },
  { phase: 'backswing_top', key: 'hip_rotation',      label: 'Hofterotasjon',   sub: 'Topp av backswing', min: 40, max: 55 },
  { phase: 'address',       key: 'spine_angle',        label: 'Ryggvinkel',      sub: 'Adressestilling',   min: 35, max: 45 },
  { phase: 'impact',        key: 'hip_rotation',       label: 'Hofterotasjon',   sub: 'Ved ballkontakt',   min: 45, max: 60 },
  { phase: 'backswing_top', key: 'left_arm_angle',     label: 'Venstre arm',     sub: 'Topp av backswing', min: 150, max: 180 },
] as const

function loadHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') } catch { return [] }
}

// ─── Demo-analyse ─────────────────────────────────────────────────────────────
// Basert på typisk analyse av amatørgolfer, middels nivå

const DEMO_RESULT = {
  score: 62,
  summary: 'Du har et godt grunnlag med stabil adressestilling og jevn rytme gjennom svingen. Skulderrotasjonen stopper litt tidlig i backswing, noe som begrenser kraftpotensialet. Hoftene er for sene med å åpne seg i nedsvingen, og venstre arm bøyer mer enn ideelt ved topp av backswing. Med fokus på rotasjon og arm-disiplin kan du hente 10–15 poeng.',
  strengths: [
    'God og stabil adressestilling med riktig ballplassering',
    'Rolig og kontrollert tempo — du ruser deg ikke gjennom backswingen',
    'Solid follow-through med god balanse etter slag',
  ],
  improvements: [
    {
      area: 'Skulderrotasjon',
      issue: 'Skuldrene roterer kun ca. 73° i backswing — ideelt er 80–95° for full kraftoverføring',
      tip: 'Forestill deg at du skal peke venstre skulder mot ballen i topp av backswing. Prøv drill med en klubb over skuldrene for å kjenne riktig rotasjon.',
      impact: 'high',
      phase: 'backswing_top',
    },
    {
      area: 'Hofteåpning i nedsvingen',
      issue: 'Hoftene er for sene med å starte nedsvingen — de roterer kun 42° ved impact mot ideelle 45–60°',
      tip: 'Start nedsvingen ved å dreie venstre hofte bakover og mot målet FØR du begynner armbevegelsen. Prøv «bump and turn»-drillet.',
      impact: 'high',
      phase: 'impact',
    },
    {
      area: 'Venstre arm i backswing',
      issue: 'Venstre arm bøyer til ca. 145° ved topp av backswing — ideelt er 150–180° (rett arm)',
      tip: 'Hold venstre arm strak gjennom backswingen. Prøv å holde en headcover under venstre armhule for å tvinge kontakt mellom overarm og bryst.',
      impact: 'medium',
      phase: 'backswing_top',
    },
    {
      area: 'Ryggvinkel',
      issue: 'Ryggvinkelen er 48° i adresse — litt brattere enn idealverdien på 35–45°',
      tip: 'Bøy litt mer fra hoften i adressestillingen. Hold ryggen flat og skuldrene over tærne, ikke over knærne.',
      impact: 'low',
      phase: 'address',
    },
  ],
  priority_drill: {
    name: 'Skulderrotasjons-drill med klubb',
    description: 'Hold en klubb horisontalt over skuldrene med kryss-grep. Øv på å rotere til venstre skulder peker mot en imaginær ball. Gjør dette sakte foran et speil — 20 repetisjoner per økt. Kjenn at hoftene holder seg og skuldrene roterer fullt.',
    duration: '10 min daglig',
  },
  measurements: {
    address: {
      frame: 0,
      shoulder_rotation: 86.2,
      hip_rotation: 82.1,
      left_arm_angle: 162.4,
      left_knee_flex: 158.3,
      right_knee_flex: 156.8,
      spine_angle: 48.1,
    },
    backswing_top: {
      frame: 18,
      shoulder_rotation: 73.4,
      hip_rotation: 38.2,
      left_arm_angle: 144.7,
      left_knee_flex: 145.6,
      right_knee_flex: 138.2,
      spine_angle: 46.3,
    },
    impact: {
      frame: 36,
      shoulder_rotation: 92.1,
      hip_rotation: 42.3,
      left_arm_angle: 168.9,
      left_knee_flex: 162.4,
      right_knee_flex: 158.7,
      spine_angle: 44.8,
    },
    follow_through: {
      frame: 54,
      shoulder_rotation: 118.5,
      hip_rotation: 68.4,
      left_arm_angle: 156.2,
      left_knee_flex: 172.1,
      right_knee_flex: 152.3,
      spine_angle: 42.6,
    },
  },
  keyframes: {} as Record<string, string>,
}

// ─── Glass style ─────────────────────────────────────────────────────────────

const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,0.75)',
  backdropFilter: 'blur(40px)',
  WebkitBackdropFilter: 'blur(40px)',
  boxShadow: '0 2px 32px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.95)',
}

// ─── AngleBar ────────────────────────────────────────────────────────────────

function AngleBar({ value, min, max, label, sub }: { value: number; min: number; max: number; label: string; sub: string }) {
  const displayMax = max * 1.5
  const pct        = Math.min(100, (value / displayMax) * 100)
  const tMin       = (min / displayMax) * 100
  const tMax       = (max / displayMax) * 100
  const inRange    = value >= min && value <= max
  const close      = value >= min * 0.88 && value <= max * 1.12
  const color      = inRange ? '#059669' : close ? '#d97706' : '#dc2626'
  const diff       = inRange ? null : value < min ? `${Math.round(min - value)}° under mål` : `${Math.round(value - max)}° over mål`

  return (
    <div className="py-3 border-b border-black/[0.05] last:border-0">
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <span className="text-sm font-semibold text-black/75">{label}</span>
          <span className="text-xs text-black/30 ml-2">{sub}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-bold tabular-nums" style={{ color }}>{Math.round(value)}°</span>
          {diff && <span className="text-xs" style={{ color }}>{diff}</span>}
          {inRange && <span className="text-xs text-emerald-600">✓ i mål</span>}
        </div>
      </div>
      {/* Track */}
      <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.07)' }}>
        {/* Target zone */}
        <div className="absolute top-0 bottom-0 rounded-full opacity-30"
          style={{ left: `${tMin}%`, width: `${tMax - tMin}%`, background: '#059669' }} />
        {/* Value */}
        <motion.div className="absolute top-0 left-0 bottom-0 rounded-full"
          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          style={{ background: color }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-black/20">0°</span>
        <span className="text-[10px] text-black/30">Mål {min}–{max}°</span>
      </div>
    </div>
  )
}

// ─── ScoreRing ────────────────────────────────────────────────────────────────

function ScoreRing({ score, showInfo, onToggleInfo }: { score: number; showInfo: boolean; onToggleInfo: () => void }) {
  const s = 200, r = 82, cx = 100, cy = 100
  const circ   = 2 * Math.PI * r
  const filled = (score / 100) * circ
  const color  = score >= 75 ? '#059669' : score >= 50 ? '#d97706' : '#dc2626'
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative inline-flex">
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <defs>
            <filter id="rg" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="10" />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circ - filled}`}
            transform={`rotate(-90 ${cx} ${cy})`}
            filter="url(#rg)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[4rem] font-bold tracking-tight tabular-nums leading-none" style={{ color: '#1d1d1f' }}>{score}</span>
          <span className="text-sm text-black/35 tracking-widest uppercase mt-2 font-medium">av 100</span>
        </div>
      </div>

      {/* Info toggle */}
      <button onClick={onToggleInfo}
        className="flex items-center gap-1.5 text-sm text-black/35 hover:text-black/60 transition-colors"
      >
        <Info size={14} />
        {showInfo ? 'Skjul forklaring' : 'Hva betyr dette?'}
      </button>

      {/* Score explanation */}
      <AnimatePresence>
        {showInfo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full overflow-hidden"
          >
            <div className="rounded-2xl px-4 py-3" style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.07)' }}>
              <div className="flex justify-between text-xs text-black/40 mb-2">
                <span>0 — Nybegynner</span>
                <span>50 — Hobbyspiller</span>
                <span>100 — Tour-proff</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.07)' }}>
                <div className="h-full rounded-full" style={{ background: 'linear-gradient(90deg, #dc2626, #d97706, #059669)', width: '100%' }} />
              </div>
              <p className="text-sm text-black/50 mt-2.5 leading-relaxed">
                Scoren beregnes av AI-en basert på din teknikk i alle fire sving-faser. En score på <strong className="text-black/70">{score}</strong> betyr at du er på nivå med en typisk{' '}
                {score >= 80 ? 'lavhandicap-spiller' : score >= 65 ? 'erfaren amatørspiller' : score >= 50 ? 'vanlig weekendspiller' : 'nybegynner'}.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── FilmingGuide ─────────────────────────────────────────────────────────────

function FilmingGuide({ onDismiss }: { onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ duration: 0.4, ease }}
      className="rounded-3xl border border-black/[0.07] overflow-hidden"
      style={glass}
    >
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-base font-semibold text-gray-900 tracking-tight">Slik filmer du svingen</p>
            <p className="text-sm text-black/40 mt-0.5">For best mulig analyse</p>
          </div>
          <button onClick={onDismiss}
            className="w-8 h-8 rounded-full bg-black/[0.05] border border-black/[0.07] flex items-center justify-center text-black/35 hover:text-black/60 transition-colors"
          ><X size={14} /></button>
        </div>

        <div className="rounded-2xl bg-emerald-50 border border-emerald-100 overflow-hidden mb-4">
          <svg viewBox="0 0 260 160" className="w-full" xmlns="http://www.w3.org/2000/svg">
            <rect width="260" height="160" fill="#f0fdf4" />
            <line x1="20" y1="132" x2="240" y2="132" stroke="rgba(0,0,0,0.1)" strokeWidth="1"/>
            <circle cx="112" cy="52" r="10" fill="none" stroke="#059669" strokeWidth="1.8"/>
            <line x1="112" y1="62"  x2="112" y2="100" stroke="#059669" strokeWidth="1.8"/>
            <line x1="112" y1="74"  x2="93"  y2="88"  stroke="#059669" strokeWidth="1.8"/>
            <line x1="112" y1="74"  x2="131" y2="88"  stroke="#059669" strokeWidth="1.8"/>
            <line x1="112" y1="100" x2="101" y2="132" stroke="#059669" strokeWidth="1.8"/>
            <line x1="112" y1="100" x2="123" y2="132" stroke="#059669" strokeWidth="1.8"/>
            <rect x="178" y="82" width="20" height="32" rx="4" fill="white" stroke="#9ca3af" strokeWidth="1.5"/>
            <rect x="181" y="86" width="14" height="20" rx="1.5" fill="#f3f4f6"/>
            <circle cx="188" cy="85" r="2.5" fill="none" stroke="#9ca3af" strokeWidth="1"/>
            <line x1="178" y1="98" x2="146" y2="98" stroke="#6b7280" strokeWidth="1" strokeDasharray="3,2"/>
            <polygon points="146,95 140,98 146,101" fill="#6b7280"/>
            <text x="153" y="93" fill="#6b7280" fontSize="8" fontFamily="system-ui">90°</text>
            <line x1="136" y1="120" x2="178" y2="120" stroke="#d1d5db" strokeWidth="1"/>
            <line x1="136" y1="116" x2="136" y2="124" stroke="#d1d5db" strokeWidth="1"/>
            <line x1="178" y1="116" x2="178" y2="124" stroke="#d1d5db" strokeWidth="1"/>
            <text x="157" y="116" textAnchor="middle" fill="#9ca3af" fontSize="7.5" fontFamily="system-ui">2–3 m</text>
            <text x="112" y="148" textAnchor="middle" fill="#059669" fontSize="8" fontFamily="system-ui" fontWeight="600">Deg</text>
            <text x="188" y="148" textAnchor="middle" fill="#6b7280" fontSize="8" fontFamily="system-ui">Telefon</text>
          </svg>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {[['🌤','God belysning'],['👤','Hele kroppen i bildet'],['📱','Hold telefonen stabil'],['⏱','5–15 sek er nok']].map(([icon, text]) => (
            <div key={text} className="flex items-center gap-2 rounded-xl bg-black/[0.03] border border-black/[0.05] px-3 py-2.5">
              <span className="text-base">{icon}</span>
              <span className="text-sm text-black/55">{text}</span>
            </div>
          ))}
        </div>

        <button onClick={onDismiss} className="text-sm text-black/30 hover:text-black/50 transition-colors">
          Ikke vis igjen
        </button>
      </div>
    </motion.div>
  )
}

// ─── SkillSlider ──────────────────────────────────────────────────────────────

function SkillSlider({ value, onChange }: { value: SkillLevel; onChange: (v: SkillLevel) => void }) {
  const idx = SKILL_LEVELS.findIndex(s => s.key === value)
  const current = SKILL_LEVELS[idx]
  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-black/35 uppercase tracking-widest">Ditt spillnivå</p>

      {/* Slider */}
      <div className="px-1">
        <input
          type="range" min={0} max={2} step={1} value={idx}
          onChange={e => onChange(SKILL_LEVELS[+e.target.value].key)}
          className="skill-slider"
          style={{
            background: `linear-gradient(to right, #059669 0%, #059669 ${idx * 50}%, rgba(0,0,0,0.1) ${idx * 50}%, rgba(0,0,0,0.1) 100%)`
          }}
        />
        {/* Labels */}
        <div className="flex justify-between mt-2.5">
          {SKILL_LEVELS.map((s, i) => (
            <button key={s.key} onClick={() => onChange(s.key)}
              className="flex flex-col items-center gap-0.5 transition-all"
              style={{ opacity: i === idx ? 1 : 0.35 }}>
              <span className="text-xl">{s.emoji}</span>
              <span className={`text-xs font-semibold ${i === idx ? 'text-emerald-700' : 'text-black/40'}`}>{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <AnimatePresence mode="wait">
        <motion.div key={value}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.25 }}
          className="rounded-2xl px-4 py-3.5"
          style={{ background: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.15)' }}
        >
          <p className="text-sm text-black/60 leading-relaxed">{current.desc}</p>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [videoFile, setVideoFile]       = useState<File | null>(null)
  const [previewUrl, setPreviewUrl]     = useState<string | null>(null)
  const [thumbnail, setThumbnail]       = useState<string | null>(null)
  const [isDragging, setIsDragging]     = useState(false)
  const [stage, setStage]               = useState<Stage>('idle')
  const [results, setResults]           = useState<any>(null)
  const [error, setError]               = useState<string | null>(null)
  const [skillLevel, setSkillLevel]     = useState<SkillLevel>('middels')
  const [ballFlight, setBallFlight]     = useState<string[]>([])
  const [history, setHistory]           = useState<HistoryEntry[]>([])
  const [isDemo, setIsDemo]             = useState(false)
  const [showFull, setShowFull]         = useState(false)
  const [copied, setCopied]             = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [tipIndex, setTipIndex]         = useState(0)
  const [tipVisible, setTipVisible]     = useState(true)
  const [guideVisible, setGuideVisible] = useState(false)
  const [scoreInfoOpen, setScoreInfoOpen] = useState(false)

  const fileInputRef   = useRef<HTMLInputElement>(null)
  const progressTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const elapsedTimer   = useRef<ReturnType<typeof setInterval> | null>(null)
  const tipTimer       = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const dismissed = localStorage.getItem(ONBOARDING_KEY) === 'true'
    setGuideVisible(!dismissed)
    setHistory(loadHistory())
    setTipIndex(Math.floor(Math.random() * GOLF_TIPS.length))
  }, [])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      if (progressTimer.current) clearTimeout(progressTimer.current)
      if (elapsedTimer.current)  clearInterval(elapsedTimer.current)
      if (tipTimer.current)      clearInterval(tipTimer.current)
    }
  }, [previewUrl])

  const isAnalyzing = ['uploading','analyzing','generating'].includes(stage)
  useEffect(() => {
    if (!isAnalyzing) { if (tipTimer.current) clearInterval(tipTimer.current); return }
    tipTimer.current = setInterval(() => {
      setTipVisible(false)
      setTimeout(() => { setTipIndex(i => (i + 1) % GOLF_TIPS.length); setTipVisible(true) }, 350)
    }, 5500)
    return () => { if (tipTimer.current) clearInterval(tipTimer.current) }
  }, [isAnalyzing])

  const dismissGuide = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true')
    setGuideVisible(false)
  }

  const currentStepIndex = STEPS.findIndex(s => s.key === stage)

  // Capture video thumbnail from first frame
  const captureThumbnail = (file: File, objectUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const video = document.createElement('video')
      const canvas = document.createElement('canvas')
      video.src = objectUrl
      video.muted = true
      video.playsInline = true
      video.addEventListener('loadeddata', () => {
        video.currentTime = 0.5
      })
      video.addEventListener('seeked', () => {
        canvas.width  = video.videoWidth  || 640
        canvas.height = video.videoHeight || 480
        canvas.getContext('2d')?.drawImage(video, 0, 0)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      })
      video.addEventListener('error', () => resolve(''))
      setTimeout(() => resolve(''), 5000) // fallback
    })
  }

  const pickFile = useCallback(async (file: File) => {
    if (file.size > 50 * 1024 * 1024) { setError('Videoen er for stor. Maks 50 MB.'); return }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    const url = URL.createObjectURL(file)
    setVideoFile(file); setPreviewUrl(url); setError(null); setResults(null); setThumbnail(null)
    const thumb = await captureThumbnail(file, url)
    setThumbnail(thumb || null)
  }, [previewUrl])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) pickFile(f) }
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) pickFile(f) }

  const handleDemo = () => {
    setError(null)
    setIsDemo(true)
    setResults(DEMO_RESULT)
    setStage('done')
  }

  const handleAnalyze = async () => {
    if (!videoFile) return
    setError(null); setStage('uploading'); setElapsedSeconds(0)
    elapsedTimer.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000)
    try {
      const form = new FormData()
      form.append('file', videoFile)
      form.append('skill_level', skillLevel)
      form.append('ball_flight', ballFlight.join(','))
      const res = await axios.post(`${BACKEND_URL}/analyze`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total && e.loaded >= e.total) {
            setStage('analyzing')
            progressTimer.current = setTimeout(() => setStage('generating'), 2000)
          }
        },
      })
      const m = res.data.measurements ?? {}
      const entry: HistoryEntry = {
        id: Date.now().toString(), date: new Date().toISOString(),
        score: Number(res.data.score ?? 0), summary: res.data.summary ?? '',
        improvements_count: res.data.improvements?.length ?? 0,
        angles: m.backswing_top ? {
          shoulder: Math.round(m.backswing_top.shoulder_rotation ?? 0),
          hip:      Math.round(m.backswing_top.hip_rotation ?? 0),
          spine:    Math.round(m.address?.spine_angle ?? 0),
        } : undefined,
      }
      const newHistory = [entry, ...loadHistory()].slice(0, 10)
      localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory)); setHistory(newHistory)
      setResults(res.data); setStage('done')
    } catch (err: any) {
      if (progressTimer.current) clearTimeout(progressTimer.current)
      setError(err.response?.data?.detail || 'Analyse feilet. Prøv igjen.'); setStage('idle')
    } finally {
      if (elapsedTimer.current) clearInterval(elapsedTimer.current)
    }
  }

  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    if (progressTimer.current) clearTimeout(progressTimer.current)
    if (elapsedTimer.current) clearInterval(elapsedTimer.current)
    setVideoFile(null); setPreviewUrl(null); setThumbnail(null)
    setResults(null); setError(null); setStage('idle'); setElapsedSeconds(0); setIsDemo(false); setShowFull(false); setBallFlight([])
  }

  const handleShare = async () => {
    const text = `Jeg fikk ${results?.score ?? '–'}/100 på Swingman! 🏌️\n${results?.summary ?? ''}\n\nhttps://swingman-six.vercel.app`
    if (navigator.share) { try { await navigator.share({ title: 'Min svingscore', text }) } catch (_) {} }
    else { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500) } catch (_) {} }
  }

  const improvements = results?.improvements ?? []
  const score        = results?.score ?? 70

  return (
    <div className="min-h-dvh font-sans" style={{ background: 'linear-gradient(160deg, #e8f5f0 0%, #eef2ff 55%, #f5f5f7 100%)' }}>

      {/* Ambient orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[500px]"
          style={{ background: 'radial-gradient(ellipse, rgba(52,211,153,0.18) 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px]"
          style={{ background: 'radial-gradient(ellipse, rgba(139,92,246,0.08) 0%, transparent 70%)' }} />
      </div>

      {/* ── Header ── */}
      <header className="relative z-20 sticky top-0"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.07)', backdropFilter: 'blur(40px)', background: 'rgba(245,245,247,0.85)' }}>
        <div className="max-w-xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #34d399, #059669)', boxShadow: '0 4px 16px rgba(52,211,153,0.35)' }}>
              <span className="text-base leading-none">⛳</span>
            </div>
            <span className="font-semibold tracking-tight text-base" style={{ color: '#1d1d1f' }}>Swingman</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Guide toggle */}
            {stage === 'idle' && !results && (
              <button onClick={() => setGuideVisible(v => !v)}
                className={`flex items-center gap-1.5 text-sm font-medium transition-colors px-3 py-1.5 rounded-full ${
                  guideVisible
                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                    : 'text-black/35 hover:text-black/60'
                }`}>
                <BookOpen size={14} />
                Guide
              </button>
            )}
            {results && (
              <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={handleReset}
                className="flex items-center gap-1.5 text-sm text-black/40 hover:text-black/70 transition-colors font-medium">
                <RotateCcw size={13} /> {isDemo ? 'Tilbake' : 'Ny analyse'}
              </motion.button>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-xl mx-auto px-5 pb-36">
        <AnimatePresence mode="wait">

          {/* ══════════════════════ UPLOAD ══════════════════════ */}
          {stage === 'idle' && !results && (
            <motion.div key="upload" {...fadeUp} className="pt-6 space-y-5">

              {/* Filming guide (toggle) */}
              <AnimatePresence>
                {guideVisible && <FilmingGuide onDismiss={dismissGuide} />}
              </AnimatePresence>

              {/* Hero */}
              <div className="pt-1 pb-1">
                <h1 className="text-4xl font-bold tracking-tight leading-[1.1]" style={{ color: '#1d1d1f' }}>
                  Analyser<br />
                  <span style={{
                    background: 'linear-gradient(135deg, #059669 0%, #10b981 50%, #34d399 100%)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                  }}>svingen din.</span>
                </h1>
                <p className="text-black/45 mt-3 text-base leading-relaxed">
                  Last opp en video og få personlig coaching fra AI.
                </p>
              </div>

              {/* Demo teaser-card */}
              <motion.button
                whileTap={{ scale: 0.985 }}
                onClick={handleDemo}
                className="w-full text-left rounded-3xl overflow-hidden transition-all"
                style={{
                  background: 'linear-gradient(135deg, rgba(5,150,105,0.07) 0%, rgba(16,185,129,0.04) 100%)',
                  border: '1.5px solid rgba(5,150,105,0.2)',
                  boxShadow: '0 2px 20px rgba(5,150,105,0.08), inset 0 1px 0 rgba(255,255,255,0.8)',
                }}
              >
                <div className="px-5 py-4 flex items-center gap-4">
                  {/* Mini score circle */}
                  <div className="shrink-0 relative w-14 h-14">
                    <svg width="56" height="56" viewBox="0 0 56 56">
                      <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(5,150,105,0.15)" strokeWidth="4" />
                      <circle cx="28" cy="28" r="22" fill="none" stroke="#059669" strokeWidth="4"
                        strokeLinecap="round"
                        strokeDasharray={`${(62 / 100) * 2 * Math.PI * 22} ${2 * Math.PI * 22}`}
                        transform="rotate(-90 28 28)"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-base font-bold text-emerald-700">62</span>
                    </div>
                  </div>

                  {/* Tekst */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-emerald-700">Se eksempelanalyse</span>
                      <span className="text-[10px] font-semibold text-emerald-600/70 bg-emerald-100 px-2 py-0.5 rounded-full">DEMO</span>
                    </div>
                    <p className="text-xs text-black/40 leading-relaxed">Skulderrotasjon, hoftevinkel, venstre arm — og konkrete øvelser. Ingen video nødvendig.</p>
                  </div>

                  <ChevronRight size={16} className="text-emerald-600 shrink-0" />
                </div>

                {/* Strek med score-prikker */}
                <div className="px-5 pb-3.5 flex items-center gap-1.5">
                  {['Skulder 73°', 'Hofte 38°', 'Rygg 48°'].map((label) => (
                    <span key={label} className="text-[10px] text-emerald-700/60 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full">{label}</span>
                  ))}
                  <span className="text-[10px] text-black/25 ml-1">+4 forbedringer</span>
                </div>
              </motion.button>

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                onClick={() => !videoFile && fileInputRef.current?.click()}
                className="rounded-3xl border-2 transition-all duration-300 overflow-hidden cursor-pointer"
                style={{
                  borderColor: isDragging ? '#34d399' : 'rgba(0,0,0,0.1)',
                  background: isDragging ? 'rgba(52,211,153,0.06)' : 'rgba(255,255,255,0.65)',
                  backdropFilter: 'blur(20px)',
                  boxShadow: isDragging
                    ? '0 0 0 4px rgba(52,211,153,0.15)'
                    : '0 2px 24px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.9)',
                }}
              >
                <input ref={fileInputRef} type="file" accept="video/mp4,video/quicktime,video/*" onChange={onFileChange} className="hidden" />

                {videoFile ? (
                  /* ── Video klar: vis thumbnail ── */
                  <div className="relative">
                    {thumbnail ? (
                      <img src={thumbnail} alt="Video-forhåndsvisning"
                        className="w-full max-h-64 object-cover" />
                    ) : (
                      <div className="w-full h-48 flex items-center justify-center bg-emerald-50">
                        <Loader2 size={24} className="text-emerald-400 animate-spin" />
                      </div>
                    )}
                    <div className="absolute inset-0"
                      style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%)' }} />
                    {/* Spill-av-ikon indikator */}
                    <div className="absolute top-3 left-3 bg-black/40 backdrop-blur-sm rounded-full px-3 py-1.5 flex items-center gap-1.5 border border-white/20">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-white text-xs font-semibold">Video klar</span>
                    </div>
                    <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
                      <div>
                        <p className="text-white text-sm font-semibold truncate max-w-[200px]">{videoFile.name}</p>
                        <p className="text-white/60 text-xs mt-0.5">{(videoFile.size/1024/1024).toFixed(1)} MB</p>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                        className="text-sm text-white/80 rounded-full px-4 py-1.5 hover:text-white transition-colors font-medium"
                        style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.2)' }}
                      >Bytt</button>
                    </div>
                  </div>
                ) : (
                  /* ── Ingen video: upload-prompt ── */
                  <div className="py-14 flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                      style={{ background: 'rgba(5,150,105,0.1)', border: '1px solid rgba(5,150,105,0.2)' }}>
                      <Upload size={26} className="text-emerald-600" />
                    </div>
                    <div className="text-center space-y-1.5">
                      <p className="text-gray-900 font-semibold text-lg">Trykk for å velge video</p>
                      <p className="text-black/40 text-base">eller dra og slipp her</p>
                    </div>
                    <p className="text-black/25 text-sm tracking-wide">MP4 · MOV · maks 50 MB</p>
                  </div>
                )}
              </div>

              {/* Ball flight selector */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-0.5">
                  <p className="text-sm font-semibold text-black/55">Hva sliter du med?</p>
                  <span className="text-xs text-black/30">Valgfritt</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {BALL_FLIGHT_OPTIONS.map(opt => {
                    const selected = ballFlight.includes(opt.key)
                    return (
                      <button
                        key={opt.key}
                        onClick={() => {
                          if (opt.key === 'vet_ikke') {
                            setBallFlight(selected ? [] : ['vet_ikke'])
                          } else {
                            setBallFlight(prev => {
                              const without = prev.filter(k => k !== 'vet_ikke')
                              return without.includes(opt.key)
                                ? without.filter(k => k !== opt.key)
                                : [...without, opt.key]
                            })
                          }
                        }}
                        className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all"
                        style={{
                          background: selected ? 'rgba(5,150,105,0.1)' : 'rgba(255,255,255,0.7)',
                          border: `1.5px solid ${selected ? 'rgba(5,150,105,0.4)' : 'rgba(0,0,0,0.1)'}`,
                          color: selected ? '#059669' : 'rgba(0,0,0,0.55)',
                          backdropFilter: 'blur(20px)',
                        }}
                      >
                        <span>{opt.emoji}</span>
                        <span>{opt.label}</span>
                        {opt.desc && <span className="text-xs opacity-60 hidden sm:inline">— {opt.desc}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Skill slider */}
              <SkillSlider value={skillLevel} onChange={setSkillLevel} />

              {/* History */}
              {history.length > 0 && (
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-black/30 uppercase tracking-widest flex items-center gap-1.5">
                      <Clock size={11}/> Tidligere analyser
                    </p>
                    <button onClick={() => { setHistory([]); localStorage.removeItem(HISTORY_KEY) }}
                      className="text-sm text-black/25 hover:text-black/50 transition-colors">Slett</button>
                  </div>
                  {history.length >= 2 && (
                    <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{
                      border: `1px solid ${history[0].score > history[1].score ? 'rgba(5,150,105,0.2)' : 'rgba(0,0,0,0.07)'}`,
                      background: history[0].score > history[1].score ? 'rgba(5,150,105,0.06)' : 'rgba(255,255,255,0.6)',
                    }}>
                      <TrendingUp size={14} className={history[0].score >= history[1].score ? 'text-emerald-600' : 'text-rose-500'} />
                      <p className="text-sm text-black/55">
                        {history[0].score > history[1].score
                          ? `+${history[0].score - history[1].score} poeng siden forrige 🎉`
                          : history[0].score < history[1].score
                            ? `${history[0].score - history[1].score} poeng siden forrige`
                            : 'Samme score som sist'}
                      </p>
                    </div>
                  )}
                  <div className="space-y-2">
                    {history.slice(0, 3).map((e, i) => {
                      const prev = history[i + 1]
                      return (
                        <div key={e.id} className="rounded-2xl px-4 py-3"
                          style={{ border: '1px solid rgba(0,0,0,0.07)', background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(20px)' }}>
                          <div className="flex items-center gap-3">
                            <span className={`text-2xl font-bold tabular-nums shrink-0 ${e.score >= 75 ? 'text-emerald-600' : e.score >= 50 ? 'text-amber-500' : 'text-rose-500'}`}>{e.score}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-black/60 text-sm truncate">{e.summary}</p>
                              <p className="text-black/30 text-xs mt-0.5">{new Date(e.date).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                            </div>
                            <span className="text-black/25 text-xs shrink-0">{e.improvements_count} forb.</span>
                          </div>
                          {/* Angle snapshot */}
                          {e.angles && (
                            <div className="flex gap-2 mt-2.5 flex-wrap">
                              {[
                                { label: 'Skulder', val: e.angles.shoulder, prevVal: prev?.angles?.shoulder, ideal: [80, 95] },
                                { label: 'Hofte',   val: e.angles.hip,      prevVal: prev?.angles?.hip,      ideal: [40, 55] },
                                { label: 'Rygg',    val: e.angles.spine,    prevVal: prev?.angles?.spine,    ideal: [35, 45] },
                              ].map(({ label, val, prevVal, ideal }) => {
                                const inRange = val >= ideal[0] && val <= ideal[1]
                                const delta = prevVal != null ? val - prevVal : null
                                return (
                                  <div key={label} className="flex items-center gap-1 rounded-full px-2.5 py-1"
                                    style={{ background: inRange ? 'rgba(5,150,105,0.09)' : 'rgba(0,0,0,0.05)', border: `1px solid ${inRange ? 'rgba(5,150,105,0.2)' : 'rgba(0,0,0,0.07)'}` }}>
                                    <span className="text-[10px] text-black/40">{label}</span>
                                    <span className="text-[11px] font-semibold tabular-nums" style={{ color: inRange ? '#059669' : '#6b7280' }}>{val}°</span>
                                    {delta != null && Math.abs(delta) >= 2 && (
                                      <span className="text-[10px]" style={{ color: delta > 0 ? '#059669' : '#dc2626' }}>
                                        {delta > 0 ? `+${delta}` : delta}
                                      </span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ══════════════════════ PROGRESS ══════════════════════ */}
          {isAnalyzing && (
            <motion.div key="progress" {...fadeUp} className="pt-16 pb-8 space-y-8 text-center">
              <div className="flex flex-col items-center gap-6">
                <div className="relative">
                  <motion.div
                    animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.1, 0.3] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute rounded-full pointer-events-none"
                    style={{ inset: '-28px', background: 'radial-gradient(circle, rgba(5,150,105,0.35) 0%, transparent 70%)' }}
                  />
                  <div className="w-20 h-20 rounded-3xl flex items-center justify-center relative z-10"
                    style={{ background: 'rgba(5,150,105,0.1)', border: '1.5px solid rgba(5,150,105,0.25)', boxShadow: '0 8px 32px rgba(5,150,105,0.15)' }}>
                    <Loader2 size={30} className="text-emerald-600 animate-spin" />
                  </div>
                </div>
                <div>
                  <p className="text-2xl font-bold tracking-tight" style={{ color: '#1d1d1f' }}>{STEPS[currentStepIndex]?.label}</p>
                  <p className="text-black/45 text-base mt-2">{STEPS[currentStepIndex]?.sub}</p>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2">
                {STEPS.map((step, idx) => {
                  const done   = idx < currentStepIndex
                  const active = idx === currentStepIndex
                  return (
                    <div key={step.key} className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 rounded-full px-3.5 py-2 transition-all duration-500 text-sm font-semibold"
                        style={{
                          background: done ? 'rgba(5,150,105,0.1)' : active ? 'rgba(255,255,255,0.8)' : 'transparent',
                          border: `1px solid ${done ? 'rgba(5,150,105,0.3)' : active ? 'rgba(0,0,0,0.1)' : 'transparent'}`,
                          color: done ? '#059669' : active ? '#1d1d1f' : 'rgba(0,0,0,0.25)',
                          boxShadow: active ? '0 2px 16px rgba(0,0,0,0.06)' : 'none',
                        }}>
                        {done ? <CheckCircle2 size={13} />
                          : active ? <motion.div animate={{ scale: [1,1.4,1] }} transition={{ duration: 1, repeat: Infinity }} className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                          : <div className="w-1.5 h-1.5 rounded-full bg-black/15" />
                        }
                        {active && <span>{step.label}</span>}
                      </div>
                      {idx < STEPS.length - 1 && <div className="w-5 h-px bg-black/[0.1]" />}
                    </div>
                  )
                })}
              </div>

              <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.07)' }}>
                <motion.div className="h-full rounded-full"
                  animate={{ width: `${((currentStepIndex + 1) / STEPS.length) * 100}%` }}
                  transition={{ duration: 0.7, ease }}
                  style={{ background: 'linear-gradient(90deg, #059669, #34d399)' }}
                />
              </div>

              <div className="rounded-3xl text-left px-6 py-5"
                style={{ ...glass, border: '1px solid rgba(0,0,0,0.07)' }}>
                <p className="text-xs font-bold text-emerald-600/70 uppercase tracking-widest mb-3">Visste du at...</p>
                <motion.p key={tipIndex}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: tipVisible ? 1 : 0, y: tipVisible ? 0 : -5 }}
                  transition={{ duration: 0.35 }}
                  className="text-black/65 text-base leading-relaxed"
                >{GOLF_TIPS[tipIndex]}</motion.p>
              </div>

              <p className="text-black/30 text-sm">
                {elapsedSeconds > 5 ? `${elapsedSeconds}s · vanligvis 20–40 sekunder` : 'Vanligvis 20–40 sekunder'}
              </p>
            </motion.div>
          )}

          {/* ══════════════════════ RESULTS ══════════════════════ */}
          {stage === 'done' && results && (
            <motion.div key="results" variants={stagger} initial="initial" animate="animate" className="pt-5 space-y-5">

              {/* ── Video replay ── */}
              {previewUrl && (
                <motion.div variants={item} className="space-y-2">
                  <p className="text-xs font-bold text-black/35 uppercase tracking-widest px-0.5">Din sving</p>
                  <div className="rounded-3xl overflow-hidden"
                    style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
                    <video src={previewUrl} className="w-full max-h-72 object-cover bg-black"
                      controls playsInline style={{ display: 'block' }} />
                  </div>
                </motion.div>
              )}

              {/* ── Keyframes ── */}
              {results.keyframes && Object.keys(results.keyframes).length > 0 && (
                <motion.div variants={item} className="space-y-2">
                  <p className="text-xs font-bold text-black/35 uppercase tracking-widest px-0.5">Faser</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    {(['address','backswing_top','impact','follow_through'] as const).map(phase => (
                      results.keyframes[phase] ? (
                        <div key={phase} className="relative rounded-2xl overflow-hidden group"
                          style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                          <img src={`data:image/jpeg;base64,${results.keyframes[phase]}`} alt={PHASE_LABELS[phase]}
                            className="w-full aspect-[3/4] object-cover object-top group-hover:scale-105 transition-transform duration-700" />
                          <div className="absolute inset-0"
                            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%)' }} />
                          <p className="absolute bottom-2.5 left-2.5 text-white text-sm font-semibold">{PHASE_LABELS[phase]}</p>
                        </div>
                      ) : null
                    ))}
                  </div>
                </motion.div>
              )}

              {/* ── Prioritert øvelse (enkel) ── */}
              {results.priority_drill && (
                <motion.div variants={item}>
                  <div className="rounded-3xl px-5 py-5"
                    style={{ background: 'rgba(240,253,244,0.9)', border: '1.5px solid rgba(5,150,105,0.2)', backdropFilter: 'blur(40px)', boxShadow: '0 2px 32px rgba(5,150,105,0.08)' }}>
                    <p className="text-xs font-bold text-emerald-600/60 uppercase tracking-widest mb-2">Gjør dette nå</p>
                    <p className="text-gray-900 font-bold text-xl leading-snug mb-2">{results.priority_drill.name}</p>
                    <p className="text-black/60 text-base leading-relaxed">{results.priority_drill.description}</p>
                  </div>
                </motion.div>
              )}

              {/* ── Toggle: Se full analyse ── */}
              <motion.div variants={item}>
                <button
                  onClick={() => setShowFull(v => !v)}
                  className="w-full py-3.5 rounded-2xl font-semibold text-base transition-all flex items-center justify-center gap-2"
                  style={{
                    background: showFull ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.8)',
                    border: '1px solid rgba(0,0,0,0.1)',
                    color: 'rgba(0,0,0,0.55)',
                    backdropFilter: 'blur(20px)',
                  }}
                >
                  {showFull ? (
                    <><X size={15} /> Skjul detaljer</>
                  ) : (
                    <><TrendingUp size={15} /> Se full analyse</>
                  )}
                </button>
              </motion.div>

              {/* ── Full analyse (skjult som standard) ── */}
              <AnimatePresence>
                {showFull && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.35, ease }}
                    className="space-y-5"
                  >
                    {/* Score */}
                    <div className="rounded-3xl overflow-hidden"
                      style={{ ...glass, border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 4px 40px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.95)' }}>
                      <div className="px-6 pt-7 pb-5">
                        <div className="flex justify-center">
                          <ScoreRing score={score} showInfo={scoreInfoOpen} onToggleInfo={() => setScoreInfoOpen(v => !v)} />
                        </div>
                        <p className="text-black/50 text-base leading-relaxed text-center mt-4 max-w-xs mx-auto">{results.summary}</p>
                      </div>
                      <div className="grid grid-cols-3 divide-x divide-black/[0.06]" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                        {[
                          { label: 'Styrker',      value: results.strengths?.length ?? 0, color: 'text-emerald-600' },
                          { label: 'Forbedringer', value: improvements.length,            color: 'text-amber-500' },
                          { label: 'Øvelse',       value: results.priority_drill ? '1' : '0', color: 'text-blue-600' },
                        ].map(s => (
                          <div key={s.label} className="py-4 flex flex-col items-center gap-0.5">
                            <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
                            <span className="text-black/35 text-sm font-medium">{s.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Styrker */}
                    {results.strengths && results.strengths.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-black/35 uppercase tracking-widest px-0.5">Styrker</p>
                        <div className="rounded-3xl overflow-hidden"
                          style={{ ...glass, border: '1px solid rgba(5,150,105,0.2)' }}>
                          {results.strengths.map((s: string, i: number) => (
                            <div key={i} className={`flex gap-3.5 px-5 py-4 ${i > 0 ? 'border-t border-black/[0.05]' : ''}`}>
                              <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                              <p className="text-black/70 text-base leading-relaxed">{s}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Forbedringer */}
                    {improvements.length > 0 && (
                      <div className="space-y-3">
                        <p className="text-xs font-bold text-black/35 uppercase tracking-widest px-0.5">Forbedringer</p>
                        {improvements.map((imp: any, i: number) => {
                          const cfg = IMPACT_CONFIG[imp.impact as keyof typeof IMPACT_CONFIG] ?? IMPACT_CONFIG.medium
                          return (
                            <div key={i} className="rounded-3xl overflow-hidden"
                              style={{ ...glass, border: '1px solid rgba(0,0,0,0.07)' }}>
                              <div className="flex items-center gap-3.5 px-5 pt-4 pb-3">
                                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                                  style={{ background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.2)' }}>
                                  <span className="text-amber-600 text-sm font-bold">{i + 1}</span>
                                </div>
                                <p className="text-gray-900 font-semibold text-base flex-1">{imp.area}</p>
                                <span className={`text-xs font-semibold border rounded-full px-2.5 py-1 shrink-0 ${cfg.pill}`}>{cfg.label}</span>
                              </div>
                              <div className="px-5 pb-4 space-y-2">
                                <p className="text-black/55 text-sm leading-relaxed">{imp.issue}</p>
                                <div className="rounded-2xl px-4 py-3"
                                  style={{ background: '#f0fdf4', border: '1px solid rgba(5,150,105,0.18)' }}>
                                  <p className="text-emerald-800/85 text-sm leading-relaxed">{imp.tip}</p>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Vinkelmålinger */}
                    {results.measurements && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-black/35 uppercase tracking-widest px-0.5">Vinkelmålinger</p>
                        <div className="rounded-3xl px-5" style={{ ...glass, border: '1px solid rgba(0,0,0,0.08)' }}>
                          {KEY_ANGLES.map(({ phase, key, label, sub, min, max }) => {
                            const val = results.measurements?.[phase]?.[key]
                            return typeof val === 'number' ? (
                              <AngleBar key={`${phase}-${key}`} value={val} min={min} max={max} label={label} sub={sub} />
                            ) : null
                          })}
                        </div>
                        <p className="text-xs text-black/25 text-center px-2">Grønn sone = ideell vinkel for amatørgolfere</p>
                      </div>
                    )}

                    {/* Øvelsedetaljer */}
                    {results.priority_drill && (
                      <div className="rounded-2xl px-4 py-3.5"
                        style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(0,0,0,0.07)', backdropFilter: 'blur(20px)' }}>
                        <div className="flex items-center justify-between">
                          <p className="text-black/50 text-sm font-medium">Øvelsevarighet</p>
                          <span className="text-sm font-semibold text-emerald-700">{results.priority_drill.duration}</span>
                        </div>
                        {improvements[0] && (
                          <p className="text-black/35 text-sm mt-2">
                            Målretter <span className="text-amber-600 font-semibold">{improvements[0].area.toLowerCase()}</span> — forbedringsområdet med størst effekt.
                          </p>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* ══════════════════ FIXED BOTTOM CTA ══════════════════ */}

      <AnimatePresence>
        {stage === 'idle' && !results && (
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.4, ease }} className="fixed bottom-0 inset-x-0 z-30">
            <div className="max-w-xl mx-auto px-5 pb-6 pt-4"
              style={{ background: 'linear-gradient(to top, rgba(245,245,247,0.98) 65%, transparent)' }}>
              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="mb-3 rounded-2xl px-4 py-3 flex items-center gap-2"
                    style={{ background: '#fff5f5', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <AlertCircle size={15} className="text-rose-500 shrink-0" />
                    <p className="text-rose-600 text-sm">{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>
              <motion.button whileTap={{ scale: 0.97 }} onClick={handleAnalyze} disabled={!videoFile}
                className="w-full py-4 rounded-2xl font-bold text-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                style={{
                  background: videoFile ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' : 'rgba(0,0,0,0.07)',
                  color: videoFile ? '#fff' : 'rgba(0,0,0,0.25)',
                  boxShadow: videoFile ? 'inset 0 1px 0 rgba(255,255,255,0.25), 0 8px 32px rgba(5,150,105,0.4)' : 'none',
                }}>
                <span className="flex items-center justify-center gap-2">
                  <Sparkles size={18} className={videoFile ? 'text-white/80' : ''} />
                  Analyser sving
                  {videoFile && <ChevronRight size={16} />}
                </span>
              </motion.button>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {stage === 'done' && results && (
          <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
            transition={{ duration: 0.4, ease }} className="fixed bottom-0 inset-x-0 z-30">
            <div className="max-w-xl mx-auto px-5 pb-6 pt-4"
              style={{ background: 'linear-gradient(to top, rgba(245,245,247,0.98) 65%, transparent)' }}>
              {isDemo ? (
                <div className="space-y-2.5">
                  <motion.button whileTap={{ scale: 0.97 }} onClick={handleReset}
                    className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base text-white"
                    style={{
                      background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 8px 28px rgba(5,150,105,0.35)',
                    }}>
                    <Upload size={17}/> Last opp din video
                  </motion.button>
                  <button onClick={handleReset}
                    className="w-full text-center text-sm text-black/35 hover:text-black/55 transition-colors py-1">
                    ← Tilbake til start
                  </button>
                </div>
              ) : (
                <div className="flex gap-3">
                  <motion.button whileTap={{ scale: 0.96 }} onClick={handleShare}
                    className="flex items-center justify-center gap-2 py-4 px-6 rounded-2xl text-sm font-bold transition-all"
                    style={{
                      border: copied ? '1.5px solid #059669' : '1px solid rgba(0,0,0,0.1)',
                      background: copied ? 'rgba(5,150,105,0.08)' : 'rgba(255,255,255,0.75)',
                      color: copied ? '#059669' : 'rgba(0,0,0,0.5)',
                      backdropFilter: 'blur(20px)',
                      boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
                    }}>
                    {copied ? <Check size={16}/> : <Share2 size={16}/>}
                    {copied ? 'Kopiert!' : 'Del'}
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.97 }} onClick={handleReset}
                    className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base text-white"
                    style={{
                      background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 8px 28px rgba(5,150,105,0.35)',
                    }}>
                    <RotateCcw size={16}/> Analyser ny sving
                  </motion.button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}
