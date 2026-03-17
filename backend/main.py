"""
Swingman Backend - Golf Swing Analysis API
"""

import os
import json
import base64
import tempfile
from pathlib import Path
from datetime import datetime
from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import cv2
import numpy as np
import mediapipe as mp
from anthropic import Anthropic

# Load environment variables
load_dotenv()

# Initialize FastAPI
app = FastAPI(title="Swingman API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize MediaPipe
mp_pose = mp.solutions.pose
pose = mp_pose.Pose(
    static_image_mode=False,
    model_complexity=1,
    smooth_landmarks=True,
)

# Statisk instans for skjelett-overlay på keyframes (initialisert én gang ved oppstart)
pose_static = mp_pose.Pose(
    static_image_mode=True,
    model_complexity=0,
)

# Initialize Anthropic client
client = Anthropic()

# Constants
KEY_FRAMES = {
    'address': 0,  # Start
    'backswing_top': 1,
    'impact': 2,
    'follow_through': 3,
}

FRAME_SKIP = 5  # Analyze every 5th frame

SKELETON_CONNECTIONS = [
    (11, 12),           # skuldre
    (11, 13), (13, 15), # venstre arm
    (12, 14), (14, 16), # høyre arm
    (11, 23), (12, 24), # torsosider
    (23, 24),           # hofter
    (23, 25), (25, 27), # venstre bein
    (24, 26), (26, 28), # høyre bein
]


def calculate_angle(p1, p2, p3):
    """Calculate angle between three points"""
    a = np.array(p1)
    b = np.array(p2)
    c = np.array(p3)
    
    ba = a - b
    bc = c - b
    
    cosine_angle = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-6)
    cosine_angle = np.clip(cosine_angle, -1, 1)
    angle = np.arccos(cosine_angle)
    
    return np.degrees(angle)


def frame_to_base64(frame, max_width=800) -> str:
    """Resize frame and encode as base64 JPEG"""
    h, w = frame.shape[:2]
    if w > max_width:
        scale = max_width / w
        frame = cv2.resize(frame, (max_width, int(h * scale)))
    _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
    return base64.standard_b64encode(buffer).decode('utf-8')


def draw_skeleton(frame: np.ndarray, landmarks) -> np.ndarray:
    """Tegner pose-skjelett på keyframe-bilde"""
    h, w = frame.shape[:2]
    overlay = frame.copy()

    # Tegn forbindelseslinjer
    for start_idx, end_idx in SKELETON_CONNECTIONS:
        lm_s = landmarks[start_idx]
        lm_e = landmarks[end_idx]
        if lm_s.visibility < 0.3 or lm_e.visibility < 0.3:
            continue
        x1, y1 = int(lm_s.x * w), int(lm_s.y * h)
        x2, y2 = int(lm_e.x * w), int(lm_e.y * h)
        cv2.line(overlay, (x1, y1), (x2, y2), (0, 230, 80), 2, cv2.LINE_AA)

    # Tegn leddpunkter
    joint_indices = set(i for pair in SKELETON_CONNECTIONS for i in pair)
    for idx in joint_indices:
        lm = landmarks[idx]
        if lm.visibility < 0.3:
            continue
        x, y = int(lm.x * w), int(lm.y * h)
        cv2.circle(overlay, (x, y), 5, (255, 255, 255), -1, cv2.LINE_AA)
        cv2.circle(overlay, (x, y), 5, (0, 180, 60), 1, cv2.LINE_AA)

    return overlay


def get_video_rotation(cap) -> int:
    """Les rotasjonsmetadata fra video. Returnerer grader (0, 90, 180, 270)."""
    rotation = int(cap.get(cv2.CAP_PROP_ORIENTATION_META))
    if rotation not in (0, 90, 180, 270):
        rotation = 0
    return rotation


