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
                className="rounded-2xl border border-white/[0.08] bg-white/[0.03] overflow-hidden"
                style={{ boxShadow: '0 0 50px rgba(34,197,94,0.07)' }}
              >
                <div className="px-5 pt-5 pb-4 flex items-center gap-5">
                  <ScoreArc score={results.score ?? 70} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-green-400 uppercase tracking-widest mb-1">Din svingscore</p>
                    <p className="text-white font-bold text-lg leading-tight mb-2">
                      {(results.score ?? 70) >= 80 ? 'Utmerket teknikk 🏌️' :
                       (results.score ?? 70) >= 65 ? 'Godt grunnlag 👍' :
                       (results.score ?? 70) >= 50 ? 'Under utvikling 📈' : 'Begynner 🌱'}
                    </p>
                    <p className="text-white/50 text-sm leading-relaxed">{results.summary}</p>
                  </div>
                </div>
                {/* Quick stats */}
                <div className="grid grid-cols-3 divide-x divide-white/[0.05] border-t border-white/[0.05]">
                  {[
                    { label: 'Styrker', value: results.strengths?.length ?? 0, color: 'text-green-400' },
                    { label: 'Forbedringer', value: improvements.length, color: 'text-amber-400' },
                    { label: 'Øvelse', value: results.priority_drill ? '1' : '0', color: 'text-blue-400' },
                  ].map(stat => (
                    <div key={stat.label} className="flex flex-col items-center py-3 gap-0.5">
                      <span className={`text-xl font-bold ${stat.color}`}>{stat.value}</span>
                      <span className="text-white/30 text-xs">{stat.label}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Tabs — always show label */}
              <motion.div variants={item} className="flex gap-1 rounded-xl bg-white/[0.04] p-1">
                {tabs.map(tab => (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 px-1 rounded-lg transition-all duration-200 ${
                      activeTab === tab.key ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'
                    }`}
                  >
                    <div className="relative">
                      {tab.icon}
                      {tab.badge && tab.badge > 0 && (
                        <span className={`absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full text-[9px] flex items-center justify-center font-bold ${
                          activeTab === tab.key ? 'bg-green-500 text-white' : 'bg-white/20 text-white/60'
                        }`}>{tab.badge}</span>
                      )}
                    </div>
                    <span className="text-[10px] font-medium leading-none">{tab.label}</span>
                  </button>
                ))}
              </motion.div>

              {/* Tab content */}
              <AnimatePresence mode="wait">

                {/* ── PHOTOS TAB ── */}
                {activeTab === 'photos' && (
                  <motion.div key="photos" {...fadeUp} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-white/40">Fire nøkkelbilder fra svingen din</p>
                      {improvements.length > 0 && (
                        <span className="text-[10px] text-red-400/70 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                          = forbedringsområde
                        </span>
                      )}
                    </div>

                    {results.keyframes && Object.keys(results.keyframes).length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {(['address','backswing_top','impact','follow_through'] as const).map(phase => {
                          const phaseIssues = improvements.filter((i: any) => i.phase === phase)
                          return results.keyframes[phase] ? (
                            <motion.div key={phase} variants={item} className="space-y-1.5">
                              <div className="relative rounded-xl overflow-hidden border border-white/[0.06] group">
                                <img
                                  src={`data:image/jpeg;base64,${results.keyframes[phase]}`}
                                  alt={PHASE_LABELS[phase]}
                                  className="w-full aspect-[3/4] object-cover object-top group-hover:scale-105 transition-transform duration-500"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                                {phaseIssues.length > 0 && (
                                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30">
                                    <span className="text-white text-xs font-bold">{phaseIssues.length}</span>
                                  </div>
                                )}
                              </div>
                              <div>
                                <p className="text-white text-xs font-semibold">{PHASE_LABELS[phase]}</p>
                                {phaseIssues.length > 0 ? (
                                  <p className="text-red-400/70 text-[10px] leading-tight mt-0.5 line-clamp-2">
                                    {phaseIssues[0].area}
                                    {phaseIssues.length > 1 ? ` +${phaseIssues.length - 1} til` : ''}
                                  </p>
                                ) : (
                                  <p className="text-green-400/60 text-[10px] mt-0.5">Ser bra ut ✓</p>
                                )}
                              </div>
                            </motion.div>
                          ) : null
                        })}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-white/[0.06] p-10 text-center space-y-2">
                        <ImageIcon size={28} className="text-white/20 mx-auto" />
                        <p className="text-white/40 text-sm">Bilder ikke tilgjengelig</p>
                        <p className="text-white/20 text-xs">Prøv å laste opp en video med bedre belysning</p>
                      </div>
                    )}

                    <button onClick={() => setActiveTab('improvements')}
                      className="w-full py-3 rounded-xl border border-white/[0.06] text-white/40 hover:text-white/70 text-xs flex items-center justify-center gap-2 transition-colors"
                    >
                      <Target size={13} /> Se alle forbedringsdetaljer
                    </button>
                  </motion.div>
                )}

                {/* ── STRENGTHS TAB ── */}
                {activeTab === 'strengths' && (
                  <motion.div key="strengths" {...fadeUp} className="space-y-3">
                    <div className="rounded-xl bg-green-500/5 border border-green-500/15 px-4 py-3">
                      <p className="text-green-400 text-xs font-semibold mb-0.5">Hva du gjør bra 💪</p>
                      <p className="text-white/40 text-xs leading-relaxed">
                        Dette er elementene instruktøren vil at du skal bevare og bygge videre på. Disse styrker svingen din.
                      </p>
                    </div>

                    {results.strengths && results.strengths.length > 0 ? (
                      <div className="space-y-2">
                        {results.strengths.map((s: string, i: number) => (
                          <motion.div key={i} variants={item}
                            className="flex gap-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5"
                          >
                            <div className="w-7 h-7 rounded-full bg-green-500/15 border border-green-500/25 flex items-center justify-center shrink-0 mt-0.5">
                              <CheckCircle2 size={14} className="text-green-400" />
                            </div>
                            <div>
                              <p className="text-white/85 text-sm leading-relaxed">{s}</p>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-white/[0.06] p-10 text-center space-y-2">
                        <TrendingUp size={28} className="text-white/20 mx-auto" />
                        <p className="text-white/40 text-sm">Ingen styrker identifisert</p>
                        <p className="text-white/20 text-xs">Prøv med en klarere video i god belysning</p>
                      </div>
                    )}

                    <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] px-4 py-3 text-center">
                      <p className="text-white/30 text-xs leading-relaxed">
                        💡 Behold disse elementene mens du jobber med forbedringene — de er grunnlaget din sving er bygget på.
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* ── IMPROVEMENTS TAB ── */}
                {activeTab === 'improvements' && (
                  <motion.div key="improvements" {...fadeUp} className="space-y-3">
                    <div className="rounded-xl bg-amber-500/5 border border-amber-500/15 px-4 py-3">
                      <p className="text-amber-400 text-xs font-semibold mb-0.5">Slik forbedrer du svingen din 🎯</p>
                      <p className="text-white/40 text-xs leading-relaxed">
                        Rangert etter effekt på prestasjon. Jobb med én forbedring om gangen for best resultat.
                      </p>
                    </div>

                    {improvements.length > 0 ? (
                      <div className="space-y-3">
                        {improvements.map((imp: any, i: number) => {
                          const impact = IMPACT_CONFIG[imp.impact as keyof typeof IMPACT_CONFIG] ?? IMPACT_CONFIG.medium
                          return (
                            <motion.div key={i} variants={item}
                              className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden"
                            >
                              {/* Header */}
                              <div className="flex items-center gap-3 px-4 pt-4 pb-3">
                                <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0">
                                  <span className="text-amber-400 text-sm font-bold">{i + 1}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-white font-semibold text-sm">{imp.area}</p>
                                  {imp.phase && (
                                    <p className="text-white/30 text-[11px] mt-0.5">
                                      📍 {PHASE_LABELS[imp.phase] ?? imp.phase}
                                    </p>
                                  )}
                                </div>
                                <span className={`text-[10px] font-semibold border rounded-full px-2 py-1 shrink-0 ${impact.bg} ${impact.color}`}>
                                  {impact.label}
                                </span>
                              </div>

                              {/* Problem */}
                              <div className="mx-4 mb-3 rounded-xl bg-red-500/8 border border-red-500/15 px-3 py-2.5">
                                <p className="text-[10px] font-semibold text-red-400/70 uppercase tracking-wider mb-1">Utfordring</p>
                                <p className="text-red-300/80 text-sm leading-relaxed">{imp.issue}</p>
                              </div>

                              {/* Tip */}
                              <div className="mx-4 mb-4 rounded-xl bg-green-500/8 border border-green-500/15 px-3 py-2.5">
                                <p className="text-[10px] font-semibold text-green-400/70 uppercase tracking-wider mb-1">Råd fra instruktør</p>
                                <p className="text-green-300/90 text-sm leading-relaxed">{imp.tip}</p>
                              </div>
                            </motion.div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-white/[0.06] p-10 text-center space-y-2">
                        <Target size={28} className="text-white/20 mx-auto" />
                        <p className="text-white/40 text-sm">Ingen forbedringsområder identifisert</p>
                        <p className="text-white/20 text-xs">Svingen din ser ut til å være i god form!</p>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* ── DRILL TAB ── */}
                {activeTab === 'drill' && (
                  <motion.div key="drill" {...fadeUp} className="space-y-3">

                    {results.priority_drill ? (
                      <>
                        <div className="rounded-xl bg-amber-500/5 border border-amber-500/15 px-4 py-3">
                          <p className="text-amber-400 text-xs font-semibold mb-0.5">Din prioriterte øvelse 🏆</p>
                          <p className="text-white/40 text-xs leading-relaxed">
                            Basert på analysen har AI-instruktøren valgt denne øvelsen fordi den gir størst forbedring akkurat nå.
                          </p>
                        </div>

                        {/* Exercise card */}
                        <div className="rounded-2xl border border-green-500/20 bg-green-500/[0.04] overflow-hidden">
                          {/* Name + duration */}
                          <div className="px-5 pt-5 pb-4 border-b border-white/[0.05]">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[10px] font-semibold text-green-400/60 uppercase tracking-widest mb-1.5">Øvelsesnavn</p>
                                <p className="text-white font-bold text-xl leading-tight">{results.priority_drill.name}</p>
                              </div>
                              <div className="shrink-0 flex flex-col items-center bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2">
                                <span className="text-green-400 text-lg font-bold leading-none">
                                  {results.priority_drill.duration?.split(' ')[0] ?? '—'}
                                </span>
                                <span className="text-green-400/60 text-[10px] mt-0.5">
                                  {results.priority_drill.duration?.split(' ').slice(1).join(' ') ?? 'min'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Description */}
                          <div className="px-5 py-4 border-b border-white/[0.05]">
                            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">Slik gjør du det</p>
                            <p className="text-white/70 text-sm leading-relaxed">{results.priority_drill.description}</p>
                          </div>

                          {/* Why this drill */}
                          {improvements[0] && (
                            <div className="px-5 py-4">
                              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">Hvorfor denne øvelsen</p>
                              <div className="flex gap-2.5">
                                <div className="w-1 rounded-full bg-amber-500/40 shrink-0" />
                                <p className="text-white/50 text-xs leading-relaxed">
                                  Øvelsen adresserer direkte <span className="text-amber-400">{improvements[0].area.toLowerCase()}</span> —
                                  det forbedringsområdet som vil gi størst effekt på svingen din.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Reminder */}
                        <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] px-4 py-3 text-center">
                          <p className="text-white/30 text-xs leading-relaxed">
                            🔁 Gjenta denne øvelsen <strong className="text-white/50">3–5 ganger per treningsøkt</strong> for å bygge muskelminne. Last opp en ny video etter 2–3 uker for å se fremgang.
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-2xl border border-white/[0.06] p-10 text-center space-y-2">
                        <Trophy size={28} className="text-white/20 mx-auto" />
                        <p className="text-white/40 text-sm">Ingen øvelse anbefalt</p>
                        <p className="text-white/20 text-xs">Prøv å laste opp en ny video med bedre vinkel</p>
                      </div>
                    )}
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
