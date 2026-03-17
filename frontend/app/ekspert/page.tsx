'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Lock, Upload, CheckCircle2, Plus, X, Loader2, ChevronRight, Info,
} from 'lucide-react'
import axios from 'axios'

const BACKEND_URL    = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
const EXPERT_PW      = process.env.NEXT_PUBLIC_EXPERT_PASSWORD || 'GolfPro2026'
const TARGET_COUNT   = 10

// ─── Types ────────────────────────────────────────────────────────────────────

interface Improvement { area: string; issue: string; tip: string }
interface Form {
  skill_level: 'nybegynner' | 'middels' | 'avansert'
  summary: string
  strengths: string[]
  improvements: Improvement[]
  priority_name: string
  priority_description: string
  notes: string
}

const emptyForm = (): Form => ({
  skill_level: 'middels',
  summary: '',
  strengths: ['', ''],
  improvements: [
    { area: '', issue: '', tip: '' },
    { area: '', issue: '', tip: '' },
  ],
  priority_name: '',
  priority_description: '',
  notes: '',
})

// ─── Styles ───────────────────────────────────────────────────────────────────

const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,0.75)',
  backdropFilter: 'blur(40px)',
  WebkitBackdropFilter: 'blur(40px)',
  boxShadow: '0 2px 32px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.95)',
}

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EkspertPage() {
  const [authed, setAuthed]       = useState(false)
  const [pw, setPw]               = useState('')
  const [pwError, setPwError]     = useState(false)
  const [count, setCount]         = useState<number | null>(null)
  const [form, setForm]           = useState<Form>(emptyForm())
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (authed) fetchCount()
  }, [authed])

  const fetchCount = async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/expert/annotations`)
      setCount(Array.isArray(res.data) ? res.data.length : 0)
    } catch { setCount(0) }
  }

  const handleLogin = () => {
    if (pw === EXPERT_PW) { setAuthed(true); setPwError(false) }
    else { setPwError(true) }
  }

  const captureThumbnail = (file: File, url: string): Promise<string> =>
    new Promise(resolve => {
      const video  = document.createElement('video')
      const canvas = document.createElement('canvas')
      video.src = url; video.muted = true; video.playsInline = true
      video.addEventListener('loadeddata', () => { video.currentTime = 0.5 })
      video.addEventListener('seeked', () => {
        canvas.width  = video.videoWidth  || 640
        canvas.height = video.videoHeight || 480
        canvas.getContext('2d')?.drawImage(video, 0, 0)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      })
      video.addEventListener('error', () => resolve(''))
      setTimeout(() => resolve(''), 5000)
    })

  const onVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setVideoFile(f)
    const url = URL.createObjectURL(f)
    const thumb = await captureThumbnail(f, url)
    setThumbnail(thumb || null)
  }

  const setStrength = (i: number, val: string) =>
    setForm(f => { const s = [...f.strengths]; s[i] = val; return { ...f, strengths: s } })

  const setImprovement = (i: number, key: keyof Improvement, val: string) =>
    setForm(f => {
      const imp = f.improvements.map((im, idx) => idx === i ? { ...im, [key]: val } : im)
      return { ...f, improvements: imp }
    })

  const handleSubmit = async () => {
    if (!videoFile) { setError('Last opp en video først.'); return }
    if (!form.summary.trim()) { setError('Fyll inn oppsummering.'); return }
    if (!form.strengths[0].trim()) { setError('Fyll inn minst én styrke.'); return }
    if (!form.improvements[0].area.trim()) { setError('Fyll inn minst én forbedring.'); return }
    if (!form.priority_name.trim()) { setError('Fyll inn prioritert øvelse.'); return }

    setSubmitting(true); setError(null)
    try {
      const payload = {
        skill_level:           form.skill_level,
        summary:               form.summary.trim(),
        strengths:             form.strengths.filter(s => s.trim()),
        improvements:          form.improvements.filter(i => i.area.trim()),
        priority_drill: {
          name:                form.priority_name.trim(),
          description:         form.priority_description.trim(),
        },
        notes:                 form.notes.trim(),
        video_filename:        videoFile.name,
        submitted_at:          new Date().toISOString(),
      }
      await axios.post(`${BACKEND_URL}/expert/submit`, payload)
      setSubmitted(true)
      setCount(c => (c ?? 0) + 1)
    } catch {
      setError('Innsending feilet. Sjekk at backend er oppe og prøv igjen.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Password gate ──────────────────────────────────────────────────────────

  if (!authed) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-5"
        style={{ background: '#f5f5f7' }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease }}
          className="w-full max-w-sm rounded-3xl p-8 space-y-6"
          style={{ ...glass, border: '1px solid rgba(0,0,0,0.08)' }}>
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center mb-4"
              style={{ background: 'rgba(5,150,105,0.1)', border: '1px solid rgba(5,150,105,0.2)' }}>
              <Lock size={22} className="text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold text-black/80">Ekspertverktøy</h1>
            <p className="text-black/45 text-sm">Swingman · Kun for sertifiserte instruktører</p>
          </div>
          <div className="space-y-3">
            <input
              type="password"
              placeholder="Passord"
              value={pw}
              onChange={e => { setPw(e.target.value); setPwError(false) }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className="w-full px-4 py-3 rounded-2xl text-base outline-none transition-all"
              style={{
                background: 'rgba(0,0,0,0.04)',
                border: `1.5px solid ${pwError ? '#ef4444' : 'rgba(0,0,0,0.1)'}`,
              }}
            />
            {pwError && <p className="text-rose-500 text-sm px-1">Feil passord. Prøv igjen.</p>}
            <button onClick={handleLogin}
              className="w-full py-3.5 rounded-2xl font-bold text-white text-base"
              style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', boxShadow: '0 8px 24px rgba(5,150,105,0.3)' }}>
              Logg inn
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  // ── Success ────────────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-5"
        style={{ background: '#f5f5f7' }}>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease }}
          className="w-full max-w-sm rounded-3xl p-8 text-center space-y-5"
          style={{ ...glass, border: '1px solid rgba(5,150,105,0.2)' }}>
          <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center"
            style={{ background: 'rgba(5,150,105,0.12)', border: '1px solid rgba(5,150,105,0.3)' }}>
            <CheckCircle2 size={28} className="text-emerald-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-black/80 mb-2">Takk!</h2>
            <p className="text-black/55 leading-relaxed">
              Analysen din er lagret. Du har nå bidratt til å gjøre Swingman bedre for alle golfspillere.
            </p>
          </div>
          {count !== null && (
            <div className="rounded-2xl px-4 py-3"
              style={{ background: 'rgba(5,150,105,0.07)', border: '1px solid rgba(5,150,105,0.15)' }}>
              <p className="text-sm text-emerald-700 font-medium">
                {count} av {TARGET_COUNT} eksempler levert
              </p>
              <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(5,150,105,0.15)' }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (count / TARGET_COUNT) * 100)}%`, background: '#059669', transition: 'width 0.5s ease' }} />
              </div>
            </div>
          )}
          <button onClick={() => { setSubmitted(false); setForm(emptyForm()); setVideoFile(null); setThumbnail(null) }}
            className="w-full py-3 rounded-2xl font-semibold text-sm"
            style={{ background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)', color: 'rgba(0,0,0,0.55)' }}>
            Send inn en til
          </button>
        </motion.div>
      </div>
    )
  }

  // ── Main form ──────────────────────────────────────────────────────────────

  const progressPct = count !== null ? Math.min(100, (count / TARGET_COUNT) * 100) : 0

  return (
    <div className="min-h-dvh pb-24" style={{ background: '#f5f5f7' }}>
      <div className="max-w-xl mx-auto px-5 pt-8 space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-emerald-600/70 uppercase tracking-widest">Swingman</span>
            <span className="text-xs text-black/25">· Ekspertverktøy</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-black/85">Tren AI-coachen</h1>
        </div>

        {/* Forklaring */}
        <div className="rounded-3xl p-5 space-y-4"
          style={{ background: 'rgba(5,150,105,0.06)', border: '1.5px solid rgba(5,150,105,0.18)' }}>
          <div className="flex items-start gap-3">
            <Info size={18} className="text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="font-bold text-black/75">Du hjelper AI-coachen å bli bedre instruktør</p>
              <p className="text-black/55 text-sm leading-relaxed">
                Swingman bruker eksempel-analysene dine som referanse når den vurderer nye svinger. Jo mer konkret og spesifikk du er, desto bedre og mer presis blir tilbakemeldingen til brukerne.
              </p>
            </div>
          </div>

          {/* Progress */}
          <div className="rounded-2xl px-4 py-3 space-y-2"
            style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(5,150,105,0.15)' }}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-black/65">Fremdrift mot mål</p>
              <p className="text-sm font-bold text-emerald-700">{count ?? '…'} / {TARGET_COUNT}</p>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.07)' }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #059669, #34d399)' }} />
            </div>
            <p className="text-xs text-black/40 leading-relaxed">
              <strong className="text-black/60">10 eksempler er målet</strong> — nok til å kalibrere AI-en godt. Mer er alltid bedre, men 10 gir allerede merkbar forbedring.
            </p>
          </div>

          {/* Hva vi trenger */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-black/65">Vi trenger disse eksemplene:</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Nybegynner', desc: '2–3 eks.', emoji: '🌱', note: 'Tydelige klassiske feil' },
                { label: 'Mellom',     desc: '4–5 eks.', emoji: '⛳', note: 'De vanligste utfordringene' },
                { label: 'Avansert',  desc: '2–3 eks.', emoji: '🏆', note: 'Subtile justeringer' },
              ].map(t => (
                <div key={t.label} className="rounded-2xl p-3 text-center space-y-1"
                  style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(0,0,0,0.07)' }}>
                  <p className="text-lg">{t.emoji}</p>
                  <p className="text-xs font-bold text-black/70">{t.label}</p>
                  <p className="text-xs font-semibold text-emerald-700">{t.desc}</p>
                  <p className="text-[10px] text-black/35 leading-tight">{t.note}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl px-4 py-3"
            style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(0,0,0,0.07)' }}>
            <p className="text-xs text-black/50 leading-relaxed">
              <strong className="text-black/70">Hva gjør et godt eksempel?</strong> Vær konkret og spesifikk.
              «Venstre arm bøyer til ca. 140° i backswing — ideelt er 170–180°» er bra.
              «Trenger å jobbe med teknikk» er for generelt og hjelper ikke AI-en.
            </p>
          </div>
        </div>

        {/* Nivå */}
        <div className="rounded-3xl p-5 space-y-3" style={{ ...glass, border: '1px solid rgba(0,0,0,0.08)' }}>
          <label className="block">
            <p className="text-sm font-bold text-black/65 mb-2">Nivå på spilleren i videoen</p>
            <div className="grid grid-cols-3 gap-2">
              {(['nybegynner', 'middels', 'avansert'] as const).map(lvl => (
                <button key={lvl} onClick={() => setForm(f => ({ ...f, skill_level: lvl }))}
                  className="py-2.5 rounded-2xl text-sm font-semibold capitalize transition-all"
                  style={{
                    background: form.skill_level === lvl ? 'rgba(5,150,105,0.1)' : 'rgba(0,0,0,0.04)',
                    border: `1.5px solid ${form.skill_level === lvl ? 'rgba(5,150,105,0.4)' : 'rgba(0,0,0,0.08)'}`,
                    color: form.skill_level === lvl ? '#059669' : 'rgba(0,0,0,0.5)',
                  }}>
                  {lvl === 'nybegynner' ? '🌱 Nybegynner' : lvl === 'middels' ? '⛳ Middels' : '🏆 Avansert'}
                </button>
              ))}
            </div>
          </label>
        </div>

        {/* Video */}
        <div className="rounded-3xl p-5 space-y-3" style={{ ...glass, border: '1px solid rgba(0,0,0,0.08)' }}>
          <div>
            <p className="text-sm font-bold text-black/65">Video av svingen</p>
            <p className="text-xs text-black/35 mt-1">Last opp videoen du kommenterer, slik at den kan brukes til fremtidig AI-trening.</p>
          </div>
          <input ref={fileInputRef} type="file" accept="video/mp4,video/quicktime,video/*" onChange={onVideoChange} className="hidden" />
          {videoFile ? (
            <div className="relative rounded-2xl overflow-hidden"
              style={{ border: '1px solid rgba(0,0,0,0.08)' }}>
              {thumbnail && <img src={thumbnail} alt="Video" className="w-full max-h-44 object-cover" />}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 50%)' }} />
              <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                <p className="text-white text-xs font-medium truncate max-w-[200px]">{videoFile.name}</p>
                <button onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-white/80 rounded-full px-3 py-1"
                  style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)' }}>Bytt</button>
              </div>
            </div>
          ) : (
            <button onClick={() => fileInputRef.current?.click()}
              className="w-full py-8 rounded-2xl flex flex-col items-center gap-3 transition-all"
              style={{ border: '2px dashed rgba(5,150,105,0.25)', background: 'rgba(5,150,105,0.03)' }}>
              <Upload size={22} className="text-emerald-500" />
              <p className="text-sm text-black/45">Trykk for å velge video</p>
            </button>
          )}
        </div>

        {/* Oppsummering */}
        <div className="rounded-3xl p-5 space-y-3" style={{ ...glass, border: '1px solid rgba(0,0,0,0.08)' }}>
          <div>
            <p className="text-sm font-bold text-black/65">Oppsummering</p>
            <p className="text-xs text-black/35 mt-1">2–3 setninger som beskriver helhetsinntrykket av svingen.</p>
          </div>
          <textarea
            rows={3}
            value={form.summary}
            onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
            placeholder="Eks: «Spilleren har god rytme og stabil adressestilling, men skulderrotasjonen stopper for tidlig i backswing. Hoftene er sene med å åpne seg i nedsvingen, noe som begrenser kraftoverføringen.»"
            className="w-full px-4 py-3 rounded-2xl text-sm leading-relaxed resize-none outline-none"
            style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.09)' }}
          />
        </div>

        {/* Styrker */}
        <div className="rounded-3xl p-5 space-y-3" style={{ ...glass, border: '1px solid rgba(5,150,105,0.15)' }}>
          <div>
            <p className="text-sm font-bold text-black/65">Styrker</p>
            <p className="text-xs text-black/35 mt-1">Hva gjør spilleren bra? Vær konkret — ikke generell.</p>
          </div>
          {form.strengths.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'rgba(5,150,105,0.1)', border: '1px solid rgba(5,150,105,0.25)' }}>
                <CheckCircle2 size={13} className="text-emerald-600" />
              </div>
              <input
                value={s}
                onChange={e => setStrength(i, e.target.value)}
                placeholder={i === 0 ? 'Eks: «God og stabil adressestilling med riktig ballplassering»' : 'Eks: «Rolig og kontrollert tempo gjennom backswingen»'}
                className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.09)' }}
              />
              {i >= 2 && (
                <button onClick={() => setForm(f => ({ ...f, strengths: f.strengths.filter((_, j) => j !== i) }))}>
                  <X size={15} className="text-black/30" />
                </button>
              )}
            </div>
          ))}
          {form.strengths.length < 4 && (
            <button onClick={() => setForm(f => ({ ...f, strengths: [...f.strengths, ''] }))}
              className="flex items-center gap-2 text-sm text-emerald-600/70 hover:text-emerald-600 transition-colors">
              <Plus size={14} /> Legg til styrke
            </button>
          )}
        </div>

        {/* Forbedringer */}
        <div className="rounded-3xl p-5 space-y-4" style={{ ...glass, border: '1px solid rgba(217,119,6,0.15)' }}>
          <div>
            <p className="text-sm font-bold text-black/65">Forbedringer</p>
            <p className="text-xs text-black/35 mt-1">
              Beskriv konkrete feil og hva spilleren bør gjøre.
              Hvert punkt skal ha tre deler: <strong className="text-black/50">område</strong>, <strong className="text-black/50">hva er problemet</strong>, og <strong className="text-black/50">hva skal spilleren gjøre</strong>.
            </p>
          </div>
          {form.improvements.map((imp, i) => (
            <div key={i} className="rounded-2xl p-4 space-y-2.5"
              style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.07)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.2)' }}>
                    <span className="text-amber-600 text-xs font-bold">{i + 1}</span>
                  </div>
                  <p className="text-xs font-semibold text-black/50">Forbedring {i + 1}</p>
                </div>
                {i >= 2 && (
                  <button onClick={() => setForm(f => ({ ...f, improvements: f.improvements.filter((_, j) => j !== i) }))}>
                    <X size={15} className="text-black/30" />
                  </button>
                )}
              </div>
              <input value={imp.area} onChange={e => setImprovement(i, 'area', e.target.value)}
                placeholder="Område — eks: «Skulderrotasjon i backswing»"
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(0,0,0,0.09)' }}
              />
              <textarea rows={2} value={imp.issue} onChange={e => setImprovement(i, 'issue', e.target.value)}
                placeholder="Hva er problemet? — eks: «Skuldrene roterer kun ca. 70°. Ideelt er 85–95° for god kraftoverføring.»"
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
                style={{ background: 'rgba(255,245,245,0.9)', border: '1px solid rgba(239,68,68,0.12)' }}
              />
              <textarea rows={2} value={imp.tip} onChange={e => setImprovement(i, 'tip', e.target.value)}
                placeholder="Hva skal spilleren gjøre? — eks: «Prøv å peke venstre skulder mot ballen i toppen av backswing. Bruk speildrilling 5 min daglig.»"
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
                style={{ background: 'rgba(240,253,244,0.9)', border: '1px solid rgba(5,150,105,0.15)' }}
              />
            </div>
          ))}
          {form.improvements.length < 4 && (
            <button onClick={() => setForm(f => ({ ...f, improvements: [...f.improvements, { area: '', issue: '', tip: '' }] }))}
              className="flex items-center gap-2 text-sm text-amber-600/70 hover:text-amber-600 transition-colors">
              <Plus size={14} /> Legg til forbedring
            </button>
          )}
        </div>

        {/* Prioritert øvelse */}
        <div className="rounded-3xl p-5 space-y-3"
          style={{ background: 'rgba(240,253,244,0.85)', border: '1.5px solid rgba(5,150,105,0.2)', backdropFilter: 'blur(40px)' }}>
          <div>
            <p className="text-sm font-bold text-black/65">Prioritert øvelse</p>
            <p className="text-xs text-black/35 mt-1">Den ene øvelsen spilleren bør gjøre nå. Navn + konkret beskrivelse av fremgangsmåte.</p>
          </div>
          <input value={form.priority_name} onChange={e => setForm(f => ({ ...f, priority_name: e.target.value }))}
            placeholder="Navn — eks: «Skulderrotasjons-drill med golfkølle»"
            className="w-full px-4 py-3 rounded-2xl text-sm outline-none"
            style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(5,150,105,0.15)' }}
          />
          <textarea rows={3} value={form.priority_description} onChange={e => setForm(f => ({ ...f, priority_description: e.target.value }))}
            placeholder="Slik gjør du det — eks: «Hold en kølle horisontalt over skuldrene. Roter til venstre skulder peker mot en imaginær ball. Gjør 20 langsome repetisjoner foran speil. Fokuser på at hoftene holder seg nede.»"
            className="w-full px-4 py-3 rounded-2xl text-sm outline-none resize-none"
            style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(5,150,105,0.15)' }}
          />
        </div>

        {/* Notater (valgfritt) */}
        <div className="rounded-3xl p-5 space-y-3" style={{ ...glass, border: '1px solid rgba(0,0,0,0.08)' }}>
          <div>
            <p className="text-sm font-bold text-black/65">Egne notater <span className="font-normal text-black/35">(valgfritt)</span></p>
            <p className="text-xs text-black/35 mt-1">Ekstra kontekst som kan hjelpe oss å forstå eksempelet bedre.</p>
          </div>
          <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Eks: «Typisk for mannlige nybegynnere 40–60 år. Har spilt i 2 år.»"
            className="w-full px-4 py-3 rounded-2xl text-sm outline-none resize-none"
            style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.09)' }}
          />
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="rounded-2xl px-4 py-3 flex items-center gap-2"
              style={{ background: '#fff5f5', border: '1px solid rgba(239,68,68,0.2)' }}>
              <X size={15} className="text-rose-500 shrink-0" />
              <p className="text-rose-600 text-sm">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Submit */}
        <button onClick={handleSubmit} disabled={submitting}
          className="w-full py-4 rounded-2xl font-bold text-lg text-white disabled:opacity-60 flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', boxShadow: '0 8px 32px rgba(5,150,105,0.35)' }}>
          {submitting
            ? <><Loader2 size={18} className="animate-spin" /> Sender inn…</>
            : <><ChevronRight size={18} /> Send inn analyse</>
          }
        </button>

      </div>
    </div>
  )
}
