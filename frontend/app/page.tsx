'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, ChevronRight, RotateCcw, CheckCircle2, Loader2,
  Trophy, Zap, TrendingUp, Video, ImageIcon, Target, AlertCircle,
  ChevronDown, Share2, X
} from 'lucide-react'
import axios from 'axios'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
const ONBOARDING_KEY = 'swingman_onboarding_dismissed'

const PHASE_LABELS: Record<string, string> = {
  address: 'Adresse',
  backswing_top: 'Backswing',
  impact: 'Impact',
  follow_through: 'Follow-through',
}

const IMPACT_CONFIG = {
  high:   { label: 'Høy effekt',   color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
  medium: { label: 'Middels',      color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20' },
  low:    { label: 'Lav effekt',   color: 'text-slate-400',  bg: 'bg-slate-500/10 border-slate-500/20' },
}

type Stage = 'idle' | 'uploading' | 'analyzing' | 'generating' | 'done'
type ResultTab = 'photos' | 'strengths' | 'improvements' | 'drill'

const STEPS = [
  { key: 'uploading',  label: 'Laster opp video',         sub: 'Sender fil til server...' },
  { key: 'analyzing',  label: 'Analyserer bevegelse',      sub: 'Identifiserer 33 kroppspunkter...' },
  { key: 'generating', label: 'Genererer coaching',        sub: 'AI-instruktøren analyserer svingen...' },
]

const easing = [0.22, 1, 0.36, 1] as [number, number, number, number]
const fadeUp = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.4, ease: easing } }
const stagger = { animate: { transition: { staggerChildren: 0.07 } } }
const item = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, ease: easing } }

function ScoreArc({ score }: { score: number }) {
  const r = 52
  const circ = 2 * Math.PI * r
  const filled = (score / 100) * circ * 0.75
  const color = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444'

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="140" height="100" viewBox="0 0 140 100">
        <path
          d="M 14 90 A 56 56 0 1 1 126 90"
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" strokeLinecap="round"
        />
        <path
          d="M 14 90 A 56 56 0 1 1 126 90"
          fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${filled} ${circ}`}
          strokeDashoffset={0}
          style={{ filter: `drop-shadow(0 0 8px ${color}88)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center mt-2">
        <span className="text-4xl font-bold text-white tabular-nums">{score}</span>
        <span className="text-xs text-white/40 -mt-0.5">av 100</span>
      </div>
    </div>
  )
}