def apply_rotation(frame: np.ndarray, rotation: int) -> np.ndarray:
    """Roter frame basert på video-metadata."""
    if rotation == 90:
        return cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
    elif rotation == 180:
        return cv2.rotate(frame, cv2.ROTATE_180)
    elif rotation == 270:
        return cv2.rotate(frame, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return frame


def detect_phase_indices(video_path: str, rotation: int, total_frames: int) -> dict[str, int]:
    """
    Første passet: beregner frame-til-frame bevegelse og finner de 4 sving-fasene.
    - address:        første stabile frame (lav bevegelse, første 15%)
    - backswing_top:  roligste punkt mellom address og impact (pausen øverst)
    - impact:         frame med høyest bevegelse i midten av videoen
    - follow_through: 80% av veien mellom impact og slutten
    """
    cap = cv2.VideoCapture(video_path)
    motion_scores = []
    prev_gray = None
    fc = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame = apply_rotation(frame, rotation)
        # Nedskalert gråtone for rask bevegelsesberegning
        small = cv2.resize(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), (160, 90))
        if prev_gray is not None:
            motion_scores.append(float(cv2.absdiff(small, prev_gray).mean()))
        else:
            motion_scores.append(0.0)
        prev_gray = small
        fc += 1

    cap.release()
    n = len(motion_scores)
    if n < 8:
        # For korte videoer: fall tilbake til lik fordeling
        idxs = np.linspace(0, n - 1, 4, dtype=int)
        return {'address': int(idxs[0]), 'backswing_top': int(idxs[1]),
                'impact': int(idxs[2]), 'follow_through': int(idxs[3])}

    scores = np.array(motion_scores)

    # Impact: høyest bevegelse i 20–80% av videoen
    lo, hi = int(n * 0.20), int(n * 0.80)
    impact_idx = lo + int(np.argmax(scores[lo:hi]))

    # Address: roligste frame i første 15%
    addr_end = max(2, int(n * 0.15))
    address_idx = int(np.argmin(scores[:addr_end]))

    # Backswing top: roligste punkt i midtre 30-70% av address→impact
    span = impact_idx - address_idx
    bt_lo = address_idx + max(1, int(span * 0.3))
    bt_hi = address_idx + max(2, int(span * 0.7))
    backswing_idx = bt_lo + int(np.argmin(scores[bt_lo:bt_hi])) if bt_hi > bt_lo else bt_lo

    # Follow-through: 75% av veien etter impact mot slutten
    follow_idx = min(n - 1, impact_idx + int((n - 1 - impact_idx) * 0.75))

    return {
        'address':        address_idx,
        'backswing_top':  backswing_idx,
        'impact':         impact_idx,
        'follow_through': follow_idx,
    }


