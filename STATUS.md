# Swingman – Status

**Sist jobbet:** Mars 2026
**Fase:** MVP bygget, trenger polish og testing
**Live på:** https://swingman-six.vercel.app

---

## Neste steg
1. Teste hele flyten fra mobil (laste opp video → få analyse)
2. Fikse loading-state mens analyse kjører (bruker vet ikke hva som skjer)
3. Feilhåndtering hvis video er for stor eller feil format
4. Vurdere om Railway-backend er oppe – sjekk /health-endepunkt

## Blokkert av
Ingenting kjent – men backend på Railway må verifiseres at kjører

## Hva ble gjort sist
- Bygget komplett MVP med Next.js frontend + FastAPI backend
- Integrert MediaPipe pose estimation for å ekstrahere nøkkelvinkler
- Claude API gir strukturert feedback på 4 keyframes fra golfsvingen
- Satt opp deploy: Vercel (frontend) + Railway (backend)
- Video slettes automatisk etter analyse (personvern)

## Kjente bugs / teknisk gjeld
- Ingen tydelig loading-indikator mens analyse kjører (kan ta 10-30 sek)
- Ingen feilmelding hvis backend er nede
- Ikke testet grundig på mobil (primær målplattform)
- Ingen brukerautentisering – alle kan bruke appen

## Viktige beslutninger tatt
- MediaPipe brukes lokalt i backend (ikke sky-API) for å unngå ekstrakostnader
- claude-3-5-sonnet-20241022 valgt for god balanse mellom kvalitet og pris
- Norsk som applikasjonsspråk
- Mørkt tema med golfgrønn aksentfarge (#2D6A4F)

## Stack
- Frontend: Next.js 14, TypeScript, Tailwind CSS → Vercel
- Backend: FastAPI, Python, MediaPipe → Railway
- AI: Claude API (claude-3-5-sonnet-20241022)
- Repo: github.com/aslkam/swingman
