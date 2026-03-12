'use client'

import { useState, useRef } from 'react'
import axios from 'axios'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

export default function Home() {
  const [activeTab, setActiveTab] = useState<'upload' | 'results'>('upload')
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [results, setResults] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 100 * 1024 * 1024) {
        setError('Videoen er for stor. Maks 100MB.')
        return
      }
      if (!['video/mp4', 'video/quicktime'].includes(file.type)) {
        setError('Kun MP4 og MOV er støttet.')
        return
      }
      setVideoFile(file)
      setError(null)
    }
  }

  const handleAnalyze = async () => {
    if (!videoFile) return

    setIsAnalyzing(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', videoFile)

      const response = await axios.post(`${BACKEND_URL}/analyze`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      setResults(response.data)
      setActiveTab('results')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Analyse feilet. Prøv igjen.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleReset = () => {
    setVideoFile(null)
    setResults(null)
    setError(null)
    setActiveTab('upload')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="border-b border-golf-green/20 bg-slate-900/50 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-white">
            <span className="text-golf-green">⛳</span> Swingman
          </h1>
          <p className="text-slate-400 mt-1">Analyser og forbedre golfsvingen din</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div className="space-y-6">
            {/* Upload Area */}
            <div
              className="border-2 border-dashed border-golf-green/40 rounded-lg p-8 text-center hover:border-golf-green/60 transition cursor-pointer bg-slate-800/50"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime"
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="text-5xl mb-4">🎥</div>
              <h2 className="text-xl font-semibold text-white mb-2">Last opp din sving</h2>
              <p className="text-slate-400 mb-4">
                Dra videofilen hit eller klikk for å velge
              </p>
              <p className="text-sm text-slate-500">MP4 eller MOV, maks 100MB</p>
            </div>

            {/* Selected File */}
            {videoFile && (
              <div className="bg-golf-green/10 border border-golf-green/30 rounded-lg p-4">
                <p className="text-golf-light font-semibold">✓ Fil valgt:</p>
                <p className="text-white mt-1">{videoFile.name}</p>
                <p className="text-slate-400 text-sm mt-2">
                  {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                </p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                <p className="text-red-400">⚠️ {error}</p>
              </div>
            )}

            {/* Analyze Button */}
            <button
              onClick={handleAnalyze}
              disabled={!videoFile || isAnalyzing}
              className="w-full bg-golf-green hover:bg-golf-light disabled:bg-slate-700 text-white font-bold py-4 rounded-lg transition duration-200 flex items-center justify-center gap-2"
            >
              {isAnalyzing ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Analyserer svingen din...
                </>
              ) : (
                <>
                  <span>🔍</span>
                  Analyser sving
                </>
              )}
            </button>
          </div>
        )}

        {/* Results Tab */}
        {activeTab === 'results' && results && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="bg-golf-green/10 border border-golf-green/30 rounded-lg p-6">
              <h2 className="text-2xl font-bold text-golf-light mb-3">Analyse resultat</h2>
              <p className="text-white text-lg leading-relaxed">{results.summary}</p>
            </div>

            {/* Strengths */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
              <h3 className="text-xl font-bold text-golf-light mb-4">💪 Styrker</h3>
              <ul className="space-y-2">
                {results.strengths?.map((strength: string, idx: number) => (
                  <li key={idx} className="text-white flex gap-3">
                    <span className="text-golf-green">✓</span>
                    <span>{strength}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Improvements */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
              <h3 className="text-xl font-bold text-golf-light mb-4">🎯 Forbedringsområder</h3>
              <div className="space-y-4">
                {results.improvements?.map((imp: any, idx: number) => (
                  <div key={idx} className="border-l-4 border-golf-green pl-4">
                    <h4 className="font-semibold text-golf-light">{imp.area}</h4>
                    <p className="text-red-400 text-sm mt-1">Utfordring: {imp.issue}</p>
                    <p className="text-white mt-2">💡 {imp.tip}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Priority Drill */}
            <div className="bg-golf-green/20 border border-golf-green/50 rounded-lg p-6">
              <h3 className="text-xl font-bold text-golf-light mb-4">🏆 Prioritert øvelse</h3>
              <h4 className="font-semibold text-white text-lg">{results.priority_drill?.name}</h4>
              <p className="text-slate-300 mt-2">{results.priority_drill?.description}</p>
              <p className="text-golf-light text-sm mt-3">
                ⏱️ {results.priority_drill?.duration}
              </p>
            </div>

            {/* Reset Button */}
            <button
              onClick={handleReset}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-lg transition duration-200"
            >
              Analyser ny sving
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-700 bg-slate-900/50 mt-12">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center text-slate-500 text-sm">
          <p>Swingman v1.0 • Golf Swing Analysis powered by AI</p>
        </div>
      </footer>
    </div>
  )
}