def extract_keyframes_for_preview(video_path: str) -> dict:
    """Rask preview: motion-basert keyframe-deteksjon uten pose-analyse."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError("Cannot open video file")
    rotation = get_video_rotation(cap)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    cap.release()

    phase_indices = detect_phase_indices(video_path, rotation, total_frames)
    targets = set(phase_indices.values())

    cap = cv2.VideoCapture(video_path)
    captured: dict[int, object] = {}
    fc = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if fc in targets:
            captured[fc] = apply_rotation(frame, rotation).copy()
        fc += 1
    cap.release()

    keyframes = {}
    for phase, idx in phase_indices.items():
        if idx in captured:
            keyframes[phase] = frame_to_base64(captured[idx])

    return {
        'phase_indices': phase_indices,
        'keyframes': keyframes,
        'total_frames': total_frames,
        'fps': fps,
    }


def analyze_video(video_path: str, frame_overrides: dict | None = None) -> tuple[dict, dict]:
    """Analyze golf swing video with MediaPipe. Returns (measurements, keyframe_images)."""
    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        raise ValueError("Cannot open video file")

    rotation = get_video_rotation(cap)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()

    # Bruk brukerens overstyring hvis gitt, ellers auto-deteksjon
    if frame_overrides:
        phase_indices = {k: int(v) for k, v in frame_overrides.items()}
    else:
        phase_indices = detect_phase_indices(video_path, rotation, total_frames)
    target_indices = set(phase_indices.values())

    # Andre pass: pose-analyse + hent nøkkelframes
    cap = cv2.VideoCapture(video_path)
    measurements = {}
    frame_count = 0
    frame_measurements = []
    captured_frames = {}

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame = apply_rotation(frame, rotation)

        if frame_count in target_indices:
            captured_frames[frame_count] = frame.copy()

        if frame_count % FRAME_SKIP == 0:
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = pose.process(rgb_frame)

            if results.pose_landmarks:
                landmarks = results.pose_landmarks.landmark

                left_shoulder = [landmarks[11].x, landmarks[11].y, landmarks[11].z]
                right_shoulder = [landmarks[12].x, landmarks[12].y, landmarks[12].z]
                left_hip = [landmarks[23].x, landmarks[23].y, landmarks[23].z]
                right_hip = [landmarks[24].x, landmarks[24].y, landmarks[24].z]
                left_elbow = [landmarks[13].x, landmarks[13].y, landmarks[13].z]
                left_wrist = [landmarks[15].x, landmarks[15].y, landmarks[15].z]
                left_knee = [landmarks[25].x, landmarks[25].y, landmarks[25].z]
                left_ankle = [landmarks[27].x, landmarks[27].y, landmarks[27].z]
                right_knee = [landmarks[26].x, landmarks[26].y, landmarks[26].z]
                right_ankle = [landmarks[28].x, landmarks[28].y, landmarks[28].z]
                nose = [landmarks[0].x, landmarks[0].y, landmarks[0].z]

                shoulder_rotation = calculate_angle(
                    [left_shoulder[0], 0, left_shoulder[2]],
                    [nose[0], 0, nose[2]],
                    [right_shoulder[0], 0, right_shoulder[2]]
                )
                hip_rotation = calculate_angle(
                    [left_hip[0], 0, left_hip[2]],
                    [nose[0], 0, nose[2]],
                    [right_hip[0], 0, right_hip[2]]
                )
                left_arm_angle = calculate_angle(left_shoulder, left_elbow, left_wrist)
                left_knee_flex = calculate_angle(left_hip, left_knee, left_ankle)
                right_knee_flex = calculate_angle(right_hip, right_knee, right_ankle)
                spine_angle = calculate_angle(
                    [left_shoulder[0], left_shoulder[1], 0],
                    [nose[0], nose[1], 0],
                    [left_hip[0], left_hip[1], 0]
                )

                frame_measurements.append({
                    'frame': frame_count,
                    'shoulder_rotation': round(shoulder_rotation, 1),
                    'hip_rotation': round(hip_rotation, 1),
                    'left_arm_angle': round(left_arm_angle, 1),
                    'left_knee_flex': round(left_knee_flex, 1),
                    'right_knee_flex': round(right_knee_flex, 1),
                    'spine_angle': round(spine_angle, 1),
                })

        frame_count += 1

    cap.release()

    # Knytt målinger til de detekterte fasene
    if frame_measurements:
        def closest_measurement(target_frame: int):
            return min(frame_measurements, key=lambda m: abs(m['frame'] - target_frame))

        measurements['address']        = closest_measurement(phase_indices['address'])
        measurements['backswing_top']  = closest_measurement(phase_indices['backswing_top'])
        measurements['impact']         = closest_measurement(phase_indices['impact'])
        measurements['follow_through'] = closest_measurement(phase_indices['follow_through'])

    # Bygg keyframe-bilder med skjelett-overlay
    keyframe_images = {}
    for phase, idx in phase_indices.items():
        if idx in captured_frames:
            frame = captured_frames[idx].copy()
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            kf_result = pose_static.process(rgb)
            if kf_result.pose_landmarks:
                frame = draw_skeleton(frame, kf_result.pose_landmarks.landmark)
            keyframe_images[phase] = frame_to_base64(frame)

    return measurements, keyframe_images


SKILL_CONTEXT = {
    "nybegynner": "Spilleren er nybegynner. Bruk enkelt språk, unngå teknisk sjargong, og gi oppmuntrende grunnleggende råd.",
    "middels": "Spilleren er på middels nivå. Gi balansert teknisk feedback med konkrete og praktiske råd.",
    "avansert": "Spilleren er avansert/erfaren golfer med lavt handicap. Bruk fagterminologi og gi dyptgående tekniske råd.",
}


def load_expert_examples() -> str:
    """Laster ekspert-annotasjoner og formaterer dem som few-shot-eksempler."""
    if not ANNOTATIONS_FILE.exists():
        return ""
    try:
        with open(ANNOTATIONS_FILE) as f:
            annotations = json.load(f)
        if not annotations:
            return ""
        examples = annotations[-3:]  # Bruk de 3 nyeste
        lines = ["\n\n## Eksempel-analyser fra sertifisert golfinstruktør:\n"]
        for ex in examples:
            lines.append(f"Nivå: {ex.get('skill_level', 'middels')}")
            lines.append(f"Oppsummering: {ex.get('summary', '')}")
            if ex.get('improvements'):
                for imp in ex['improvements'][:2]:
                    lines.append(f"- {imp.get('area', '')}: {imp.get('tip', '')}")
            if ex.get('priority_drill'):
                lines.append(f"Prioritert øvelse: {ex['priority_drill'].get('name', '')}")
            if ex.get('avoid_focus'):
                avoids = [a for a in ex['avoid_focus'] if a.strip()]
                if avoids:
                    lines.append(f"IKKE fokuser på: {', '.join(avoids)}")
            lines.append("")
        return "\n".join(lines)
    except Exception:
        return ""


def get_coaching_feedback(measurements: dict, keyframe_images: dict, skill_level: str = "middels", ball_flight: str = "", keyframe_images_front: dict | None = None) -> dict:
    """Get Claude-based coaching feedback using both video frames and measurements"""

    data_text = json.dumps(measurements, indent=2, ensure_ascii=False)
    skill_text = SKILL_CONTEXT.get(skill_level, SKILL_CONTEXT["middels"])
    ball_flight_text = ""
    if ball_flight and ball_flight.strip() and ball_flight.strip() != "vet_ikke":
        issues = [x.strip() for x in ball_flight.split(",") if x.strip() and x.strip() != "vet_ikke"]
        if issues:
            labels = {"tykk": "duff (klubben treffer bakken før ballen)", "tynn": "tynt balltreff (klubben skraper toppen av ballen)", "høyre": "høyreskru (ballen sveier til høyre, push/slice)", "venstre": "venstreskru (ballen sveier til venstre, hook/pull)"}
            described = [labels.get(i, i) for i in issues]
            ball_flight_text = f"\nSpilleren opplever spesielt disse problemene: {', '.join(described)}. Adresser disse konkret i analysen."

    expert_examples = load_expert_examples()

    system_prompt = f"""Du er en profesjonell golfinstruktør med 20 års erfaring.
{skill_text}
Du mottar fire nøkkelbilder fra en golfsving (adresse, topp av backswing, impact, follow-through)
samt biometriske målinger (kroppsvinkler) fra pose estimation.

