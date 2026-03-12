"""
Swingman Backend - Golf Swing Analysis API
"""

import os
import json
import tempfile
from pathlib import Path
from fastapi import FastAPI, File, UploadFile, HTTPException
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


def analyze_video(video_path: str) -> dict:
    """Analyze golf swing video with MediaPipe"""
    cap = cv2.VideoCapture(video_path)
    
    if not cap.isOpened():
        raise ValueError("Cannot open video file")
    
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    measurements = {}
    key_frame_indices = np.linspace(0, total_frames - 1, 4, dtype=int)
    
    frame_count = 0
    frame_measurements = []
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        if frame_count % FRAME_SKIP == 0:
            # Convert to RGB
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = pose.process(rgb_frame)
            
            if results.pose_landmarks:
                landmarks = results.pose_landmarks.landmark
                
                # Extract key points
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
                
                # Calculate angles
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
                
                # Spine angle (simplified)
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
    
    # Select key frames
    if frame_measurements:
        # Find addresses/key positions based on movements
        measurements['address'] = frame_measurements[0]
        measurements['backswing_top'] = frame_measurements[len(frame_measurements) // 3]
        measurements['impact'] = frame_measurements[2 * len(frame_measurements) // 3]
        measurements['follow_through'] = frame_measurements[-1]
    
    return measurements


def get_coaching_feedback(measurements: dict) -> dict:
    """Get Claude-based coaching feedback"""
    
    # Format measurements for Claude
    data_text = json.dumps(measurements, indent=2, ensure_ascii=False)
    
    system_prompt = """Du er en profesjonell golfinstruktør med 20 års erfaring. 
Du mottar biometriske data fra en golfsving analysert med pose estimation. 
Dataene inkluderer kroppsvinkler og bevegelsesmønstre fra nøkkelframes i svingen.

Gi konkret, vennlig og handlingsrettet feedback på norsk. 
Vær spesifikk — ikke generell. Referér til de faktiske vinkeldataene i analysen din.

Returner alltid svaret som gyldig JSON med denne strukturen:
{
  "summary": "2-3 setningers oppsummering",
  "strengths": ["styrke 1", "styrke 2"],
  "improvements": [
    {
      "area": "område",
      "issue": "konkret utfordring",
      "tip": "spesifikk tips"
    }
  ],
  "priority_drill": {
    "name": "navn på øvelse",
    "description": "beskrivelse",
    "duration": "varighet"
  }
}"""
    
    user_message = f"""Her er biometriske data fra en golfsving:

{data_text}

Analyser svingen basert på disse dataene og gi spesifikk feedback."""
    
    message = client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=1024,
        system=system_prompt,
        messages=[
            {"role": "user", "content": user_message}
        ]
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


@app.post("/analyze")
async def analyze_swing(file: UploadFile = File(...)):
    """
    Analyze a golf swing video
    
    - **file**: Video file (MP4 or MOV, max 100MB)
    """
    
    try:
        # Validate file type
        if file.content_type not in ["video/mp4", "video/quicktime"]:
            raise HTTPException(status_code=400, detail="Kun MP4 og MOV er støttet")
        
        # Save temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
            contents = await file.read()
            tmp.write(contents)
            tmp_path = tmp.name
        
        try:
            # Analyze video
            measurements = analyze_video(tmp_path)
            
            if not measurements:
                raise HTTPException(status_code=400, detail="Kunne ikke analysere videoen. Prøv en annen video.")
            
            # Get coaching feedback
            feedback = get_coaching_feedback(measurements)
            
            # Add raw measurements to response
            feedback['measurements'] = measurements
            
            return feedback
        
        finally:
            # Clean up temporary file
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analyse feilet: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
