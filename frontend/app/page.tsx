'use client'

import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, ChevronRight, RotateCcw, CheckCircle2, Circle, Loader2, Trophy, Zap, TrendingUp, Play } from 'lucide-react'
import axios from 'axios'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

const PHASE_LABELS: Record<string, string> = {
  address:       'Adresse',
  backswing_top: 'Backswing',
  impact:        'Impact',
  follow_through: 'Follow-through',
}

type Stage = 'idle' | 'uploading' | 'analyzing' | 'generating' | 'done'

const STEPS = [
  { key: 'uploading',  label: 'Laster opp video' },
  { key: 'analyzing',  label: 'Analyserer bilder' },
  { key: 'generating', label: 'Genererer coaching' },
]

const fadeUp = {
  initial:  { opacity: 0, y: 20 },
  animate:  { opacity: 1, y: 0 },
  exit:     { opacity: 0, y: -10 },
  transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
}

const stagger = {
  animate: { transition: { staggerChildren: 0.08 } },
}

export default function Home() {
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl]   = useState<string | null>(null)
  const [isDragging, setIsDragging]   = useState(false)
  const [stage, setStage]             = useState<Stage>('idle')
  const [results, setResults]         = useState<any>(null)
  const [error, setError]             = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const currentStepIndex = STEPS.findIndex(s => s.key === stage)
  const isAnalyzing = ['uploading', 'analyzing', 'generating'].includes(stage)

  const pickFile = useCallback((file: File) => {
    if (file.size > 50 * 1024 * 1024) { setError('Videoen er for stor. Maks 50MB.'); return }
    if (!['video/mp4', 'video/quicktime'].includes(file.type)) { setError('Kun MP4 og MOV støttes.'); return }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setVideoFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setError(null)
    setResults(null)
  }, [previewUrl])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) pickFile(f)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) pickFile(f)
  }

  const handleAnalyze = async () => {
    if (!videoFile) return
    setError(null)
    setStage('uploading')

    try {
      const form = new FormData()
      form.append('file', videoFile)

      const res = await axios.post(`${BACKEND_URL}/analyze`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total && e.loaded >= e.total) {
            setStage('analyzing')
            setTimeout(() => setStage('generating'), 7000)
          }
        },
      })

      setResults(res.data)
      setStage('done')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Analyse feilet. Prøv igjen.')
      setStage('idle')
    }
  }

  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setVideoFile(null)
    setPreviewUrl(null)
    setResults(null)
    setError(null)
    setStage('idle')
  }

  return (
    <div className="min-h-dvh bg-[#080810] font-sans">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-radial-brand opacity-60" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-brand-500/5 blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/[0.06] bg-[#080810]/80 backdrop-blur-xl">
        <div className="max-w-xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/30">
              <span className="text-sm">⛳</span>
            </div>
            <span className="font-semibold text-white tracking-tight">Swingman</span>
          </div>
          {results && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={handleReset}
              className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white/90 transition-colors"
            >
              <RotateCcw size={14} />
              Ny analyse
            </motion.button>
          )}
        </div>
      </header>

      <main className="relative z-10 max-w-xl mx-auto px-5 py-8 space-y-5">
        <AnimatePresence mode="wait">

          {/* ── UPLOAD SCREEN ── */}
          {stage === 'idle' && !results && (
            <motion.div key="upload" {...fadeUp} className="space-y-4">

              {/* Hero text */}
              <div className="text-center py-2">
                <h1 className="text-3xl font-bold tracking-tight">
                  <span className="gradient-text">AI-drevet</span>{' '}
                  <span className="text-white">golfcoach</span>
                </h1>
                <p className="text-white/40 mt-2 text-sm">Last opp en video av svingen din og få profesjonelle råd</p>
              </div>

              {/* Drop zone */}
              <motion.div
                animate={{ borderColor: isDragging ? 'rgba(34,197,94,0.6)' : 'rgba(255,255,255,0.08)' }}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className="relative rounded-2xl border-2 border-dashed cursor-pointer overflow-hidden group"
                style={{ borderColor: isDragging ? 'rgba(34,197,94,0.6)' : 'rgba(255,255,255,0.08)' }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime"
                  onChange={onFileChange}
                  className="hidden"
                />

                {previewUrl ? (
                  /* Video preview */
                  <div className="relative">
                    <video
                      src={previewUrl}
                      className="w-full max-h-64 object-cover rounded-xl"
                      playsInline
                      muted
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent rounded-xl" />
                    <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                      <div>
                        <p className="text-white text-sm font-medium truncate max-w-[200px]">{videoFile?.name}</p>
                        <p className="text-white/50 text-xs">{videoFile && (videoFile.size / 1024 / 1024).toFixed(1)} MB</p>
                      </div>
                      <div className="glass rounded-full px-3 py-1 flex items-center gap-1.5 text-xs text-white/70">
                        <Play size={10} className="fill-current" />
                        Bytt video
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Empty state */
                  <div className="py-14 flex flex-col items-center gap-4 group-hover:opacity-80 transition-opacity">
                    <motion.div
                      animate={{ y: isDragging ? -4 : 0 }}
                      className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center"
                    >
                      <Upload size={22} className="text-brand-400" />
                    </motion.div>
                    <div className="text-center">
                      <p className="text-white font-medium">Slipp video her</p>
                      <p className="text-white/40 text-sm mt-1">eller trykk for å velge fil</p>
                    </div>
                    <p className="text-white/25 text-xs">MP4 eller MOV · maks 50 MB</p>
                  </div>
                )}
              </motion.div>

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-red-400 text-sm"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* CTA */}
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleAnalyze}
                disabled={!videoFile}
                className="w-full relative overflow-hidden rounded-2xl py-4 font-semibold text-base transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  background: videoFile
                    ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                    : 'rgba(255,255,255,0.06)',
                  color: videoFile ? '#fff' : 'rgba(255,255,255,0.3)',
                  boxShadow: videoFile ? '0 4px 24px rgba(34,197,94,0.3)' : 'none',
                }}
              >
                <span className="flex items-center justify-center gap-2">
                  <Zap size={18} className={videoFile ? 'fill-white' : ''} />
                  Analyser sving
                  {videoFile && <ChevronRight size={16} />}
                </span>
              </motion.button>
            </motion.div>
          )}

          {/* ── PROGRESS SCREEN ── */}
          {isAnalyzing && (
            <motion.div key="progress" {...fadeUp} className="py-8 space-y-8">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 mb-4">
                  <Loader2 size={28} className="text-brand-400 animate-spin" />
                </div>
                <p className="text-white font-semibold text-lg">Analyserer svingen din</p>
                <p className="text-white/40 text-sm mt-1">Dette tar vanligvis 20–40 sekunder</p>
              </div>

              {/* Steps */}
              <div className="glass rounded-2xl p-5 space-y-4">
                {STEPS.map((step, idx) => {
                  const done   = idx < currentStepIndex
                  const active = idx === currentStepIndex
                  return (
                    <motion.div
                      key={step.key}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.15 }}
                      className="flex items-center gap-3"
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-500 ${
                        done   ? 'bg-brand-500 shadow-lg shadow-brand-500/30' :
                        active ? 'bg-brand-500/20 border-2 border-brand-500' :
                                 'bg-white/5 border border-white/10'
                      }`}>
                        {done
                          ? <CheckCircle2 size={16} className="text-white" />
                          : active
                            ? <div className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
                            : <Circle size={14} className="text-white/20" />
                        }
                      </div>
                      <span className={`text-sm font-medium transition-colors ${
                        done ? 'text-brand-400' : active ? 'text-white' : 'text-white/25'
                      }`}>
                        {step.label}
                      </span>
                      {active && (
                        <div className="ml-auto flex gap-1">
                          {[0,1,2].map(i => (
                            <motion.div
                              key={i}
                              animate={{ opacity: [0.2, 1, 0.2] }}
                              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                              className="w-1.5 h-1.5 rounded-full bg-brand-500"
                            />
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )
                })}
              </div>

              {/* Shimmer progress bar */}
              <div className="h-0.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-brand-600 via-brand-400 to-brand-600 shimmer"
                  style={{ width: `${((currentStepIndex + 1) / STEPS.length) * 100}%`, transition: 'width 0.6s ease' }}
                />
              </div>
            </motion.div>
          )}

          {/* ── RESULTS SCREEN ── */}
          {stage === 'done' && results && (
            <motion.div key="results" variants={stagger} initial="initial" animate="animate" className="space-y-4">

              {/* Summary card */}
              <motion.div variants={fadeUp} className="glass rounded-2xl p-5 glow-green">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-brand-500/20 flex items-center justify-center">
                    <Zap size={13} className="text-brand-400 fill-brand-400" />
                  </div>
                  <span className="text-xs font-semibold text-brand-400 uppercase tracking-widest">Analyse</span>
                </div>
                <p className="text-white/90 leading-relaxed">{results.summary}</p>
              </motion.div>

              {/* Keyframes grid */}
              {results.keyframes && Object.keys(results.keyframes).length > 0 && (
                <motion.div variants={fadeUp}>
                  <p className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-3">Nøkkelbilder</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(['address','backswing_top','impact','follow_through'] as const).map((phase) =>
                      results.keyframes[phase] ? (
                        <motion.div
                          key={phase}
                          variants={fadeUp}
                          className="relative rounded-xl overflow-hidden border border-white/[0.06] group"
                        >
                          <img
                            src={`data:image/jpeg;base64,${results.keyframes[phase]}`}
                            alt={PHASE_LABELS[phase]}
                            className="w-full aspect-[4/3] object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                          <span className="absolute bottom-2 left-2.5 text-xs font-medium text-white/80">
                            {PHASE_LABELS[phase]}
                          </span>
                        </motion.div>
                      ) : null
                    )}
                  </div>
                </motion.div>
              )}

              {/* Strengths */}
              <motion.div variants={fadeUp} className="glass rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-lg bg-brand-500/20 flex items-center justify-center">
                    <TrendingUp size={13} className="text-brand-400" />
                  </div>
                  <span className="text-xs font-semibold text-brand-400 uppercase tracking-widest">Styrker</span>
                </div>
                <ul className="space-y-2.5">
                  {results.strengths?.map((s: string, i: number) => (
                    <li key={i} className="flex gap-3 text-sm text-white/80">
                      <CheckCircle2 size={16} className="text-brand-500 shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>

              {/* Improvements */}
              <motion.div variants={fadeUp}>
                <p className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-3">Forbedringsområder</p>
                <div className="space-y-3">
                  {results.improvements?.map((imp: any, i: number) => (
                    <motion.div
                      key={i}
                      variants={fadeUp}
                      className="glass glass-hover rounded-2xl p-4"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-5 h-5 rounded-md bg-amber-500/20 flex items-center justify-center">
                          <span className="text-amber-400 text-xs font-bold">{i + 1}</span>
                        </div>
                        <span className="text-sm font-semibold text-white">{imp.area}</span>
                      </div>
                      <p className="text-red-400/80 text-sm mb-2.5 leading-relaxed">{imp.issue}</p>
                      <div className="rounded-xl bg-brand-500/8 border border-brand-500/15 px-3 py-2.5">
                        <p className="text-brand-400 text-sm leading-relaxed">💡 {imp.tip}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              {/* Priority drill */}
              <motion.div variants={fadeUp} className="glass rounded-2xl p-5 border border-brand-500/20">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center">
                    <Trophy size={13} className="text-amber-400" />
                  </div>
                  <span className="text-xs font-semibold text-amber-400 uppercase tracking-widest">Prioritert øvelse</span>
                </div>
                <h3 className="text-white font-semibold text-lg">{results.priority_drill?.name}</h3>
                <p className="text-white/60 text-sm mt-2 leading-relaxed">{results.priority_drill?.description}</p>
                <div className="mt-4 inline-flex items-center gap-1.5 text-xs text-brand-400 font-medium bg-brand-500/10 rounded-full px-3 py-1.5">
                  <span>⏱</span>
                  {results.priority_drill?.duration}
                </div>
              </motion.div>

              {/* Reset */}
              <motion.button
                variants={fadeUp}
                whileTap={{ scale: 0.98 }}
                onClick={handleReset}
                className="w-full glass glass-hover rounded-2xl py-4 text-white/60 hover:text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"
              >
                <RotateCcw size={15} />
                Analyser ny sving
              </motion.button>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      <footer className="relative z-10 text-center py-6 text-white/15 text-xs">
        Swingman v1.1 · Powered by Claude AI
      </footer>
    </div>
  )
}
