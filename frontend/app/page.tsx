'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, ChevronRight, RotateCcw, CheckCircle2, Loader2,
  TrendingUp, Video, AlertCircle, Share2, X, Clock, Check,
  Sparkles,
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
  high:   { label: 'Høy effekt', pill: 'bg-rose-500/10 border-rose-500/25 text-rose-400' },
  medium: { label: 'Middels',    pill: 'bg-amber-500/10 border-amber-500/25 text-amber-400' },
  low:    { label: 'Lav',        pill: 'bg-slate-500/10 border-slate-500/25 text-slate-400' },
}

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
interface HistoryEntry { id: string; date: string; score: number; summary: string; improvements_count: number }

function loadHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') } catch { return [] }
}

// ─── ScoreRing ────────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const s = 200, r = 82, cx = 100, cy = 100
  const circ   = 2 * Math.PI * r
  const filled = (score / 100) * circ
  const color  = score >= 75 ? '#34d399' : score >= 50 ? '#fbbf24' : '#f87171'
  return (
    <div className="relative inline-flex">
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
        <defs>
          <filter id="rg" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circ - filled}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          filter="url(#rg)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[3.8rem] font-bold tracking-tight text-white tabular-nums leading-none">{score}</span>
        <span className="text-[11px] text-white/30 tracking-[0.18em] uppercase mt-2 font-medium">av 100</span>
      </div>
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
      className="rounded-3xl border border-white/[0.08] overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(40px)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)',
      }}
    >
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-white tracking-tight">Slik filmer du svingen</p>
            <p className="text-xs text-white/35 mt-0.5">For best mulig analyse</p>
          </div>
          <button onClick={onDismiss}
            className="w-7 h-7 rounded-full bg-white/[0.07] border border-white/[0.08] flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
          ><X size={13} /></button>
        </div>

        <div className="rounded-2xl bg-black/30 border border-white/[0.05] overflow-hidden mb-4">
          <svg viewBox="0 0 260 160" className="w-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="gl" cx="50%" cy="40%">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.12"/>
                <stop offset="100%" stopColor="#34d399" stopOpacity="0"/>
              </radialGradient>
            </defs>
            <rect width="260" height="160" fill="url(#gl)" />
            <line x1="20" y1="132" x2="240" y2="132" stroke="rgba(255,255,255,0.07)" strokeWidth="1"/>
            <circle cx="112" cy="52" r="10" fill="none" stroke="#34d399" strokeWidth="1.8"/>
            <line x1="112" y1="62"  x2="112" y2="100" stroke="#34d399" strokeWidth="1.8"/>
            <line x1="112" y1="74"  x2="93"  y2="88"  stroke="#34d399" strokeWidth="1.8"/>
            <line x1="112" y1="74"  x2="131" y2="88"  stroke="#34d399" strokeWidth="1.8"/>
            <line x1="112" y1="100" x2="101" y2="132" stroke="#34d399" strokeWidth="1.8"/>
            <line x1="112" y1="100" x2="123" y2="132" stroke="#34d399" strokeWidth="1.8"/>
            <rect x="178" y="82" width="20" height="32" rx="4" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5"/>
            <rect x="181" y="86" width="14" height="20" rx="1.5" fill="rgba(255,255,255,0.07)"/>
            <circle cx="188" cy="85" r="2.5" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
            <line x1="178" y1="98" x2="146" y2="98" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="3,2"/>
            <polygon points="146,95 140,98 146,101" fill="rgba(255,255,255,0.2)"/>
            <text x="153" y="93" fill="rgba(255,255,255,0.25)" fontSize="8" fontFamily="system-ui">90°</text>
            <line x1="136" y1="120" x2="178" y2="120" stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>
            <line x1="136" y1="116" x2="136" y2="124" stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>
            <line x1="178" y1="116" x2="178" y2="124" stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>
            <text x="157" y="116" textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="7.5" fontFamily="system-ui">2–3 m</text>
            <text x="112" y="148" textAnchor="middle" fill="rgba(52,211,153,0.5)" fontSize="8" fontFamily="system-ui" fontWeight="500">Deg</text>
            <text x="188" y="148" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="8" fontFamily="system-ui">Telefon</text>
          </svg>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {[['🌤','God belysning'],['👤','Hele kroppen i bildet'],['📱','Hold telefonen stabil'],['⏱','5–15 sek er nok']].map(([icon, text]) => (
            <div key={text} className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span className="text-sm">{icon}</span>
              <span className="text-xs text-white/50">{text}</span>
            </div>
          ))}
        </div>

        <button onClick={onDismiss} className="text-[11px] text-white/20 hover:text-white/40 transition-colors">
          Ikke vis igjen
        </button>
      </div>
    </motion.div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function Home() {
  const [videoFile, setVideoFile]   = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [stage, setStage]           = useState<Stage>('idle')
  const [results, setResults]       = useState<any>(null)
  const [error, setError]           = useState<string | null>(null)
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('middels')
  const [history, setHistory]       = useState<HistoryEntry[]>([])
  const [copied, setCopied]         = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [tipIndex, setTipIndex]     = useState(0)
  const [tipVisible, setTipVisible] = useState(true)
  const [onboardingDismissed, setOnboardingDismissed] = useState(true)

  const fileInputRef   = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const progressTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const elapsedTimer   = useRef<ReturnType<typeof setInterval> | null>(null)
  const tipTimer       = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setOnboardingDismissed(localStorage.getItem(ONBOARDING_KEY) === 'true')
    setHistory(loadHistory())
    setTipIndex(Math.floor(Math.random() * GOLF_TIPS.length))
  }, [])

  useEffect(() => { return () => { if (previewUrl) URL.revokeObjectURL(previewUrl) } }, [previewUrl])
  useEffect(() => {
    return () => {
      if (progressTimer.current) clearTimeout(progressTimer.current)
      if (elapsedTimer.current)  clearInterval(elapsedTimer.current)
      if (tipTimer.current)      clearInterval(tipTimer.current)
    }
  }, [])

  const isAnalyzing = ['uploading','analyzing','generating'].includes(stage)
  useEffect(() => {
    if (!isAnalyzing) { if (tipTimer.current) clearInterval(tipTimer.current); return }
    tipTimer.current = setInterval(() => {
      setTipVisible(false)
      setTimeout(() => { setTipIndex(i => (i + 1) % GOLF_TIPS.length); setTipVisible(true) }, 350)
    }, 5500)
    return () => { if (tipTimer.current) clearInterval(tipTimer.current) }
  }, [isAnalyzing])

  const dismissOnboarding = () => { localStorage.setItem(ONBOARDING_KEY, 'true'); setOnboardingDismissed(true) }
  const currentStepIndex  = STEPS.findIndex(s => s.key === stage)

  const pickFile = useCallback((file: File) => {
    if (file.size > 50 * 1024 * 1024) { setError('Videoen er for stor. Maks 50 MB.'); return }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setVideoFile(file); setPreviewUrl(URL.createObjectURL(file)); setError(null); setResults(null)
  }, [previewUrl])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) pickFile(f) }
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) pickFile(f) }

  const handleAnalyze = async () => {
    if (!videoFile) return
    setError(null); setStage('uploading'); setElapsedSeconds(0)
    elapsedTimer.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000)
    try {
      const form = new FormData()
      form.append('file', videoFile)
      form.append('skill_level', skillLevel)
      const res = await axios.post(`${BACKEND_URL}/analyze`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total && e.loaded >= e.total) {
            setStage('analyzing')
            progressTimer.current = setTimeout(() => setStage('generating'), 2000)
          }
        },
      })
      const entry: HistoryEntry = {
        id: Date.now().toString(), date: new Date().toISOString(),
        score: Number(res.data.score ?? 0), summary: res.data.summary ?? '',
        improvements_count: res.data.improvements?.length ?? 0,
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
    setVideoFile(null); setPreviewUrl(null); setResults(null); setError(null); setStage('idle'); setElapsedSeconds(0)
  }

  const handleShare = async () => {
    const text = `Jeg fikk ${results?.score ?? '–'}/100 på Swingman! 🏌️\n${results?.summary ?? ''}\n\nhttps://swingman-six.vercel.app`
    if (navigator.share) { try { await navigator.share({ title: 'Min svingscore', text }) } catch (_) {} }
    else { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500) } catch (_) {} }
  }

  const improvements = results?.improvements ?? []
  const score        = results?.score ?? 70

  const glass = {
    background: 'rgba(255,255,255,0.03)',
    backdropFilter: 'blur(40px)',
    WebkitBackdropFilter: 'blur(40px)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), 0 24px 48px rgba(0,0,0,0.35)',
  } as React.CSSProperties

  return (
    <div className="min-h-dvh font-sans" style={{ background: '#050508' }}>

      {/* ── Ambient light ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-48 left-1/2 -translate-x-1/2 w-[800px] h-[600px]"
          style={{ background: 'radial-gradient(ellipse, rgba(52,211,153,0.08) 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px]"
          style={{ background: 'radial-gradient(ellipse, rgba(99,102,241,0.05) 0%, transparent 70%)' }} />
        <div className="absolute bottom-1/3 -left-32 w-[400px] h-[400px]"
          style={{ background: 'radial-gradient(ellipse, rgba(251,191,36,0.03) 0%, transparent 70%)' }} />
      </div>

      {/* ── Header ── */}
      <header className="relative z-20 sticky top-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(40px)', background: 'rgba(5,5,8,0.8)' }}>
        <div className="max-w-xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #34d399, #059669)', boxShadow: '0 4px 16px rgba(52,211,153,0.4)' }}>
              <span className="text-[14px] leading-none">⛳</span>
            </div>
            <span className="font-semibold text-white tracking-tight text-[15px]">Swingman</span>
          </div>
          {results && (
            <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={handleReset}
              className="flex items-center gap-1.5 text-[13px] text-white/35 hover:text-white/65 transition-colors font-medium">
              <RotateCcw size={13} /> Ny analyse
            </motion.button>
          )}
        </div>
      </header>

      <main className="relative z-10 max-w-xl mx-auto px-5 pb-36">
        <AnimatePresence mode="wait">

          {/* ══════════════════════ UPLOAD ══════════════════════ */}
          {stage === 'idle' && !results && (
            <motion.div key="upload" {...fadeUp} className="pt-6 space-y-4">

              <AnimatePresence>
                {!onboardingDismissed && <FilmingGuide onDismiss={dismissOnboarding} />}
              </AnimatePresence>

              {/* Hero */}
              <div className="pt-2 pb-1">
                <h1 className="text-[2.1rem] font-bold tracking-tight leading-[1.1] text-white">
                  Analyser<br />
                  <span style={{
                    background: 'linear-gradient(135deg, #34d399 0%, #6ee7b7 50%, #a7f3d0 100%)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                  }}>svingen din.</span>
                </h1>
                <p className="text-white/35 mt-2.5 text-[15px] leading-relaxed">
                  Last opp en video og få personlig coaching fra AI.
                </p>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                onClick={() => !previewUrl && fileInputRef.current?.click()}
                className="rounded-3xl border-2 transition-all duration-300 overflow-hidden cursor-pointer"
                style={{
                  borderColor: isDragging ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.07)',
                  background: isDragging ? 'rgba(52,211,153,0.04)' : 'rgba(255,255,255,0.025)',
                  backdropFilter: 'blur(20px)',
                  boxShadow: isDragging
                    ? 'inset 0 1px 0 rgba(52,211,153,0.1), 0 0 40px rgba(52,211,153,0.08)'
                    : 'inset 0 1px 0 rgba(255,255,255,0.06)',
                }}
              >
                <input ref={fileInputRef}   type="file" accept="video/mp4,video/quicktime,video/*" onChange={onFileChange} className="hidden" />
                <input ref={cameraInputRef} type="file" accept="video/*" capture="environment"     onChange={onFileChange} className="hidden" />

                {previewUrl ? (
                  <div className="relative">
                    <video src={previewUrl} className="w-full max-h-60 object-cover" playsInline muted />
                    <div className="absolute inset-0"
                      style={{ background: 'linear-gradient(to top, rgba(5,5,8,0.9) 0%, transparent 50%)' }} />
                    <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
                      <div>
                        <p className="text-white text-sm font-medium truncate max-w-[180px]">{videoFile?.name}</p>
                        <p className="text-white/40 text-xs mt-0.5">{videoFile && (videoFile.size/1024/1024).toFixed(1)} MB</p>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                        className="text-xs text-white/60 rounded-full px-3.5 py-1.5 hover:text-white transition-colors font-medium"
                        style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.15)' }}
                      >Bytt</button>
                    </div>
                  </div>
                ) : (
                  <div className="py-14 flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                      style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.15)' }}>
                      <Upload size={24} className="text-emerald-400" />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-white font-medium text-[15px]">Dra video hit</p>
                      <p className="text-white/35 text-sm">eller velg fra enhet</p>
                    </div>
                    <p className="text-white/18 text-xs tracking-wide">MP4 · MOV · maks 50 MB</p>
                  </div>
                )}
              </div>

              {/* Buttons */}
              {!previewUrl && (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Film nå',  icon: <Video size={14}/>,  ref: cameraInputRef },
                    { label: 'Velg fil', icon: <Upload size={14}/>, ref: fileInputRef },
                  ].map(({ label, icon, ref }) => (
                    <button key={label} onClick={() => ref.current?.click()}
                      className="flex items-center justify-center gap-2 py-3 rounded-2xl text-[13px] font-medium text-white/50 hover:text-white/80 transition-all"
                      style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}
                    >{icon}{label}</button>
                  ))}
                </div>
              )}

              {/* Skill level */}
              <div className="space-y-2.5">
                <p className="text-[11px] text-white/30 font-semibold uppercase tracking-widest">Ditt spillnivå</p>
                <div className="flex gap-2">
                  {([['nybegynner','🌱','Nybegynner'],['middels','⛳','Middels'],['avansert','🏆','Avansert']] as const).map(([level, emoji, label]) => (
                    <button key={level} onClick={() => setSkillLevel(level)}
                      className="flex-1 py-3 rounded-2xl text-[13px] font-medium transition-all duration-200"
                      style={{
                        border: skillLevel === level ? '1px solid rgba(52,211,153,0.35)' : '1px solid rgba(255,255,255,0.06)',
                        background: skillLevel === level ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.02)',
                        color: skillLevel === level ? '#34d399' : 'rgba(255,255,255,0.28)',
                        boxShadow: skillLevel === level ? '0 0 20px rgba(52,211,153,0.08)' : 'none',
                      }}
                    >{emoji} {label}</button>
                  ))}
                </div>
              </div>

              {/* History */}
              {history.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-white/25 font-semibold uppercase tracking-widest flex items-center gap-1.5">
                      <Clock size={10}/> Tidligere
                    </p>
                    <button onClick={() => { setHistory([]); localStorage.removeItem(HISTORY_KEY) }}
                      className="text-[11px] text-white/18 hover:text-white/38 transition-colors">Slett</button>
                  </div>
                  {history.length >= 2 && (
                    <div className="rounded-2xl px-4 py-3 flex items-center gap-2.5" style={{
                      border: `1px solid ${history[0].score > history[1].score ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.05)'}`,
                      background: history[0].score > history[1].score ? 'rgba(52,211,153,0.04)' : 'rgba(255,255,255,0.02)',
                    }}>
                      <TrendingUp size={12} className={history[0].score >= history[1].score ? 'text-emerald-400' : 'text-rose-400'} />
                      <p className="text-[12px] text-white/40">
                        {history[0].score > history[1].score
                          ? `+${history[0].score - history[1].score} poeng siden forrige 🎉`
                          : history[0].score < history[1].score
                            ? `${history[0].score - history[1].score} poeng siden forrige`
                            : 'Samme score som sist'}
                      </p>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {history.slice(0, 3).map((e) => (
                      <div key={e.id} className="flex items-center gap-3 rounded-2xl px-4 py-3"
                        style={{ border: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.02)' }}>
                        <span className={`text-xl font-bold tabular-nums shrink-0 ${e.score >= 75 ? 'text-emerald-400' : e.score >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>{e.score}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white/45 text-[12px] truncate">{e.summary}</p>
                          <p className="text-white/20 text-[10px] mt-0.5">{new Date(e.date).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        </div>
                        <span className="text-white/18 text-[10px] shrink-0">{e.improvements_count} forb.</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ══════════════════════ PROGRESS ══════════════════════ */}
          {isAnalyzing && (
            <motion.div key="progress" {...fadeUp} className="pt-16 pb-8 space-y-10 text-center">

              {/* Pulsing orb + spinner */}
              <div className="flex flex-col items-center gap-6">
                <div className="relative">
                  <motion.div
                    animate={{ scale: [1, 1.15, 1], opacity: [0.35, 0.12, 0.35] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute rounded-full pointer-events-none"
                    style={{ inset: '-24px', background: 'radial-gradient(circle, rgba(52,211,153,0.45) 0%, transparent 70%)' }}
                  />
                  <div className="w-20 h-20 rounded-3xl flex items-center justify-center relative z-10"
                    style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', boxShadow: '0 0 40px rgba(52,211,153,0.15)' }}>
                    <Loader2 size={30} className="text-emerald-400 animate-spin" />
                  </div>
                </div>
                <div>
                  <p className="text-white font-bold text-2xl tracking-tight">{STEPS[currentStepIndex]?.label}</p>
                  <p className="text-white/35 text-[14px] mt-1.5">{STEPS[currentStepIndex]?.sub}</p>
                </div>
              </div>

              {/* Step pills */}
              <div className="flex items-center justify-center gap-2">
                {STEPS.map((step, idx) => {
                  const done   = idx < currentStepIndex
                  const active = idx === currentStepIndex
                  return (
                    <div key={step.key} className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all duration-500 text-[12px] font-medium"
                        style={{
                          background: done ? 'rgba(52,211,153,0.1)' : active ? 'rgba(255,255,255,0.06)' : 'transparent',
                          border: `1px solid ${done ? 'rgba(52,211,153,0.25)' : active ? 'rgba(255,255,255,0.1)' : 'transparent'}`,
                          color: done ? '#34d399' : active ? 'white' : 'rgba(255,255,255,0.2)',
                        }}>
                        {done
                          ? <CheckCircle2 size={11} />
                          : active
                            ? <motion.div animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 1, repeat: Infinity }} className="w-1.5 h-1.5 rounded-full bg-white" />
                            : <div className="w-1.5 h-1.5 rounded-full bg-white/15" />
                        }
                        {active && <span>{step.label}</span>}
                      </div>
                      {idx < STEPS.length - 1 && <div className="w-5 h-px bg-white/[0.07]" />}
                    </div>
                  )
                })}
              </div>

              {/* Progress bar */}
              <div className="h-px rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <motion.div className="h-full rounded-full"
                  animate={{ width: `${((currentStepIndex + 1) / STEPS.length) * 100}%` }}
                  transition={{ duration: 0.7, ease }}
                  style={{ background: 'linear-gradient(90deg, #10b981, #34d399)' }}
                />
              </div>

              {/* Tips */}
              <div className="rounded-3xl text-left px-6 py-5"
                style={{ ...glass, border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-[10px] font-bold text-emerald-400/60 uppercase tracking-[0.18em] mb-3">Visste du at...</p>
                <motion.p key={tipIndex}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: tipVisible ? 1 : 0, y: tipVisible ? 0 : -5 }}
                  transition={{ duration: 0.35 }}
                  className="text-white/65 text-[15px] leading-relaxed font-light"
                >{GOLF_TIPS[tipIndex]}</motion.p>
              </div>

              <p className="text-white/20 text-xs">
                {elapsedSeconds > 5 ? `${elapsedSeconds}s · vanligvis 20–40 sekunder` : 'Vanligvis 20–40 sekunder'}
              </p>
            </motion.div>
          )}

          {/* ══════════════════════ RESULTS ══════════════════════ */}
          {stage === 'done' && results && (
            <motion.div key="results" variants={stagger} initial="initial" animate="animate" className="pt-5 space-y-5">

              {/* Score card */}
              <motion.div variants={item} className="rounded-3xl overflow-hidden text-center"
                style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(40px)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.09), 0 32px 64px rgba(0,0,0,0.4)' }}>
                <div className="px-6 pt-7 pb-5">
                  <p className="text-[10px] font-bold text-emerald-400/60 uppercase tracking-[0.2em] mb-5">Din svingscore</p>
                  <div className="flex justify-center mb-4">
                    <ScoreRing score={score} />
                  </div>
                  <p className="text-white font-bold text-xl tracking-tight mb-2">
                    {score >= 80 ? 'Utmerket teknikk 🏌️' : score >= 65 ? 'Godt grunnlag 👍' : score >= 50 ? 'Under utvikling 📈' : 'Begynner 🌱'}
                  </p>
                  <p className="text-white/45 text-[14px] leading-relaxed max-w-xs mx-auto">{results.summary}</p>
                </div>
                <div className="grid grid-cols-3 divide-x divide-white/[0.05]" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  {[
                    { label: 'Styrker',      value: results.strengths?.length ?? 0, color: 'text-emerald-400' },
                    { label: 'Forbedringer', value: improvements.length,            color: 'text-amber-400' },
                    { label: 'Øvelse',       value: results.priority_drill ? '1' : '0', color: 'text-blue-400' },
                  ].map(s => (
                    <div key={s.label} className="py-4 flex flex-col items-center gap-0.5">
                      <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
                      <span className="text-white/28 text-[11px] font-medium">{s.label}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Keyframes */}
              {results.keyframes && Object.keys(results.keyframes).length > 0 && (
                <motion.div variants={item} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold text-white/28 uppercase tracking-widest">Nøkkelbilder</p>
                    {improvements.length > 0 && (
                      <p className="text-[10px] text-rose-400/50 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block"/> forbedringsområde
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {(['address','backswing_top','impact','follow_through'] as const).map(phase => {
                      const phaseIssues = improvements.filter((i: any) => i.phase === phase)
                      return results.keyframes[phase] ? (
                        <motion.div key={phase} variants={item}>
                          <div className="relative rounded-2xl overflow-hidden group"
                            style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                            <img src={`data:image/jpeg;base64,${results.keyframes[phase]}`} alt={PHASE_LABELS[phase]}
                              className="w-full aspect-[3/4] object-cover object-top group-hover:scale-105 transition-transform duration-700" />
                            <div className="absolute inset-0"
                              style={{ background: 'linear-gradient(to top, rgba(5,5,8,0.8) 0%, transparent 55%)' }} />
                            <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-end justify-between">
                              <p className="text-white text-[12px] font-semibold">{PHASE_LABELS[phase]}</p>
                              {phaseIssues.length > 0
                                ? <span className="w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center"
                                    style={{ boxShadow: '0 2px 12px rgba(239,68,68,0.5)' }}>
                                    <span className="text-white text-[10px] font-bold">{phaseIssues.length}</span>
                                  </span>
                                : <span className="text-emerald-400 text-[11px] font-semibold">✓</span>
                              }
                            </div>
                          </div>
                          {phaseIssues.length > 0 && (
                            <p className="text-rose-400/55 text-[10px] mt-1.5 leading-tight line-clamp-1">
                              {phaseIssues[0].area}{phaseIssues.length > 1 ? ` +${phaseIssues.length - 1}` : ''}
                            </p>
                          )}
                        </motion.div>
                      ) : null
                    })}
                  </div>
                </motion.div>
              )}

              {/* Styrker */}
              {results.strengths && results.strengths.length > 0 && (
                <motion.div variants={item} className="space-y-3">
                  <p className="text-[11px] font-bold text-white/28 uppercase tracking-widest">Styrker</p>
                  <div className="rounded-3xl overflow-hidden"
                    style={{ ...glass, border: '1px solid rgba(52,211,153,0.12)' }}>
                    {results.strengths.map((s: string, i: number) => (
                      <div key={i} className={`flex gap-4 px-5 py-4 ${i > 0 ? 'border-t border-white/[0.04]' : ''}`}>
                        <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                          style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.2)' }}>
                          <CheckCircle2 size={13} className="text-emerald-400" />
                        </div>
                        <p className="text-white/70 text-[14px] leading-relaxed">{s}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Forbedringer */}
              {improvements.length > 0 && (
                <motion.div variants={item} className="space-y-3">
                  <p className="text-[11px] font-bold text-white/28 uppercase tracking-widest">Forbedringer</p>
                  <div className="space-y-3">
                    {improvements.map((imp: any, i: number) => {
                      const cfg = IMPACT_CONFIG[imp.impact as keyof typeof IMPACT_CONFIG] ?? IMPACT_CONFIG.medium
                      return (
                        <motion.div key={i} variants={item} className="rounded-3xl overflow-hidden"
                          style={{ ...glass, border: '1px solid rgba(255,255,255,0.07)' }}>
                          <div className="flex items-center gap-3.5 px-5 pt-5 pb-4">
                            <div className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0"
                              style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.18)' }}>
                              <span className="text-amber-400 text-sm font-bold">{i + 1}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-semibold text-[15px] leading-tight">{imp.area}</p>
                              {imp.phase && <p className="text-white/28 text-[11px] mt-0.5">📍 {PHASE_LABELS[imp.phase] ?? imp.phase}</p>}
                            </div>
                            <span className={`text-[10px] font-semibold border rounded-full px-2.5 py-1 shrink-0 ${cfg.pill}`}>{cfg.label}</span>
                          </div>
                          <div className="border-t border-white/[0.04]">
                            <div className="mx-4 mt-4 mb-2 rounded-2xl px-4 py-3"
                              style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}>
                              <p className="text-[9px] font-bold text-rose-400/60 uppercase tracking-[0.15em] mb-1.5">Utfordring</p>
                              <p className="text-rose-300/75 text-[13px] leading-relaxed">{imp.issue}</p>
                            </div>
                            <div className="mx-4 mt-2 mb-4 rounded-2xl px-4 py-3"
                              style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.12)' }}>
                              <p className="text-[9px] font-bold text-emerald-400/60 uppercase tracking-[0.15em] mb-1.5">Instruktørens råd</p>
                              <p className="text-emerald-300/85 text-[13px] leading-relaxed">{imp.tip}</p>
                            </div>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                </motion.div>
              )}

              {/* Øvelse */}
              {results.priority_drill && (
                <motion.div variants={item} className="space-y-3">
                  <p className="text-[11px] font-bold text-white/28 uppercase tracking-widest">Prioritert øvelse</p>
                  <div className="rounded-3xl overflow-hidden"
                    style={{ background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.15)', boxShadow: 'inset 0 1px 0 rgba(52,211,153,0.08)' }}>
                    <div className="px-5 pt-6 pb-4 flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] font-bold text-emerald-400/50 uppercase tracking-[0.18em] mb-2">Øvelse</p>
                        <p className="text-white font-bold text-2xl tracking-tight leading-tight">{results.priority_drill.name}</p>
                      </div>
                      <div className="shrink-0 flex flex-col items-center rounded-2xl px-3.5 py-2.5"
                        style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.2)' }}>
                        <span className="text-emerald-400 text-xl font-bold leading-none">
                          {results.priority_drill.duration?.split(' ')[0] ?? '—'}
                        </span>
                        <span className="text-emerald-400/50 text-[9px] font-medium mt-0.5 uppercase tracking-wide">
                          {results.priority_drill.duration?.split(' ').slice(1).join(' ') || 'min'}
                        </span>
                      </div>
                    </div>
                    <div className="px-5 pb-5" style={{ borderTop: '1px solid rgba(52,211,153,0.1)' }}>
                      <p className="text-[9px] font-bold text-white/25 uppercase tracking-[0.15em] mb-2 pt-4">Slik gjør du det</p>
                      <p className="text-white/62 text-[14px] leading-relaxed">{results.priority_drill.description}</p>
                    </div>
                    {improvements[0] && (
                      <div className="mx-4 mb-4 rounded-2xl px-4 py-3"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <p className="text-white/30 text-[12px] leading-relaxed">
                          🎯 Målretter <span className="text-amber-400/80">{improvements[0].area.toLowerCase()}</span> — forbedringsområdet med størst potensiell effekt.
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="rounded-2xl px-4 py-3 text-center"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <p className="text-white/25 text-[12px] leading-relaxed">
                      🔁 Gjenta <strong className="text-white/40">3–5 ganger per treningsøkt</strong> for å bygge muskelminne.
                    </p>
                  </div>
                </motion.div>
              )}

            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* ══════════════════ FIXED BOTTOM CTA ══════════════════ */}

      {/* Upload */}
      <AnimatePresence>
        {stage === 'idle' && !results && (
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.4, ease }} className="fixed bottom-0 inset-x-0 z-30">
            <div className="max-w-xl mx-auto px-5 pb-6 pt-4"
              style={{ background: 'linear-gradient(to top, #050508 60%, transparent)' }}>
              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="mb-3 rounded-2xl px-4 py-3 flex items-center gap-2"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}>
                    <AlertCircle size={14} className="text-rose-400 shrink-0" />
                    <p className="text-rose-400 text-[13px]">{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>
              <motion.button whileTap={{ scale: 0.97 }} onClick={handleAnalyze} disabled={!videoFile}
                className="w-full py-4 rounded-2xl font-semibold text-[16px] disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                style={{
                  background: videoFile ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'rgba(255,255,255,0.05)',
                  color: videoFile ? '#fff' : 'rgba(255,255,255,0.18)',
                  boxShadow: videoFile ? 'inset 0 1px 0 rgba(255,255,255,0.2), 0 8px 32px rgba(16,185,129,0.45)' : 'none',
                }}>
                <span className="flex items-center justify-center gap-2">
                  <Sparkles size={16} className={videoFile ? 'text-white/80' : ''} />
                  Analyser sving
                  {videoFile && <ChevronRight size={15} />}
                </span>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      <AnimatePresence>
        {stage === 'done' && results && (
          <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
            transition={{ duration: 0.4, ease }} className="fixed bottom-0 inset-x-0 z-30">
            <div className="max-w-xl mx-auto px-5 pb-6 pt-4"
              style={{ background: 'linear-gradient(to top, #050508 65%, transparent)' }}>
              <div className="flex gap-3">
                <motion.button whileTap={{ scale: 0.96 }} onClick={handleShare}
                  className="flex items-center justify-center gap-2 py-4 px-6 rounded-2xl text-[14px] font-semibold transition-all"
                  style={{
                    border: copied ? '1px solid rgba(52,211,153,0.3)' : '1px solid rgba(255,255,255,0.08)',
                    background: copied ? 'rgba(52,211,153,0.08)' : 'rgba(255,255,255,0.04)',
                    color: copied ? '#34d399' : 'rgba(255,255,255,0.5)',
                    backdropFilter: 'blur(20px)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
                  }}>
                  {copied ? <Check size={15}/> : <Share2 size={15}/>}
                  {copied ? 'Kopiert!' : 'Del'}
                </motion.button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleReset}
                  className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold text-[15px] text-white"
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 28px rgba(16,185,129,0.4)',
                  }}>
                  <RotateCcw size={15}/> Analyser ny sving
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}
