# ⛳ Swingman – Golf Swing Analysis App

En mobiloptimalisert webapp for analyse og forbedring av golfsvingen din med AI-drevet feedback.

## 🚀 Startsett

### Backend

```bash
cd backend

# Installer dependencies
pip install -r requirements.txt

# Sett opp .env
cp .env.example .env
# Rediger .env med din ANTHROPIC_API_KEY

# Start server
python main.py
```

Server kjører på `http://localhost:8000`

### Frontend

```bash
cd frontend

# Installer dependencies
npm install

# Sett opp environment
cp .env.local.example .env.local
# Rediger .env.local hvis backend kjører på annen adresse

# Start dev server
npm run dev
```

App kjører på `http://localhost:3000`

## 🎯 Hvordan det fungerer

1. **Bruker laster opp video** av sitt golfslag (MP4 eller MOV, maks 100MB)
2. **Backend kjører MediaPipe pose estimation** på videoen
3. **Ekstraherer nøkkelvinkler** fra 4 keyframes:
   - Address (start)
   - Backswing Top
   - Impact
   - Follow-through
4. **Sender data til Claude API** med spesialisert golf-prompt
5. **Mottaker strukturert feedback** som vises i appen:
   - Oppsummering
   - Styrker
   - Forbedringsområder
   - Prioritert øvelse
6. **Video slettes automatisk** etter analyse

## 🛠️ Tech Stack

- **Frontend:** Next.js 14, Tailwind CSS, React
- **Backend:** FastAPI, Python
- **AI:** Claude API (claude-3-5-sonnet-20241022)
- **Vision:** MediaPipe Pose Estimation
- **Hosting:** Local (kan deployes til Vercel + Railway)

## 🎨 Design

- **Tema:** Mørkt tema med golfgrønn aksentfarge (#2D6A4F)
- **Responsiv:** Optimalisert for mobil
- **Språk:** Norsk
- **Ikoner:** Emoji for minimalisme

## 📝 API Endepunkter

### GET /health
Healthcheck

**Response:**
```json
{
  "status": "ok"
}
```

### POST /analyze
Analyser golf swing video

**Request:**
```
Form Data:
- file: Video file (MP4/MOV)
```

**Response:**
```json
{
  "summary": "2-3 setningers oppsummering",
  "strengths": ["styrke 1", "styrke 2"],
  "improvements": [
    {
      "area": "område",
      "issue": "utfordring",
      "tip": "tips"
    }
  ],
  "priority_drill": {
    "name": "øvelses navn",
    "description": "beskrivelse",
    "duration": "varighet"
  },
  "measurements": {
    "address": {...},
    "backswing_top": {...},
    "impact": {...},
    "follow_through": {...}
  }
}
```

## 🔑 Environment Variables

### Backend (.env)
```
ANTHROPIC_API_KEY=sk-ant-oat01-xxxxx
BACKEND_PORT=8000
```

### Frontend (.env.local)
```
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

## 📊 Measurements

Hver keyframe har følgende data:
- `shoulder_rotation` – Grad av skulderrotasjon
- `hip_rotation` – Grad av hofterotasjon  
- `left_arm_angle` – Vinkel på venstre arm
- `left_knee_flex` – Knebøy venstre
- `right_knee_flex` – Knebøy høyre
- `spine_angle` – Ryggvinkel

## 🚀 Deploy

### Vercel (Frontend)
```bash
cd frontend
vercel deploy
```

### Railway/Render (Backend)
```bash
cd backend
# Push til Git og deploy via Railway/Render
```

## 🐛 Feilsøking

**Backend starter ikke:**
- Sjekk at ANTHROPIC_API_KEY er satt
- Prøv: `python -m main` istedenfor `python main.py`

**Frontend kobler ikke til backend:**
- Sjekk at backend kjører på port 8000
- Verifiser NEXT_PUBLIC_BACKEND_URL i .env.local

**MediaPipe error:**
- Oppdater: `pip install --upgrade mediapipe`

## 📝 Lisens

MIT

---

**Laget med ❤️ for golfere av Asle Kambuås + Jarvis**