export default function Home() {
  const [videoFile, setVideoFile]       = useState<File | null>(null)
  const [previewUrl, setPreviewUrl]     = useState<string | null>(null)
  const [isDragging, setIsDragging]     = useState(false)
  const [stage, setStage]               = useState<Stage>('idle')
  const [results, setResults]           = useState<any>(null)
  const [error, setError]               = useState<string | null>(null)
  const [activeTab, setActiveTab]       = useState<ResultTab>('photos')
  const [showAllImprovements, setShowAllImprovements] = useState(false)
  const [onboardingDismissed, setOnboardingDismissed] = useState(true)
  const fileInputRef    = useRef<HTMLInputElement>(null)
  const cameraInputRef  = useRef<HTMLInputElement>(null)
  const progressTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setOnboardingDismissed(localStorage.getItem(ONBOARDING_KEY) === 'true')
  }, [])

  const dismissOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true')
    setOnboardingDismissed(true)
  }

  const currentStepIndex = STEPS.findIndex(s => s.key === stage)
  const isAnalyzing = ['uploading', 'analyzing', 'generating'].includes(stage)

  const pickFile = useCallback((file: File) => {
    if (file.size > 50 * 1024 * 1024) { setError('Videoen er for stor. Maks 50MB.'); return }
    if (!['video/mp4', 'video/quicktime', 'video/mov', 'video/avi', 'video/webm'].includes(file.type) && !file.name.match(/\.(mp4|mov|avi|webm)$/i)) {
      setError('Kun MP4, MOV, AVI og WebM støttes.'); return
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setVideoFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setError(null)
    setResults(null)
  }, [previewUrl])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) pickFile(f)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const f = e.dataTransfer.files?.[0]; if (f) pickFile(f)
  }

  const handleAnalyze = async () => {
    if (!videoFile) return
    setError(null); setStage('uploading'); setActiveTab('photos')
    try {
      const form = new FormData()
      form.append('file', videoFile)
      const res = await axios.post(`${BACKEND_URL}/analyze`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total && e.loaded >= e.total) {
            setStage('analyzing')
            progressTimer.current = setTimeout(() => setStage('generating'), 8000)
          }
        },
      })
      setResults(res.data)
      setStage('done')
    } catch (err: any) {
      if (progressTimer.current) clearTimeout(progressTimer.current)
      setError(err.response?.data?.detail || 'Analyse feilet. Prøv igjen.')
      setStage('idle')
    }
  }

  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setVideoFile(null); setPreviewUrl(null)
    setResults(null); setError(null)
    setStage('idle'); setShowAllImprovements(false)
  }

  const improvements = results?.improvements ?? []
  const visibleImprovements = showAllImprovements ? improvements : improvements.slice(0, 2)

  const tabs: { key: ResultTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'photos',       label: 'Bilder',     icon: <ImageIcon size={14} /> },
    { key: 'strengths',    label: 'Styrker',    icon: <TrendingUp size={14} /> },
    { key: 'improvements', label: 'Forbedring', icon: <Target size={14} />, badge: improvements.length },
    { key: 'drill',        label: 'Øvelse',     icon: <Trophy size={14} /> },
  ]

  return (
    <div className="min-h-dvh bg-[#080810] font-sans">

      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-green-500/8 blur-[100px]" />
      </div>

      {/* Header */}
      <header className="relative z-20 border-b border-white/[0.06] bg-[#080810]/90 backdrop-blur-xl sticky top-0">
        <div className="max-w-xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/40">
              <span className="text-sm leading-none">⛳</span>
            </div>
            <span className="font-semibold text-white tracking-tight">Swingman</span>
          </div>
          {results && (
            <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              onClick={handleReset}
              className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/80 transition-colors"
            >
              <RotateCcw size={13} /> Ny analyse
            </motion.button>
          )}
        </div>
      </header>

      <main className="relative z-10 max-w-xl mx-auto px-5 pb-32">
        <AnimatePresence mode="wait">

          {/* ── UPLOAD ── */}
          {stage === 'idle' && !results && (
            <motion.div key="upload" {...fadeUp} className="pt-6 space-y-4">

              {/* Onboarding */}
              <AnimatePresence>
                {!onboardingDismissed && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="rounded-2xl border border-green-500/20 bg-green-500/5 p-4"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <p className="text-sm font-semibold text-green-400">Slik får du best analyse</p>
                      <button onClick={dismissOnboarding} className="text-white/30 hover:text-white/60 transition-colors -mt-0.5">
                        <X size={15} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {[
                        ['📐', 'Film fra siden (90°)'],
                        ['🌤', 'God belysning'],
                        ['👤', 'Hele kroppen i bildet'],
                        ['⏱', '5–15 sekunder er nok'],
                      ].map(([icon, text]) => (
                        <div key={text} className="flex items-center gap-2 text-xs text-white/60">
                          <span>{icon}</span><span>{text}</span>
                        </div>
                      ))}
                    </div>
                    <button onClick={dismissOnboarding}
                      className="text-xs text-white/30 hover:text-white/50 transition-colors">
                      Ikke vis igjen
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Hero */}
              <div className="text-center py-1">
                <h1 className="text-[2rem] font-bold tracking-tight leading-tight">
                  <span className="bg-gradient-to-r from-green-400 via-green-300 to-emerald-400 bg-clip-text text-transparent">
                    AI-drevet
                  </span>{' '}
                  <span className="text-white">golfcoach</span>
                </h1>
                <p className="text-white/40 mt-2 text-sm">Last opp en video og få profesjonelle råd</p>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                className={`rounded-2xl border-2 border-dashed transition-all duration-200 overflow-hidden cursor-pointer
                  ${isDragging ? 'border-green-500/60 bg-green-500/5' : 'border-white/[0.08] hover:border-white/20'}`}
                onClick={() => !previewUrl && fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept="video/mp4,video/quicktime,video/*" onChange={onFileChange} className="hidden" />
                <input ref={cameraInputRef} type="file" accept="video/*" capture="environment" onChange={onFileChange} className="hidden" />

                {previewUrl ? (
                  <div className="relative">
                    <video src={previewUrl} className="w-full max-h-56 object-cover" playsInline muted />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                      <div>
                        <p className="text-white text-sm font-medium truncate max-w-[180px]">{videoFile?.name}</p>
                        <p className="text-white/50 text-xs">{videoFile && (videoFile.size / 1024 / 1024).toFixed(1)} MB</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                        className="text-xs text-white/60 border border-white/20 rounded-full px-3 py-1 hover:bg-white/10 transition-colors backdrop-blur-sm"
                      >
                        Bytt video
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                      <Upload size={22} className="text-green-400" />
                    </div>
                    <div className="text-center">
                      <p className="text-white font-medium text-sm">Dra video hit</p>
                      <p className="text-white/40 text-xs mt-1">eller velg fra enhet</p>
                    </div>
                    <p className="text-white/20 text-xs">MP4 · MOV · maks 50 MB</p>
                  </div>
                )}
              </div>

              {/* Upload buttons */}
              {!previewUrl && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl border border-white/10 text-white/60 hover:text-white hover:border-white/20 text-sm font-medium transition-all"
                  >
                    <Video size={15} />Film nå
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl border border-white/10 text-white/60 hover:text-white hover:border-white/20 text-sm font-medium transition-all"
                  >
                    <Upload size={15} />Velg fil
                  </button>
                </div>
              )}

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 flex items-center gap-2"
                  >
                    <AlertCircle size={15} className="text-red-400 shrink-0" />
                    <p className="text-red-400 text-sm">{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Analyse button */}
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleAnalyze}
                disabled={!videoFile}
                className="w-full py-4 rounded-2xl font-semibold text-base transition-all duration-200 disabled:opacity-25 disabled:cursor-not-allowed"
                style={{
                  background: videoFile ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'rgba(255,255,255,0.06)',
                  color: videoFile ? '#fff' : 'rgba(255,255,255,0.3)',
                  boxShadow: videoFile ? '0 4px 20px rgba(34,197,94,0.35)' : 'none',
                }}
              >
                <span className="flex items-center justify-center gap-2">
                  <Zap size={17} className={videoFile ? 'fill-white' : ''} />
                  Analyser sving
                  {videoFile && <ChevronRight size={15} />}
                </span>
              </motion.button>
            </motion.div>
          )}

          {/* ── PROGRESS ── */}
          {isAnalyzing && (
            <motion.div key="progress" {...fadeUp} className="pt-12 space-y-8">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/20 mb-5">
                  <Loader2 size={26} className="text-green-400 animate-spin" />
                </div>
                <p className="text-white font-semibold text-lg">{STEPS[currentStepIndex]?.label}</p>
                <p className="text-white/40 text-sm mt-1">{STEPS[currentStepIndex]?.sub}</p>
              </div>

              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 space-y-4">
                {STEPS.map((step, idx) => {
                  const done = idx < currentStepIndex
                  const active = idx === currentStepIndex
                  return (
                    <div key={step.key} className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-500 ${
                        done   ? 'bg-green-500 shadow-lg shadow-green-500/30'
                        : active ? 'bg-green-500/15 border-2 border-green-500'
                        :          'bg-white/5 border border-white/10'
                      }`}>
                        {done
                          ? <CheckCircle2 size={15} className="text-white" />
                          : active
                            ? <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                            : <span className="text-white/20 text-xs">{idx + 1}</span>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${done ? 'text-green-400' : active ? 'text-white' : 'text-white/25'}`}>
                          {step.label}
                        </p>
                      </div>
                      {active && (
                        <div className="flex gap-1">
                          {[0,1,2].map(i => (
                            <motion.div key={i}
                              animate={{ opacity: [0.2, 1, 0.2] }}
                              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                              className="w-1.5 h-1.5 rounded-full bg-green-500"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Progress bar */}
              <div className="h-px rounded-full bg-white/[0.05] overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-green-600 via-green-400 to-green-600"
                  animate={{ width: `${((currentStepIndex + 1) / STEPS.length) * 100}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              </div>
              <p className="text-center text-white/25 text-xs">Vanligvis 20–40 sekunder</p>
            </motion.div>
          )}

          {/* ── RESULTS ── */}
          {stage === 'done' && results && (
            <motion.div key="results" variants={stagger} initial="initial" animate="animate" className="pt-5 space-y-4">

              {/* Score card */}
              <motion.div variants={item}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 text-center"
                style={{ boxShadow: '0 0 40px rgba(34,197,94,0.08)' }}
              >
                <ScoreArc score={results.score ?? 70} />
                <p className="text-white/70 text-sm mt-3 leading-relaxed max-w-xs mx-auto">{results.summary}</p>
              </motion.div>

              {/* Tabs */}
              <motion.div variants={item} className="flex gap-1 rounded-xl bg-white/[0.04] p-1">
                {tabs.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all duration-200 relative ${
                      activeTab === tab.key
                        ? 'bg-white/10 text-white shadow-sm'
                        : 'text-white/40 hover:text-white/70'
                    }`}
                  >
                    {tab.icon}
                    <span className="hidden sm:inline">{tab.label}</span>
                    {tab.badge && tab.badge > 0 && (
                      <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold ${
                        activeTab === tab.key ? 'bg-green-500 text-white' : 'bg-white/10 text-white/50'
                      }`}>
                        {tab.badge}
                      </span>
                    )}
                  </button>
                ))}
              </motion.div>

              {/* Tab content */}
              <AnimatePresence mode="wait">

                {/* Photos tab */}
                {activeTab === 'photos' && (
                  <motion.div key="photos" {...fadeUp}>
                    {results.keyframes && Object.keys(results.keyframes).length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {(['address','backswing_top','impact','follow_through'] as const).map(phase =>
                          results.keyframes[phase] ? (
                            <motion.div key={phase} variants={item}
                              className="relative rounded-xl overflow-hidden border border-white/[0.06] group"
                            >
                              <img
                                src={`data:image/jpeg;base64,${results.keyframes[phase]}`}
                                alt={PHASE_LABELS[phase]}
                                className="w-full aspect-[4/3] object-cover group-hover:scale-105 transition-transform duration-500"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                              {/* Phase badge */}
                              <span className="absolute top-2 left-2 text-[10px] font-semibold bg-black/50 text-white/80 rounded-full px-2 py-0.5 backdrop-blur-sm">
                                {PHASE_LABELS[phase]}
                              </span>
                              {/* Highlight improvements for this phase */}
                              {improvements.filter((i: any) => i.phase === phase).length > 0 && (
                                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center shadow-lg">
                                  <span className="text-white text-[10px] font-bold">
                                    {improvements.filter((i: any) => i.phase === phase).length}
                                  </span>
                                </div>
                              )}
                            </motion.div>
                          ) : null
                        )}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-white/[0.06] p-8 text-center text-white/30 text-sm">
                        Ingen bilder tilgjengelig
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Strengths tab */}
                {activeTab === 'strengths' && (
                  <motion.div key="strengths" {...fadeUp} className="space-y-2">
                    {results.strengths?.map((s: string, i: number) => (
                      <motion.div key={i} variants={item}
                        className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3"
                      >
                        <CheckCircle2 size={16} className="text-green-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-white/80 leading-relaxed">{s}</p>
                      </motion.div>
                    ))}
                  </motion.div>
                )}

                {/* Improvements tab */}
                {activeTab === 'improvements' && (
                  <motion.div key="improvements" {...fadeUp} className="space-y-3">
                    {visibleImprovements.map((imp: any, i: number) => {
                      const impact = IMPACT_CONFIG[imp.impact as keyof typeof IMPACT_CONFIG] ?? IMPACT_CONFIG.medium
                      return (
                        <motion.div key={i} variants={item}
                          className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-md bg-amber-500/20 flex items-center justify-center text-amber-400 text-xs font-bold shrink-0">
                                {i + 1}
                              </span>
                              <p className="text-sm font-semibold text-white">{imp.area}</p>
                            </div>
                            <span className={`text-[10px] font-semibold border rounded-full px-2 py-0.5 shrink-0 ${impact.bg} ${impact.color}`}>
                              {impact.label}
                            </span>
                          </div>
                          {imp.phase && (
                            <p className="text-[11px] text-white/30 mb-2">
                              📍 {PHASE_LABELS[imp.phase] ?? imp.phase}
                            </p>
                          )}
                          <p className="text-sm text-red-400/80 mb-3 leading-relaxed">{imp.issue}</p>
                          <div className="rounded-xl bg-green-500/8 border border-green-500/15 px-3 py-2.5">
                            <p className="text-green-400 text-sm leading-relaxed">💡 {imp.tip}</p>
                          </div>
                        </motion.div>
                      )
                    })}
                    {improvements.length > 2 && (
                      <button
                        onClick={() => setShowAllImprovements(!showAllImprovements)}
                        className="w-full py-3 rounded-xl border border-white/[0.06] text-white/40 hover:text-white/70 text-sm flex items-center justify-center gap-2 transition-colors"
                      >
                        <ChevronDown size={15} className={`transition-transform ${showAllImprovements ? 'rotate-180' : ''}`} />
                        {showAllImprovements ? 'Vis færre' : `Vis alle ${improvements.length} forbedringsområder`}
                      </button>
                    )}
                  </motion.div>
                )}

                {/* Drill tab */}
                {activeTab === 'drill' && (
                  <motion.div key="drill" {...fadeUp}>
                    <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center">
                          <Trophy size={15} className="text-amber-400" />
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-widest">Prioritert øvelse</p>
                          <p className="text-white font-semibold">{results.priority_drill?.name}</p>
                        </div>
                      </div>
                      <p className="text-white/60 text-sm leading-relaxed mb-4">{results.priority_drill?.description}</p>
                      <div className="inline-flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1.5 text-xs text-green-400 font-medium">
                        ⏱ {results.priority_drill?.duration}
                      </div>
                    </div>
                  </motion.div>
                )}

              </AnimatePresence>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Sticky bottom bar — only in results */}
      <AnimatePresence>
        {stage === 'done' && results && (
          <motion.div
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.35, ease: easing }}
            className="fixed bottom-0 inset-x-0 z-30 pb-safe"
          >
            <div className="max-w-xl mx-auto px-5 pb-5 pt-3 bg-gradient-to-t from-[#080810] via-[#080810]/95 to-transparent">
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    if (navigator.share) {
                      navigator.share({ title: 'Min svingscore', text: `Jeg fikk ${results.score ?? '–'}/100 på Swingman!` })
                    }
                  }}
                  className="flex items-center justify-center gap-2 py-3.5 px-5 rounded-xl border border-white/10 text-white/60 hover:text-white hover:border-white/20 text-sm font-medium transition-all"
                >
                  <Share2 size={15} /> Del
                </button>
                <button
                  onClick={handleReset}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm text-white transition-all"
                  style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', boxShadow: '0 4px 16px rgba(34,197,94,0.3)' }}
                >
                  <RotateCcw size={15} /> Analyser ny sving
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}