Bruk bildene som primærgrunnlag for din analyse — se på grep, hodestilling, vektoverføring,
klubbbane og generell form. Bruk vinkeldataene for å bekrefte og presisere observasjonene dine.

Gi konkret, vennlig og handlingsrettet feedback på norsk.
Vær spesifikk — ikke generell. Referér til det du faktisk ser i bildene og/eller vinkeldataene.

Returner alltid svaret som gyldig JSON med denne strukturen:
{{
  "score": 0-100,
  "summary": "2-3 setningers oppsummering",
  "strengths": ["styrke 1", "styrke 2"],
  "improvements": [
    {{
      "area": "område",
      "issue": "konkret utfordring",
      "tip": "spesifikk tips",
      "impact": "high|medium|low",
      "phase": "address|backswing_top|impact|follow_through"
    }}
  ],
  "priority_drill": {{
    "name": "navn på øvelse",
    "description": "beskrivelse",
    "duration": "varighet"
  }}
}}

score er et tall mellom 0 og 100 som gjenspeiler den totale kvaliteten på svingen.
impact angir hvor stor effekt forbedringen vil ha på svingen (high/medium/low).
phase angir hvilken sving-fase forbedringen gjelder (bruk nøyaktig en av de fire verdiene).{ball_flight_text}{expert_examples}"""

    phase_labels = {
        'address': 'Adresse (utgangsstilling)',
        'backswing_top': 'Topp av backswing',
        'impact': 'Impact (treffpunkt)',
        'follow_through': 'Follow-through',
    }

    # Build multimodal content: side view images first
    content = []
    if keyframe_images:
        content.append({"type": "text", "text": "## Sidevideo — nøkkelbilder"})
        for phase in ['address', 'backswing_top', 'impact', 'follow_through']:
            if phase in keyframe_images:
                content.append({"type": "text", "text": f"**{phase_labels.get(phase, phase)}**"})
                content.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": keyframe_images[phase]}})

    # Front view images (if provided)
    if keyframe_images_front:
        content.append({"type": "text", "text": "## Frontvideo — nøkkelbilder"})
        for phase in ['address', 'backswing_top', 'impact', 'follow_through']:
            if phase in keyframe_images_front:
                content.append({"type": "text", "text": f"**{phase_labels.get(phase, phase)}**"})
                content.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": keyframe_images_front[phase]}})

    content.append({
        "type": "text",
        "text": f"Biometriske målinger (kroppsvinkler i grader):\n\n{data_text}\n\nAnalyser svingen og gi spesifikk feedback."
    })

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=system_prompt,
        messages=[{"role": "user", "content": content}]
    )
    
    # Extract JSON from response
    response_text = message.content[0].text
    
    # Try to parse JSON
    try:
        # Find JSON in response
        start_idx = response_text.find('{')
        end_idx = response_text.rfind('}') + 1
        if start_idx >= 0 and end_idx > start_idx:
            json_str = response_text[start_idx:end_idx]
            feedback = json.loads(json_str)
        else:
            # Fallback if no JSON found
            feedback = {
                "summary": response_text[:200],
                "strengths": ["God footwork", "Nice rhythm"],
                "improvements": [{"area": "Rotation", "issue": "Limited", "tip": "Practice rotation"}],
                "priority_drill": {"name": "Rotation Drills", "description": "Work on hip rotation", "duration": "15 min"}
            }
    except json.JSONDecodeError:
        feedback = {
            "summary": "Analysen av din sving er fullført.",
            "strengths": ["God teknikk"],
            "improvements": [{"area": "Generelt", "issue": "Se tips", "tip": "Øv regelmessig"}],
            "priority_drill": {"name": "Grunnleggende øvelser", "description": "Fokus på fundamentals", "duration": "20 min"}
        }
    
    return feedback


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok"}


@app.post("/preview")
async def preview_swing(
    file: UploadFile | None = File(default=None),
    file_front: UploadFile | None = File(default=None),
):
    """
    Rask forhåndsvisning: returnerer auto-detekterte keyframes uten AI-analyse.
    Brukes for å la brukeren bekrefte/justere frames før full analyse.
    """
    if not file and not file_front:
        raise HTTPException(status_code=400, detail="Minst én video er påkrevd.")

    primary = file if (file and file.filename) else file_front
    if primary.content_type not in ["video/mp4", "video/quicktime"]:
        raise HTTPException(status_code=400, detail="Kun MP4 og MOV er støttet")

    contents = await primary.read()
    if len(contents) > 100 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Videoen er for stor. Maks 100MB.")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    tmp_front_path = None
    try:
        result = extract_keyframes_for_preview(tmp_path)

        if file and file.filename and file_front and file_front.filename:
            contents_front = await file_front.read()
            with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp_f:
                tmp_f.write(contents_front)
                tmp_front_path = tmp_f.name
            front = extract_keyframes_for_preview(tmp_front_path)
            result['phase_indices_front'] = front['phase_indices']
            result['keyframes_front'] = front['keyframes']
            result['total_frames_front'] = front['total_frames']
            result['fps_front'] = front['fps']

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Preview feilet: {str(e)}")
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        if tmp_front_path and os.path.exists(tmp_front_path):
            os.remove(tmp_front_path)


@app.post("/analyze")
async def analyze_swing(
    file: UploadFile | None = File(default=None),
    file_front: UploadFile | None = File(default=None),
    skill_level: str = Form(default="middels"),
    ball_flight: str = Form(default=""),
    frame_overrides_side: str = Form(default=""),
    frame_overrides_front: str = Form(default=""),
):
    """
    Analyze a golf swing video
    
    - **file**: Video file (MP4 or MOV, max 100MB)
    """
    
    try:
        # Minst én video kreves
        if not file and not file_front:
            raise HTTPException(status_code=400, detail="Minst én video er påkrevd.")

        # Bruk sidevideo som primær, ellers frontvideo
        primary = file if (file and file.filename) else file_front
        secondary = file_front if (file and file.filename and file_front and file_front.filename) else None

        if primary.content_type not in ["video/mp4", "video/quicktime"]:
            raise HTTPException(status_code=400, detail="Kun MP4 og MOV er støttet")

        # Check file size (100MB limit)
        contents = await primary.read()
        if len(contents) > 100 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Videoen er for stor. Maks 100MB.")

        # Save temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
            tmp.write(contents)
            tmp_path = tmp.name

        tmp_front_path = None
        try:
            # Parse frame overrides fra bruker (hvis tilgjengelig)
            overrides_side = json.loads(frame_overrides_side) if frame_overrides_side else None
            overrides_front_parsed = json.loads(frame_overrides_front) if frame_overrides_front else None

            # Analyze primary video
            measurements, keyframe_images = analyze_video(tmp_path, overrides_side)
            if not measurements:
                raise HTTPException(status_code=400, detail="Kunne ikke analysere videoen. Prøv en annen video.")

            # Analyze secondary video (optional)
            keyframe_images_front = None
            if secondary:
                contents_front = await secondary.read()
                with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp_f:
                    tmp_f.write(contents_front)
                    tmp_front_path = tmp_f.name
                _, keyframe_images_front = analyze_video(tmp_front_path, overrides_front_parsed)

            # Get coaching feedback
            feedback = get_coaching_feedback(measurements, keyframe_images, skill_level, ball_flight, keyframe_images_front)

            feedback['measurements'] = measurements
            feedback['keyframes'] = keyframe_images
            return feedback

        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            if tmp_front_path and os.path.exists(tmp_front_path):
                os.remove(tmp_front_path)
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analyse feilet: {str(e)}")


ANNOTATIONS_FILE = Path("expert_annotations.json")


@app.post("/expert/submit")
async def expert_submit(request: Request):
    """Ta imot ekspert-annotasjon og lagre til fil"""
    try:
        data = await request.json()
        if ANNOTATIONS_FILE.exists():
            annotations = json.loads(ANNOTATIONS_FILE.read_text(encoding="utf-8"))
        else:
            annotations = []
        data["id"] = len(annotations) + 1
        data["timestamp"] = datetime.now().isoformat()
        annotations.append(data)
        ANNOTATIONS_FILE.write_text(json.dumps(annotations, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"success": True, "count": len(annotations)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Kunne ikke lagre: {str(e)}")


@app.get("/expert/annotations")
async def expert_annotations():
    """Hent alle ekspert-annotasjoner"""
    if not ANNOTATIONS_FILE.exists():
        return []
    return json.loads(ANNOTATIONS_FILE.read_text(encoding="utf-8"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
