import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Swingman - Golfsvinganalyse',
  description: 'Analyser og forbedre golfsvingen din med AI-drevet feedback',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="no">
      <body className="bg-slate-900 text-white">{children}</body>
    </html>
  )
}
