# Swingman – Status

**Sist jobbet:** Mars 2026
**Fase:** MVP ferdig, klar for ekte brukere
**Live på:** https://www.swingman.no

---

## Neste steg
1. Sette opp Supabase auth (Google-login)
2. Stripe-betaling med gratis-tier (3 analyser gratis, deretter 79–99 kr/mnd)
3. Teste grundig på mobil med ekte golf-videoer
4. Verifisere at Railway-backend er oppe — sjekk /health

## Blokkert av
Ingenting kjent akkurat nå

## Hva ble gjort sist
- Forenklet til én video (to-video blir premium bak login)
- Ny keyframe-bekreftelse: bruker kan justere 4 frames før analyse
- iOS Safari videolasting fikset (synlig 1px video i DOM)
- "Fullstendig analyse"-teaser med låsikon (to-video, krever konto)
- Oppdatert tekst: "Film svingen din fra siden..."
- Feilmeldinger viser nå faktisk Railway-feil (lettere å debugge)

## Kjente bugs / teknisk gjeld
- Ingen brukerautentisering — alle kan bruke appen gratis
- Ingen gratis-tier-begrensning (ubegrenset bruk)
- Ikke testet grundig på Android

## Viktige beslutninger tatt
- Én video i MVP — to-video ("Fullstendig analyse") blir premium-funksjon
- Stripe + Klarna som betalingsløsning når vi er klare
- Kostnadsestimat: ~845 kr/mnd ved 100 daglige brukere, ~8 100 kr/mnd ved 1 000
- Break-even ved ~82–103 betalende brukere (99 kr/mnd)
- MediaPipe kjøres lokalt i backend (ikke sky-API)
- Norsk som applikasjonsspråk, mørkt tema med golfgrønn (#2D6A4F)

## Stack
- Frontend: Next.js 14, TypeScript, Tailwind CSS → Vercel
- Backend: FastAPI, Python, MediaPipe → Railway
- AI: Claude API (claude-3-5-sonnet-20241022)
- Repo: github.com/aslkam/swingman
