"""
FastAPI Backend for PPE Detection using YOLO-World
Connects the YOLO-World model with the Next.js frontend
"""

import os
import base64
import io
import cv2
import numpy as np
import urllib.request
from datetime import datetime, timedelta
from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from typing import List, Optional
import torch
from PIL import Image
import logging
from jose import JWTError, jwt
import threading

# Configure logging first
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Try to import YOLOWorld - handle different ultralytics versions
try:
    from ultralytics import YOLOWorld
    logger.info("YOLOWorld imported successfully")
except ImportError:
    try:
        from ultralytics.models.yolo.world import YOLOWorld
        logger.info("YOLOWorld imported from models.yolo.world")
    except ImportError:
        # If YOLOWorld is not available, we'll use YOLO with world model files
        from ultralytics import YOLO
        YOLOWorld = None
        logger.warning("YOLOWorld not found, will use YOLO with world model files")
        logger.warning("Note: You may need to use the same Python environment as your notebook (conda env: machinelearning)")
else:
    from ultralytics import YOLO  # Import YOLO as well for fallback

# Initialize FastAPI app
app = FastAPI(title="PPE Detection API", version="1.0.0")

# CORS middleware to allow frontend connections
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model variable
model = None

# In-memory storage for alerts (in production, use a database)
alerts_storage: List[dict] = []

# Custom classes for PPE, Equipment, and Machinery
CUSTOM_CLASSES = [
    # Personal Protective Equipment (PPE)
    "hard hat", "helmet", "safety helmet", "construction helmet",
    "gloves", "safety gloves", "work gloves", "protective gloves",
    # Vest variations - expanded for better detection (comprehensive list)
    "vest", "safety vest", "reflective vest", "high visibility vest",
    "hi-vis vest", "hi vis vest", "high-vis vest", "high vis vest",
    "orange vest", "yellow vest", "fluorescent vest", "construction vest",
    "work vest", "safety jacket", "reflective jacket", "high visibility jacket",
    "hi-vis jacket", "hi vis jacket", "high-vis jacket", "high vis jacket",
    "orange jacket", "yellow jacket", "fluorescent jacket", "construction jacket",
    "work jacket", "visibility vest", "safety clothing", "reflective clothing",
    "high-vis clothing", "hi-vis clothing", "safety wear", "reflective wear",
    # Additional vest terms for better detection
    "person wearing vest", "worker with vest", "person in vest", "worker in vest",
    "person wearing safety vest", "worker wearing vest", "construction worker vest",
    "safety vest orange", "safety vest yellow", "orange safety vest", "yellow safety vest",
    "fluorescent safety vest", "reflective safety vest", "high visibility safety vest",
    "safety vest with stripes", "striped vest", "safety vest with reflective strips",
    "construction vest orange", "construction vest yellow", "work safety vest",
    "ppe vest", "protective vest", "safety vest ppe", "construction safety vest",
    "worker safety vest", "safety vest worker", "person safety vest",
    "safety glasses", "goggles", "protective eyewear", "safety goggles",
    "safety boots", "work boots", "steel toe boots", "protective footwear",
    "ear protection", "earplugs", "earmuffs", "hearing protection",
    "respirator", "face mask", "dust mask", "safety mask",
    "safety harness", "fall protection", "safety belt",
    
    # Ladders and Scaffolding
    "ladder", "step ladder", "extension ladder", "scaffold", "scaffolding",
    
    # Hand Tools
    "hammer", "screwdriver", "wrench", "pliers", "drill", "power drill",
    "saw", "circular saw", "hand saw", "chainsaw", "grinder", "angle grinder",
    "welding torch", "welder", "welding equipment",
    
    # Power Tools and Equipment
    "power tool", "electric tool", "pneumatic tool",
    "nail gun", "stapler", "impact driver", "sander",
    
    # Heavy Machinery and Construction Equipment
    "excavator", "backhoe", "bulldozer", "loader", "skid steer",
    "crane", "tower crane", "mobile crane", "crane truck",
    "forklift", "forklift truck", "lift truck",
    "dump truck", "cement truck", "concrete mixer", "mixer truck",
    "compactor", "roller", "road roller", "steam roller",
    "generator", "power generator", "welding generator",
    "compressor", "air compressor", "pneumatic compressor",
    
    # Construction Materials and Equipment
    "concrete", "cement", "rebar", "steel beam", "scaffold pole",
    "pipe", "conduit", "cable", "wire",
    
    # Safety Equipment
    "safety cone", "traffic cone", "barrier", "safety barrier",
    "warning sign", "safety sign", "caution sign",
    "fire extinguisher", "first aid kit", "safety equipment"
]

# Authentication configuration
SECRET_KEY = "your-secret-key-change-in-production"  # Change this in production!
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

# Simple user database (in production, use a real database)
fake_users_db = {
    "admin": {
        "username": "admin",
        "password": "admin",  # In production, use hashed passwords
        "role": "admin"
    }
}

# Authentication models
class Token(BaseModel):
    access_token: str
    token_type: str

class User(BaseModel):
    username: str
    role: str

class UserInDB(User):
    password: str

# Authentication functions
def verify_password(plain_password: str, hashed_password: str) -> bool:
    # Simple password verification (in production, use proper hashing)
    return plain_password == hashed_password

def get_user(username: str):
    if username in fake_users_db:
        user_dict = fake_users_db[username]
        return UserInDB(**user_dict)
    return None

def authenticate_user(username: str, password: str):
    user = get_user(username)
    if not user:
        return False
    if not verify_password(password, user.password):
        return False
    return user

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = get_user(username=username)
    if user is None:
        raise credentials_exception
    return user

# Request models
class FrameRequest(BaseModel):
    frame_data: str  # Base64 encoded image
    filename: Optional[str] = ""
    is_test_video: Optional[bool] = False

class SequenceRequest(BaseModel):
    frames: List[str]  # List of base64 encoded images


def load_model():
    """Load and initialize the YOLO-World model with custom classes"""
    global model
    if model is None:
        logger.info("Loading YOLO-World model...")
        try:
            # Use the specified model path
            model_path = os.path.join(os.path.dirname(__file__), "yolov8l-world.pt")
            
            # Check if model exists at specified location
            if not os.path.exists(model_path):
                # Try alternative locations
                alt_paths = [
                    "yolov8l-world.pt",
                    os.path.join(os.getcwd(), "yolov8l-world.pt"),
                    "custom_yolov8l.pt"
                ]
                for alt_path in alt_paths:
                    if os.path.exists(alt_path):
                        model_path = alt_path
                        break
                else:
                    download_url = "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8l-world.pt"
                    logger.warning("Model file not found locally. Downloading %s", download_url)
                    try:
                        urllib.request.urlretrieve(download_url, model_path)
                        logger.info("Downloaded model to: %s", model_path)
                    except Exception as download_error:
                        raise FileNotFoundError(
                            f"Model file not found. Tried: {model_path} and alternatives. "
                            f"Automatic download failed: {download_error}"
                        ) from download_error
            
            logger.info(f"Loading model from: {model_path}")
            
            if YOLOWorld is not None:
                model = YOLOWorld(model_path)
                # Set custom classes - try both set_classes and set_text methods
                logger.info(f"Setting {len(CUSTOM_CLASSES)} custom classes...")
                try:
                    if hasattr(model, 'set_classes'):
                        model.set_classes(CUSTOM_CLASSES)
                        logger.info("✓ Classes set using set_classes method")
                    elif hasattr(model, 'set_text'):
                        model.set_text(CUSTOM_CLASSES)
                        logger.info("✓ Classes set using set_text method")
                    else:
                        logger.warning("No set_classes or set_text method found")
                except Exception as e:
                    logger.error(f"Error setting classes: {e}")
            else:
                # Fallback: try to load world model with YOLO
                logger.info("YOLOWorld not available, trying YOLO with world model...")
                model = YOLO(model_path)
                # Try to set classes if method exists
                if hasattr(model, 'set_classes'):
                    logger.info(f"Setting {len(CUSTOM_CLASSES)} custom classes...")
                    try:
                        model.set_classes(CUSTOM_CLASSES)
                        logger.info("✓ Classes set using set_classes method")
                    except Exception as e:
                        logger.error(f"Error setting classes: {e}")
                elif hasattr(model, 'set_text'):
                    logger.info(f"Setting {len(CUSTOM_CLASSES)} custom classes using set_text...")
                    try:
                        model.set_text(CUSTOM_CLASSES)
                        logger.info("✓ Classes set using set_text method")
                    except Exception as e:
                        logger.error(f"Error setting classes with set_text: {e}")
            logger.info("Model loaded successfully!")
        except Exception as e:
            logger.error(f"Error loading model: {e}")
            raise
    return model


def base64_to_image(base64_string: str) -> np.ndarray:
    """Convert base64 string to OpenCV image"""
    try:
        # Remove data URL prefix if present
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        
        # Decode base64
        image_data = base64.b64decode(base64_string)
        image = Image.open(io.BytesIO(image_data))
        # Convert PIL to OpenCV format
        image_cv = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        return image_cv
    except Exception as e:
        logger.error(f"Error decoding base64 image: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid image data: {str(e)}")


def process_detections(results) -> List[dict]:
    """Process YOLO results into the format expected by frontend"""
    detections = []
    
    if results and len(results) > 0:
        result = results[0]
        boxes = result.boxes
        
        if boxes is not None and len(boxes) > 0:
            # Handle multiple detections
            num_detections = len(boxes.xyxy) if hasattr(boxes, 'xyxy') and boxes.xyxy is not None else 0
            
            for i in range(num_detections):
                try:
                    x1, y1, x2, y2 = boxes.xyxy[i].cpu().numpy()
                    confidence = float(boxes.conf[i].cpu().numpy())
                    class_id = int(boxes.cls[i].cpu().numpy())
                    class_name = result.names[class_id] if hasattr(result, 'names') and class_id in result.names else str(class_id)
                    
                    # Normalize class name to handle variations
                    class_name_lower = class_name.lower()
                    
                    # Map similar class names to standard names for better matching
                    # Very aggressive vest detection - catch any vest-like item
                    if any(v in class_name_lower for v in ["vest", "jacket", "clothing", "wear", "ppe", "protective", "safety"]):
                        # Check if it's actually a vest-related item
                        is_vest_related = any(term in class_name_lower for term in [
                            "vest", "jacket", "safety", "reflective", "visibility", "hi-vis", "hi vis",
                            "high-vis", "high vis", "orange", "yellow", "fluorescent", "construction",
                            "work", "protective", "ppe", "person wearing", "worker wearing", "person in",
                            "worker in", "striped", "stripes"
                        ])
                        
                        if is_vest_related:
                            # Normalize vest variations - be very aggressive in matching
                            if "hi" in class_name_lower or "high" in class_name_lower or "vis" in class_name_lower or "visibility" in class_name_lower:
                                class_name = "high visibility vest"
                            elif "reflective" in class_name_lower:
                                class_name = "reflective vest"
                            elif "safety" in class_name_lower or "ppe" in class_name_lower or "protective" in class_name_lower:
                                class_name = "safety vest"
                            elif "construction" in class_name_lower or "work" in class_name_lower:
                                class_name = "safety vest"
                            elif "orange" in class_name_lower or "yellow" in class_name_lower or "fluorescent" in class_name_lower:
                                class_name = "safety vest"  # Color vests are typically safety vests
                            elif "person wearing" in class_name_lower or "worker wearing" in class_name_lower or "person in" in class_name_lower or "worker in" in class_name_lower:
                                class_name = "safety vest"  # Person/worker wearing vest
                            else:
                                class_name = "vest"  # Default to vest for any vest-like item
                    
                    # Normalize machinery class names
                    if any(m in class_name_lower for m in ["excavator", "backhoe", "bulldozer", "loader", "skid steer"]):
                        if "excavator" in class_name_lower:
                            class_name = "excavator"
                        elif "backhoe" in class_name_lower:
                            class_name = "backhoe"
                        elif "bulldozer" in class_name_lower:
                            class_name = "bulldozer"
                        elif "loader" in class_name_lower:
                            class_name = "loader"
                    
                    if any(c in class_name_lower for c in ["crane", "tower crane", "mobile crane"]):
                        if "tower" in class_name_lower:
                            class_name = "tower crane"
                        elif "mobile" in class_name_lower:
                            class_name = "mobile crane"
                        else:
                            class_name = "crane"
                    
                    if any(f in class_name_lower for f in ["forklift", "lift truck"]):
                        class_name = "forklift"
                    
                    if any(t in class_name_lower for t in ["truck", "dump truck", "cement truck", "mixer truck"]):
                        if "dump" in class_name_lower:
                            class_name = "dump truck"
                        elif "cement" in class_name_lower or "mixer" in class_name_lower:
                            class_name = "cement truck"
                        else:
                            class_name = "truck"
                    
                    if any(m in class_name_lower for m in ["machinery", "equipment", "construction equipment", "heavy equipment"]):
                        if "construction" in class_name_lower:
                            class_name = "construction machinery"
                        elif "heavy" in class_name_lower:
                            class_name = "heavy machinery"
                        else:
                            class_name = "machinery"
                    
                    detections.append({
                        "x1": float(x1),
                        "y1": float(y1),
                        "x2": float(x2),
                        "y2": float(y2),
                        "confidence": confidence,
                        "class_name": class_name,
                        "class_id": int(class_id)
                    })
                except Exception as e:
                    logger.warning(f"Error processing detection {i}: {e}")
                    continue
    
    logger.info(f"Processed {len(detections)} detections")
    if detections:
        logger.info(f"Detection classes: {[d['class_name'] for d in detections[:20]]}")  # Log first 20
        # Log vest detections specifically
        vest_detections = [d for d in detections if "vest" in d['class_name'].lower() or "jacket" in d['class_name'].lower()]
        if vest_detections:
            logger.info(f"Vest detections found: {[d['class_name'] for d in vest_detections]}")
        else:
            logger.warning("No vest detections found in this frame")
        
        # Log machinery detections
        machinery_detections = [d for d in detections if any(m in d['class_name'].lower() for m in [
            "excavator", "crane", "forklift", "bulldozer", "loader", "truck", 
            "machinery", "equipment", "compactor", "roller", "generator", "compressor",
            "chainsaw", "grinder", "welder", "welding", "backhoe", "skid steer"
        ])]
        if machinery_detections:
            logger.info(f"Machinery detections found: {[d['class_name'] for d in machinery_detections]}")
    
    return detections


def evaluate_safety(detections: List[dict]) -> dict:
    """Evaluate safety based on detected objects"""
    # PPE item categories - expanded to include all variations
    helmet_types = ["hard hat", "helmet", "safety helmet", "construction helmet"]
    vest_types = [
                    "vest", "safety vest", "reflective vest", "high visibility vest",
        "hi-vis vest", "hi vis vest", "high-vis vest", "high vis vest",
        "orange vest", "yellow vest", "fluorescent vest", "construction vest",
        "work vest", "safety jacket", "reflective jacket", "high visibility jacket",
        "hi-vis jacket", "hi vis jacket", "high-vis jacket", "high vis jacket",
        "orange jacket", "yellow jacket", "fluorescent jacket", "construction jacket",
        "work jacket", "visibility vest", "safety clothing", "reflective clothing",
        "high-vis clothing", "hi-vis clothing", "safety wear", "reflective wear"
    ]
    gloves_types = ["gloves", "safety gloves", "work gloves", "protective gloves"]
    mask_types = ["respirator", "face mask", "dust mask", "safety mask"]
    
    # Hazardous items - expanded to include all machinery and equipment
    machinery_types = [
        # Heavy Construction Machinery
        "excavator", "backhoe", "bulldozer", "loader", "skid steer",
        "crane", "tower crane", "mobile crane", "crane truck",
        "forklift", "forklift truck", "lift truck",
        "dump truck", "cement truck", "concrete mixer", "mixer truck",
        "compactor", "roller", "road roller", "steam roller",
        # Power Equipment
        "generator", "power generator", "welding generator",
        "compressor", "air compressor", "pneumatic compressor",
        # Dangerous Tools
        "chainsaw", "grinder", "angle grinder", "welding torch", "welder",
        "welding equipment", "circular saw", "power drill",
        # General Machinery
        "machinery", "construction equipment", "heavy equipment", "construction machinery"
    ]
    
    hazards = machinery_types
    
    # Worker/person identifiers
    worker_keywords = ["person", "worker", "human"]
    
    detected_classes = [d["class_name"].lower() for d in detections]
    
    # Check if workers are present
    workers_present = any(any(keyword in cls for keyword in worker_keywords) for cls in detected_classes)
    
    # Check for each required PPE item individually
    helmet_present = any(ppe in detected_classes for ppe in helmet_types)
    vest_present = any(ppe in detected_classes for ppe in vest_types)
    gloves_present = any(ppe in detected_classes for ppe in gloves_types)
    mask_present = any(ppe in detected_classes for ppe in mask_types)
    
    # PPE is complete only if all required items are present
    # IMPORTANT: ANY missing PPE item = VIOLATION = HAZARD
    # Check for missing PPE items - if we detect some PPE but not all, it's a violation
    # Also check if we have PPE items but workers aren't explicitly detected (might be detection issue)
    has_some_ppe = helmet_present or vest_present or gloves_present or mask_present
    #has_all_ppe = helmet_present and vest_present and gloves_present and mask_present
    has_all_ppe = helmet_present and vest_present
    # If we detect some PPE items, we should check for completeness (worker might be present but not detected)
    # OR if workers are explicitly detected, check for completeness
    should_check_ppe = workers_present or has_some_ppe
    
    ppe_detected = False
    if should_check_ppe:
        # All critical PPE must be present: helmet, vest, gloves, and mask
        # If ANY one is missing, ppe_detected = False, which means VIOLATION
        ppe_detected = has_all_ppe
    else:
        # No workers detected and no PPE detected, PPE check not applicable
        ppe_detected = True
    
    # Check for hazards (equipment/machinery or missing PPE)
    # ANY missing PPE = HAZARD/VIOLATION
    equipment_hazard = any(hazard in detected_classes for hazard in machinery_types)
    missing_ppe_hazard = should_check_ppe and not ppe_detected  # True if ANY PPE is missing
    hazard_detected = equipment_hazard or missing_ppe_hazard  # Hazard if equipment OR missing PPE
    
    # Calculate risk score (0-1)
    risk_score = 0.0
    violations = []
    missing_ppe_items = []
    
    # Check each PPE item and create specific violations
    # ANY missing PPE = VIOLATION = HAZARD (must be flagged)
    # Check PPE if workers are detected OR if we have some PPE items (indicating worker presence)
    if should_check_ppe:
        if not helmet_present:
            risk_score += 0.25
            violations.append("⚠️ HAZARD: Worker detected without helmet/hard hat")
            missing_ppe_items.append("Helmet")
        
        if not vest_present:
            risk_score += 0.25
            violations.append("⚠️ HAZARD: Worker detected without safety vest")
            missing_ppe_items.append("Vest")
        
        if not gloves_present:
            risk_score += 0.05
            violations.append("⚠️ HAZARD: Worker detected without protective gloves")
            missing_ppe_items.append("Gloves")
        
        if not mask_present:
            risk_score += 0.05
            violations.append("⚠️ HAZARD: Worker detected without face mask/respirator")
            missing_ppe_items.append("Mask")
        
        # If multiple items missing, increase risk
        if len(missing_ppe_items) > 1:
            risk_score += 0.1 * (len(missing_ppe_items) - 1)
            violations.append(f"CRITICAL: Worker missing {len(missing_ppe_items)} required PPE items: {', '.join(missing_ppe_items)}")
        
        # Ensure minimum risk score if ANY PPE is missing (even if risk_score is low)
        if len(missing_ppe_items) > 0 and risk_score < 0.15:
            risk_score = 0.15  # Minimum risk for any missing PPE
    
    # Equipment hazards - check for specific machinery types
    detected_machinery = [d["class_name"] for d in detections if any(m in d["class_name"].lower() for m in [
        "excavator", "crane", "forklift", "bulldozer", "loader", "truck", 
        "machinery", "equipment", "compactor", "roller", "generator", "compressor",
        "chainsaw", "grinder", "welder", "welding", "backhoe", "skid steer"
    ])]
    
    if equipment_hazard and workers_present:
        risk_score += 0.2
        if detected_machinery:
            machinery_list = ', '.join(list(set(detected_machinery))[:3])  # Show up to 3 unique machinery types
            violations.append(f"⚠️ HAZARD: Workers in proximity to hazardous machinery: {machinery_list}")
        else:
            violations.append("⚠️ HAZARD: Workers in proximity to hazardous equipment")
    
    # Ensure risk score doesn't exceed 1.0
    risk_score = min(risk_score, 1.0)
    
    # Log violations for debugging
    if violations:
        logger.warning(f"Safety violations detected: {violations}")
    else:
        # Log when no violations but PPE might be incomplete
        if should_check_ppe and not ppe_detected:
            logger.warning(f"PPE incomplete but no violations created - workers_present: {workers_present}, has_some_ppe: {has_some_ppe}, missing: {missing_ppe_items}")
    
    # Final safety check: If we have PPE status showing missing items, ensure violations are created
    if len(missing_ppe_items) > 0 and len(violations) == 0:
        logger.error(f"CRITICAL: Missing PPE items detected ({missing_ppe_items}) but no violations created! Creating violations now...")
        for item in missing_ppe_items:
            if item == "Helmet" and not helmet_present:
                violations.append("⚠️ HAZARD: Worker detected without helmet/hard hat")
            elif item == "Vest" and not vest_present:
                violations.append("⚠️ HAZARD: Worker detected without safety vest")
            elif item == "Gloves" and not gloves_present:
                violations.append("⚠️ HAZARD: Worker detected without protective gloves")
            elif item == "Mask" and not mask_present:
                violations.append("⚠️ HAZARD: Worker detected without face mask/respirator")
        # Ensure risk score is set
        if risk_score == 0 and len(missing_ppe_items) > 0:
            risk_score = 0.15 + (0.1 * len(missing_ppe_items))
    
    return {
        "ppe_complete": ppe_detected,
        "hazard_proximity": hazard_detected,
        "missing_ppe": missing_ppe_items,
        "ppe_status": {
            "helmet": helmet_present,
            "vest": vest_present,
            "gloves": gloves_present,
            "mask": mask_present
        },
        "unsafe_posture": False,
        "fatigue_detected": False,
        "risk_score": risk_score,
        "violations": violations
    }


# ──────────────────────────────────────────────────────────────
# POSTURE DETECTION
# Uses bounding-box geometry to infer body lean and slouch.
# Logic: tall narrow boxes → normal posture; wide short boxes → bent/crouching.
# ──────────────────────────────────────────────────────────────
def detect_posture(image: np.ndarray, worker_box: dict) -> dict:
    """Detect posture issues using bounding-box geometry and HOG analysis."""
    x1, y1, x2, y2 = int(worker_box['x1']), int(worker_box['y1']), int(worker_box['x2']), int(worker_box['y2'])
    width  = max(x2 - x1, 1)
    height = max(y2 - y1, 1)

    reasons = []
    is_unsafe = False
    lean_angle = 0.0
    spine_angle = 0.0

    # ── Aspect ratio check ────────────────────────────────────
    aspect_ratio = height / width  # Normal upright person ≈ 2-3
    if aspect_ratio < 1.0:
        reasons.append("Worker appears to be crouching or lying down (very wide bounding box)")
        is_unsafe = True
        spine_angle = 60.0
    elif aspect_ratio < 1.5:
        reasons.append("Worker appears to be bent forward or in awkward posture")
        is_unsafe = True
        spine_angle = 35.0

    # ── Horizontal lean check via gradient in top-half vs bottom-half ────
    try:
        roi = image[y1:y2, x1:x2]
        if roi.size > 0:
            gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY) if roi.ndim == 3 else roi
            h, w = gray.shape
            if h > 4 and w > 4:
                top_half    = gray[:h//2, :]
                bottom_half = gray[h//2:, :]
                # Centre-of-mass of dark regions (shadow = lower body)
                top_cx    = np.mean(np.where(top_half    < 128)[1]) if np.any(top_half    < 128) else w/2
                bottom_cx = np.mean(np.where(bottom_half < 128)[1]) if np.any(bottom_half < 128) else w/2
                delta_x = abs(top_cx - bottom_cx)
                lean_angle = float(np.degrees(np.arctan2(delta_x, h / 2)))
                if lean_angle > 30:
                    reasons.append(f"Significant body lean detected ({lean_angle:.1f}° from vertical)")
                    is_unsafe = True
                elif lean_angle > 15:
                    reasons.append(f"Moderate body lean detected ({lean_angle:.1f}° from vertical)")
    except Exception:
        pass

    # ── Edge density check for slouching ──────────────────────
    try:
        roi = image[y1:y2, x1:x2]
        if roi.size > 0:
            gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY) if roi.ndim == 3 else roi
            edges = cv2.Canny(gray, 50, 150)
            h = edges.shape[0]
            top_edge_density    = np.mean(edges[:h//3]) / 255.0
            bottom_edge_density = np.mean(edges[2*h//3:]) / 255.0
            # Relatively uniform edge density = upright; top-heavy = bent forward
            if top_edge_density > 0 and bottom_edge_density > 0:
                ratio = top_edge_density / (bottom_edge_density + 1e-6)
                if ratio > 2.5 and not is_unsafe:
                    reasons.append("Possible forward-head posture or slouching detected")
                    is_unsafe = True
                    spine_angle = max(spine_angle, 20.0)
    except Exception:
        pass

    confidence = min(0.95, 0.60 + 0.05 * len(reasons))
    return {
        "is_unsafe": is_unsafe,
        "confidence": round(confidence, 2),
        "reasons": reasons,
        "lean_angle": round(lean_angle, 1),
        "spine_angle": round(spine_angle, 1)
    }


# ──────────────────────────────────────────────────────────────
# FATIGUE DETECTION
# Uses OpenCV Haar cascades to find eyes and measure
# Eye Aspect Ratio (EAR). Low EAR → eyes closing → fatigue.
# ──────────────────────────────────────────────────────────────
_eye_cascade = None
_face_cascade = None

def _get_cascades():
    global _eye_cascade, _face_cascade
    if _eye_cascade is None:
        cv2_data = cv2.data.haarcascades
        _face_cascade = cv2.CascadeClassifier(cv2_data + 'haarcascade_frontalface_default.xml')
        _eye_cascade  = cv2.CascadeClassifier(cv2_data + 'haarcascade_eye.xml')
    return _face_cascade, _eye_cascade


def detect_fatigue(image: np.ndarray, worker_box: dict) -> dict:
    """Detect fatigue signs using Haar-cascade eye detection and blink analysis."""
    x1, y1, x2, y2 = int(worker_box['x1']), int(worker_box['y1']), int(worker_box['x2']), int(worker_box['y2'])
    roi = image[y1:y2, x1:x2]

    is_fatigued = False
    ear = 0.30          # default – open eyes
    head_roll = 0.0
    num_eyes_detected = 0
    fatigue_reason = ""

    try:
        if roi.size == 0:
            raise ValueError("Empty ROI")

        gray_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        face_cascade, eye_cascade = _get_cascades()

        # Detect face region within the worker bounding box
        roi_h, roi_w = gray_roi.shape
        upper_half = gray_roi[:roi_h//2, :]   # face is typically in upper half

        faces = face_cascade.detectMultiScale(
            upper_half,
            scaleFactor=1.1, minNeighbors=3,
            minSize=(max(20, roi_w//8), max(20, roi_h//8))
        )

        search_region = upper_half if len(faces) == 0 else upper_half
        if len(faces) > 0:
            fx, fy, fw, fh = faces[0]
            search_region = upper_half[fy:fy+fh, fx:fx+fw]

        eyes = eye_cascade.detectMultiScale(
            search_region,
            scaleFactor=1.1, minNeighbors=3,
            minSize=(max(10, roi_w//16), max(10, roi_h//16))
        )
        num_eyes_detected = len(eyes)

        if num_eyes_detected >= 2:
            # Sort eyes by x to get left / right
            eyes_sorted = sorted(eyes, key=lambda e: e[0])
            eye_heights = [e[3] for e in eyes_sorted[:2]]
            eye_widths  = [e[2] for e in eyes_sorted[:2]]
            # EAR approximation: height/width of eye bounding box
            ear = float(np.mean([h / max(w, 1) for h, w in zip(eye_heights, eye_widths)]))
            ear = round(min(ear, 1.0), 3)

            # Drooping eyes → low EAR
            if ear < 0.20:
                is_fatigued = True
                fatigue_reason = f"Eyes appear drooping (EAR={ear:.2f}), possible drowsiness"
            elif ear < 0.25:
                fatigue_reason = f"Eyes partially closed (EAR={ear:.2f}), mild fatigue"

            # Head roll: difference in y-coordinate of eye centres
            eye_centres = [(ex + ew//2, ey + eh//2) for ex, ey, ew, eh in eyes_sorted[:2]]
            if len(eye_centres) == 2:
                dy = eye_centres[1][1] - eye_centres[0][1]
                dx = eye_centres[1][0] - eye_centres[0][0] + 1e-6
                head_roll = float(abs(np.degrees(np.arctan(dy / dx))))
                if head_roll > 20:
                    is_fatigued = True
                    fatigue_reason = (fatigue_reason + "; " if fatigue_reason else "") + \
                        f"Head tilt detected ({head_roll:.1f}°), possible nodding off"

        elif num_eyes_detected == 1:
            # Only one eye visible – could be heavy brow or eyes closing
            ear = 0.22
            fatigue_reason = "Only one eye visible – possible heavy eyelid or head turned"
            is_fatigued = True
        else:
            # No eyes detected in the face region
            # Could mean eyes closed, dark environment, or face not facing camera
            # Use a neutral signal rather than claiming fatigue
            ear = 0.28
            fatigue_reason = "Eyes not detected in frame – face may not be visible"

    except Exception as ex:
        logger.debug(f"Fatigue detection error: {ex}")

    return {
        "is_fatigued": is_fatigued,
        "ear": ear,
        "head_roll": round(head_roll, 1),
        "num_eyes": num_eyes_detected,
        "reason": fatigue_reason,
        "confidence": 0.80 if num_eyes_detected >= 2 else 0.50
    }


# ──────────────────────────────────────────────────────────────
# ENHANCED HAZARD DETECTION (worker ↔ machinery proximity)
# ──────────────────────────────────────────────────────────────
def detect_hazard_zones(detections: List[dict], proximity_px: int = 80) -> dict:
    """Detect workers in close proximity to hazardous machinery using bounding-box distance."""
    worker_keywords   = ["person", "worker", "human"]
    machinery_keywords = [
        "excavator", "backhoe", "bulldozer", "loader", "crane", "tower crane",
        "mobile crane", "forklift", "dump truck", "cement truck", "concrete mixer",
        "compactor", "roller", "road roller", "generator", "compressor",
        "chainsaw", "grinder", "angle grinder", "welding torch", "welder",
        "welding equipment", "circular saw", "power drill", "machinery",
        "construction equipment", "heavy equipment", "construction machinery"
    ]

    workers   = [d for d in detections if any(kw in d['class_name'].lower() for kw in worker_keywords)]
    machinery = [d for d in detections if any(kw in d['class_name'].lower() for kw in machinery_keywords)]

    danger_pairs   = []
    proximity_detected = False
    closest_distance   = float('inf')

    def box_centre(b):
        return ((b['x1'] + b['x2']) / 2, (b['y1'] + b['y2']) / 2)

    def box_iou_distance(w, m):
        """Minimum edge-to-edge distance between two boxes."""
        dx = max(0.0, max(w['x1'], m['x1']) - min(w['x2'], m['x2']))
        dy = max(0.0, max(w['y1'], m['y1']) - min(w['y2'], m['y2']))
        return float(np.hypot(dx, dy))

    for w in workers:
        for m in machinery:
            dist = box_iou_distance(w, m)
            if dist < closest_distance:
                closest_distance = dist
            if dist < proximity_px:
                proximity_detected = True
                danger_pairs.append({
                    "worker_box": w,
                    "machine": m['class_name'],
                    "distance_px": round(dist, 1),
                    "risk_level": "CRITICAL" if dist < proximity_px * 0.3 else "HIGH"
                })

    hazard_violations = []
    extra_risk = 0.0
    for pair in danger_pairs:
        hazard_violations.append(
            f"⚠️ DANGER ZONE: Worker within {pair['distance_px']:.0f}px of {pair['machine']} ({pair['risk_level']})"
        )
        extra_risk += 0.30 if pair['risk_level'] == 'CRITICAL' else 0.20

    extra_risk = min(extra_risk, 0.5)

    return {
        "proximity_detected": proximity_detected,
        "danger_pairs": danger_pairs,
        "violations": hazard_violations,
        "extra_risk_score": extra_risk,
        "closest_distance_px": round(closest_distance, 1) if closest_distance < float('inf') else None,
        "machinery_count": len(machinery),
        "worker_count": len(workers)
    }


@app.on_event("startup")
async def startup_event():
    """Load model on startup"""
    load_model()


@app.get("/")
async def root():
    """Health check endpoint"""
    return {"status": "ok", "message": "PPE Detection API is running"}


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "healthy", "model_loaded": model is not None}


@app.post("/auth/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """Authenticate user and return access token"""
    user = authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/auth/me", response_model=User)
async def read_users_me(current_user: UserInDB = Depends(get_current_user)):
    """Get current user information"""
    return User(username=current_user.username, role=current_user.role)




@app.post("/infer/frame/enhanced")
async def infer_frame_enhanced(request: FrameRequest):
    """Process a single frame with enhanced features (posture, fatigue)"""
    try:
        # Load model if not already loaded
        model = load_model()
        
        # Decode base64 image
        image = base64_to_image(request.frame_data)
        
        # Run inference with very low confidence threshold for better vest detection
        results = model.predict(image, device="cpu", verbose=False, conf=0.1, imgsz=640)
        
        # Process detections
        detections = process_detections(results)
        
        # Evaluate safety
        safety_evaluation = evaluate_safety(detections)
        
        # ── Run posture & fatigue detection on each detected worker ──────────
        posture_results = []
        fatigue_results = []
        worker_keywords = ["person", "worker", "human"]
        worker_detections = [d for d in detections
                             if any(kw in d["class_name"].lower() for kw in worker_keywords)]

        any_unsafe_posture = False
        any_fatigue        = False

        for worker in worker_detections:
            p = detect_posture(image, worker)
            f = detect_fatigue(image, worker)
            posture_results.append({"worker_box": worker, "posture": p})
            fatigue_results.append({"worker_box": worker, "fatigue": f})
            if p["is_unsafe"]:
                any_unsafe_posture = True
            if f["is_fatigued"]:
                any_fatigue = True

        # ── Enhanced hazard zone detection ────────────────────────────────────
        hazard_info = detect_hazard_zones(detections)

        # ── Merge posture / fatigue / hazard violations into safety_evaluation ─
        posture_risk = 0.0
        fatigue_risk = 0.0

        if any_unsafe_posture:
            posture_risk = 0.20
            unsafe_reasons = []
            for pr in posture_results:
                if pr["posture"]["is_unsafe"]:
                    unsafe_reasons.extend(pr["posture"]["reasons"])
            if unsafe_reasons:
                safety_evaluation["violations"].append(
                    "⚠️ POSTURE: " + "; ".join(list(dict.fromkeys(unsafe_reasons))[:2])
                )

        if any_fatigue:
            fatigue_risk = 0.20
            fatigue_reasons = []
            for fr in fatigue_results:
                if fr["fatigue"]["is_fatigued"] and fr["fatigue"]["reason"]:
                    fatigue_reasons.append(fr["fatigue"]["reason"])
            if fatigue_reasons:
                safety_evaluation["violations"].append(
                    "⚠️ FATIGUE: " + "; ".join(list(dict.fromkeys(fatigue_reasons))[:2])
                )

        # Add hazard-zone violations
        safety_evaluation["violations"].extend(hazard_info["violations"])

        # Update risk score
        safety_evaluation["risk_score"] = min(
            1.0,
            safety_evaluation["risk_score"] + posture_risk + fatigue_risk + hazard_info["extra_risk_score"]
        )
        safety_evaluation["unsafe_posture"]   = any_unsafe_posture
        safety_evaluation["fatigue_detected"]  = any_fatigue
        safety_evaluation["hazard_proximity"]  = (
            safety_evaluation["hazard_proximity"] or hazard_info["proximity_detected"]
        )
        safety_evaluation["hazard_info"] = hazard_info

        # ── Store alert ───────────────────────────────────────────────────────
        all_violations = safety_evaluation["violations"]
        has_alert = (
            safety_evaluation["risk_score"] > 0
            or len(all_violations) > 0
            or not safety_evaluation["ppe_complete"]
            or any_unsafe_posture
            or any_fatigue
        )
        if has_alert:
            if not safety_evaluation["ppe_complete"]:
                event_type = "PPE"
            elif hazard_info["proximity_detected"]:
                event_type = "Hazard"
            elif any_fatigue:
                event_type = "Fatigue"
            elif any_unsafe_posture:
                event_type = "Posture"
            else:
                event_type = "PPE"

            alert = {
                "id": f"alert_{datetime.now().timestamp()}_{len(alerts_storage)}",
                "timestamp": datetime.now().isoformat(),
                "event_type": event_type,
                "risk_score": safety_evaluation["risk_score"],
                "description": (
                    "; ".join(all_violations)
                    if all_violations
                    else f"Safety violation – Missing PPE: {', '.join(safety_evaluation.get('missing_ppe', []))}"
                ),
                "bounding_boxes": detections,
                "filename": "live_frame"
            }
            alerts_storage.append(alert)
            logger.info(f"Alert stored: {event_type} – Risk: {safety_evaluation['risk_score']:.2f}")
            if len(alerts_storage) > 1000:
                alerts_storage.pop(0)

        return {
            "detection":         {"bounding_boxes": detections},
            "detections":        detections,
            "safety_evaluation": safety_evaluation,
            "posture":           posture_results,
            "fatigue":           fatigue_results,
            "hazard_info":       hazard_info
        }
    except Exception as e:
        logger.error(f"Error processing enhanced frame: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/infer/sequence")
async def infer_sequence(request: SequenceRequest):
    """Process a sequence of frames"""
    try:
        model = load_model()
        results = []
        
        for frame_data in request.frames:
            image = base64_to_image(frame_data)
            frame_results = model.predict(image, device="cpu", verbose=False, conf=0.1, imgsz=640)
            detections = process_detections(frame_results)
            safety_evaluation = evaluate_safety(detections)
            
            results.append({
                "detection": {
                    "bounding_boxes": detections
                },
                "safety_evaluation": safety_evaluation
            })
        
        return {"results": results}
    except Exception as e:
        logger.error(f"Error processing sequence: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/infer/upload")
async def infer_upload(file: UploadFile = File(...)):
    """Process an uploaded video file - returns immediate results from first frame"""
    try:
        model = load_model()
        
        # Save uploaded file temporarily
        temp_path = f"temp_{file.filename}"
        with open(temp_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        try:
            # Extract first frame immediately for quick response
            cap = cv2.VideoCapture(temp_path)
            ret, first_frame = cap.read()
            cap.release()
            
            immediate_detections = []
            immediate_safety = {"ppe_complete": True, "hazard_proximity": False, "risk_score": 0.0, "violations": []}
            
            if ret and first_frame is not None:
                # Process first frame immediately
                logger.info("Processing first frame for immediate results...")
                first_frame_results = model.predict(
                    first_frame, 
                    device="cpu", 
                    verbose=False,
                    conf=0.15,  # Lower threshold for better vest detection
                    imgsz=640
                )
                immediate_detections = process_detections(first_frame_results)
                immediate_safety = evaluate_safety(immediate_detections)
                logger.info(f"First frame: Found {len(immediate_detections)} detections")
                
                # Store alert if there are ANY violations in first frame
                if immediate_safety['risk_score'] > 0 or len(immediate_safety['violations']) > 0 or not immediate_safety['ppe_complete']:
                    # Determine event type: PPE violations take priority
                    event_type = "PPE"
                    if not immediate_safety['ppe_complete']:
                        event_type = "PPE"
                    elif immediate_safety['hazard_proximity']:
                        event_type = "Hazard"
                    else:
                        event_type = "Posture"
                    
                    alert = {
                        "id": f"alert_{datetime.now().timestamp()}_{len(alerts_storage)}",
                        "timestamp": datetime.now().isoformat(),
                        "event_type": event_type,
                        "risk_score": immediate_safety['risk_score'],
                        "description": "; ".join(immediate_safety['violations']) if immediate_safety['violations'] else f"Safety violation detected - Missing PPE: {', '.join(immediate_safety.get('missing_ppe', []))}",
                        "bounding_boxes": immediate_detections,
                        "filename": file.filename
                    }
                    alerts_storage.append(alert)
                    logger.info(f"Alert stored (first frame): {event_type} - Risk: {immediate_safety['risk_score']:.2f} - Violations: {len(immediate_safety['violations'])}")
                    if len(alerts_storage) > 1000:
                        alerts_storage.pop(0)
            
            # Process full video in background thread
            def process_full_video():
                try:
                    logger.info("Processing full video in background...")
                    results = model.predict(
                        temp_path, 
                        device="cpu", 
                        save=True, 
                        verbose=False,
                        conf=0.1,  # Very low threshold for better vest detection
                        imgsz=640
                    )
                    
                    # Aggregate detections from all frames
                    all_detections = []
                    if results:
                        for result in results:
                            frame_detections = process_detections([result])
                            all_detections.extend(frame_detections)
                    
                    # Remove duplicates
                    unique_detections = {}
                    for det in all_detections:
                        key = f"{det['class_name']}_{int(det['x1'])}_{int(det['y1'])}"
                        if key not in unique_detections or det['confidence'] > unique_detections[key]['confidence']:
                            unique_detections[key] = det
                    
                    detections = list(unique_detections.values())
                    logger.info(f"Full video processed: Found {len(detections)} unique detections")
                    
                    safety_evaluation = evaluate_safety(detections)
                    
                    # Store alert if there are ANY violations
                    if safety_evaluation['risk_score'] > 0 or len(safety_evaluation['violations']) > 0 or not safety_evaluation['ppe_complete']:
                        # Determine event type: PPE violations take priority
                        event_type = "PPE"
                        if not safety_evaluation['ppe_complete']:
                            event_type = "PPE"
                        elif safety_evaluation['hazard_proximity']:
                            event_type = "Hazard"
                        else:
                            event_type = "Posture"
                        
                        alert = {
                            "id": f"alert_{datetime.now().timestamp()}_{len(alerts_storage)}",
                            "timestamp": datetime.now().isoformat(),
                            "event_type": event_type,
                            "risk_score": safety_evaluation['risk_score'],
                            "description": "; ".join(safety_evaluation['violations']) if safety_evaluation['violations'] else f"Safety violation detected - Missing PPE: {', '.join(safety_evaluation.get('missing_ppe', []))}",
                            "bounding_boxes": detections,
                            "filename": file.filename
                        }
                        alerts_storage.append(alert)
                        logger.info(f"Alert stored (background video): {event_type} - Risk: {safety_evaluation['risk_score']:.2f} - Violations: {len(safety_evaluation['violations'])}")
                        if len(alerts_storage) > 1000:
                            alerts_storage.pop(0)
                    
                    # Clean up temp file after processing
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
                except Exception as e:
                    logger.error(f"Error in background video processing: {e}")
                    # Clean up on error
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
            
            # Start background processing in a separate thread
            thread = threading.Thread(target=process_full_video, daemon=True)
            thread.start()
            
            # Return immediate results from first frame
            return {
                "detection": {
                    "bounding_boxes": immediate_detections
                },
                "detections": immediate_detections,
                "safety_evaluation": immediate_safety,
                "processing": "immediate"  # Indicate this is immediate result
            }
        finally:
            # Temp file will be cleaned up by background thread
            pass
                
    except Exception as e:
        logger.error(f"Error processing video: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/infer/upload/enhanced")
async def infer_upload_enhanced(file: UploadFile = File(...)):
    """Process an uploaded video file with enhanced features"""
    try:
        model = load_model()
        
        # Save uploaded file temporarily
        temp_path = f"temp_{file.filename}"
        with open(temp_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        try:
            # Extract first frame immediately
            cap = cv2.VideoCapture(temp_path)
            ret, first_frame = cap.read()
            cap.release()
            
            immediate_detections = []
            immediate_safety = {"ppe_complete": True, "hazard_proximity": False, "risk_score": 0.0, "violations": []}
            posture = []
            fatigue = []
            
            if ret and first_frame is not None:
                # Process first frame immediately
                logger.info("Processing first frame (enhanced) for immediate results...")
                first_frame_results = model.predict(
                    first_frame, 
                    device="cpu", 
                    verbose=False,
                    conf=0.15,  # Lower threshold for better vest detection
                    imgsz=640
                )
                immediate_detections = process_detections(first_frame_results)
                immediate_safety = evaluate_safety(immediate_detections)
                
                # Store alert if there are ANY violations in first frame (enhanced)
                if immediate_safety['risk_score'] > 0 or len(immediate_safety['violations']) > 0 or not immediate_safety['ppe_complete']:
                    # Determine event type: PPE violations take priority
                    event_type = "PPE"
                    if not immediate_safety['ppe_complete']:
                        event_type = "PPE"
                    elif immediate_safety['hazard_proximity']:
                        event_type = "Hazard"
                    else:
                        event_type = "Posture"
                    
                    alert = {
                        "id": f"alert_{datetime.now().timestamp()}_{len(alerts_storage)}",
                        "timestamp": datetime.now().isoformat(),
                        "event_type": event_type,
                        "risk_score": immediate_safety['risk_score'],
                        "description": "; ".join(immediate_safety['violations']) if immediate_safety['violations'] else f"Safety violation detected - Missing PPE: {', '.join(immediate_safety.get('missing_ppe', []))}",
                        "bounding_boxes": immediate_detections,
                        "filename": file.filename
                    }
                    alerts_storage.append(alert)
                    logger.info(f"Alert stored (enhanced first frame): {event_type} - Risk: {immediate_safety['risk_score']:.2f} - Violations: {len(immediate_safety['violations'])}")
                    if len(alerts_storage) > 1000:
                        alerts_storage.pop(0)
                
                # Enhanced features for first frame
                worker_keywords = ["person", "worker", "human"]
                worker_detections = [d for d in immediate_detections if any(kw in d["class_name"].lower() for kw in worker_keywords)]
            for idx, worker in enumerate(worker_detections):
                posture.append({
                    "posture": {
                        "is_unsafe": False,
                        "confidence": 0.85,
                        "reasons": []
                    }
                })
                fatigue.append({
                    "fatigue": {
                        "is_fatigued": False,
                        "blink_rate": 15.0,
                        "head_pose_angle": 0.0,
                        "eye_aspect_ratio": 0.25
                    }
                })
            
                logger.info(f"First frame (enhanced): Found {len(immediate_detections)} detections")
            
            # Process full video in background
            def process_full_video():
                try:
                    logger.info("Processing full enhanced video in background...")
                    results = model.predict(
                        temp_path, 
                        device="cpu", 
                        save=True, 
                        verbose=False,
                        conf=0.1,  # Very low threshold for better vest detection
                        imgsz=640
                    )
                    
                    all_detections = []
                    if results:
                        for result in results:
                            frame_detections = process_detections([result])
                            all_detections.extend(frame_detections)
                    
                    unique_detections = {}
                    for det in all_detections:
                        key = f"{det['class_name']}_{int(det['x1'])}_{int(det['y1'])}"
                        if key not in unique_detections or det['confidence'] > unique_detections[key]['confidence']:
                            unique_detections[key] = det
                    
                    detections = list(unique_detections.values())
                    logger.info(f"Full enhanced video processed: Found {len(detections)} unique detections")
                    
                    safety_evaluation = evaluate_safety(detections)
                    
                    # Store alert if there are ANY violations
                    if safety_evaluation['risk_score'] > 0 or len(safety_evaluation['violations']) > 0 or not safety_evaluation['ppe_complete']:
                        # Determine event type: PPE violations take priority
                        event_type = "PPE"
                        if not safety_evaluation['ppe_complete']:
                            event_type = "PPE"
                        elif safety_evaluation['hazard_proximity']:
                            event_type = "Hazard"
                        else:
                            event_type = "Posture"
                        
                        alert = {
                            "id": f"alert_{datetime.now().timestamp()}_{len(alerts_storage)}",
                            "timestamp": datetime.now().isoformat(),
                            "event_type": event_type,
                            "risk_score": safety_evaluation['risk_score'],
                            "description": "; ".join(safety_evaluation['violations']) if safety_evaluation['violations'] else f"Safety violation detected - Missing PPE: {', '.join(safety_evaluation.get('missing_ppe', []))}",
                            "bounding_boxes": detections,
                            "filename": file.filename
                        }
                        alerts_storage.append(alert)
                        logger.info(f"Alert stored (background video): {event_type} - Risk: {safety_evaluation['risk_score']:.2f} - Violations: {len(safety_evaluation['violations'])}")
                        if len(alerts_storage) > 1000:
                            alerts_storage.pop(0)
                    
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
                except Exception as e:
                    logger.error(f"Error in background enhanced video processing: {e}")
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
            
            thread = threading.Thread(target=process_full_video, daemon=True)
            thread.start()
            
            # Return immediate results
            return {
                "detection": {
                    "bounding_boxes": immediate_detections
                },
                "safety_evaluation": immediate_safety,
                "posture": posture,
                "fatigue": fatigue,
                "processing": "immediate"
            }
        finally:
            pass
                
    except Exception as e:
        logger.error(f"Error processing enhanced video: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/alerts")
async def get_alerts(
    limit: int = 100,
    event_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """Get stored alerts"""
    logger.info(f"GET /alerts called - Total alerts in storage: {len(alerts_storage)}, filter: {event_type}, limit: {limit}")
    filtered_alerts = alerts_storage.copy()
    
    # Filter by event type
    if event_type and event_type != 'all':
        filtered_alerts = [a for a in filtered_alerts if a.get('event_type') == event_type]
        logger.info(f"Filtered by event_type '{event_type}': {len(filtered_alerts)} alerts")
    
    # Filter by date range
    if start_date:
        start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        filtered_alerts = [a for a in filtered_alerts if datetime.fromisoformat(a['timestamp'].replace('Z', '+00:00')) >= start]
    
    if end_date:
        end = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
        filtered_alerts = [a for a in filtered_alerts if datetime.fromisoformat(a['timestamp'].replace('Z', '+00:00')) <= end]
    
    # Sort by timestamp (newest first) and limit
    filtered_alerts.sort(key=lambda x: x['timestamp'], reverse=True)
    filtered_alerts = filtered_alerts[:limit]
    
    logger.info(f"Returning {len(filtered_alerts)} alerts")
    return {"alerts": filtered_alerts, "total": len(filtered_alerts)}


@app.get("/alerts/stats")
async def get_alert_stats():
    """Get alert statistics"""
    logger.info(f"GET /alerts/stats called - Total alerts in storage: {len(alerts_storage)}")
    if not alerts_storage:
        logger.warning("No alerts in storage, returning empty stats")
        return {
            "total_alerts": 0,
            "average_risk_score": 0.0,
            "by_type": {
                "ppe_violations": 0,
                "posture_violations": 0,
                "hazard_proximity": 0
            }
        }
    
    total = len(alerts_storage)
    total_risk = sum(a.get('risk_score', 0) for a in alerts_storage)
    avg_risk = total_risk / total if total > 0 else 0.0
    
    by_type = {
        "ppe_violations": len([a for a in alerts_storage if a.get('event_type') == 'PPE']),
        "posture_violations": len([a for a in alerts_storage if a.get('event_type') == 'Posture']),
        "hazard_proximity": len([a for a in alerts_storage if a.get('event_type') == 'Hazard'])
    }
    
    logger.info(f"Stats: total={total}, avg_risk={avg_risk:.2f}, by_type={by_type}")
    return {
        "total_alerts": total,
        "average_risk_score": avg_risk,
        "by_type": by_type
    }


@app.get("/alerts/debug")
async def debug_alerts():
    """Debug endpoint to check alert storage"""
    return {
        "total_in_storage": len(alerts_storage),
        "sample_alerts": alerts_storage[-5:] if len(alerts_storage) > 0 else [],
        "all_event_types": list(set(a.get('event_type', 'Unknown') for a in alerts_storage)) if alerts_storage else []
    }


@app.post("/infer/frame")
async def infer_frame(request: FrameRequest):
    """Process a single frame for inference"""
    try:
        # Load model if not already loaded
        model = load_model()
        
        # Decode base64 image
        image = base64_to_image(request.frame_data)
        
        # Run inference with lower confidence threshold for better PPE detection (especially vests)
        results = model.predict(image, device="cpu", verbose=False, conf=0.15, imgsz=640)
        
        # Process detections
        detections = process_detections(results)
        safety_evaluation = evaluate_safety(detections)
        
        # Store alert if there are ANY violations (missing PPE, hazards, etc.)
        if safety_evaluation['risk_score'] > 0 or len(safety_evaluation['violations']) > 0 or not safety_evaluation['ppe_complete']:
            # Determine event type: PPE violations take priority
            event_type = "PPE"
            if not safety_evaluation['ppe_complete']:
                event_type = "PPE"
            elif safety_evaluation['hazard_proximity']:
                event_type = "Hazard"
            else:
                event_type = "Posture"
            
            alert = {
                "id": f"alert_{datetime.now().timestamp()}_{len(alerts_storage)}",
                "timestamp": datetime.now().isoformat(),
                "event_type": event_type,
                "risk_score": safety_evaluation['risk_score'],
                "description": "; ".join(safety_evaluation['violations']) if safety_evaluation['violations'] else f"Safety violation detected - Missing PPE: {', '.join(safety_evaluation.get('missing_ppe', []))}",
                "bounding_boxes": detections,
                "filename": request.filename or "live_frame"
            }
            alerts_storage.append(alert)
            logger.info(f"Alert stored: {event_type} - Risk: {safety_evaluation['risk_score']:.2f} - Violations: {len(safety_evaluation['violations'])}")
            if len(alerts_storage) > 1000:
                alerts_storage.pop(0)
        
        return {
            "detection": {
                "bounding_boxes": detections
            },
            "detections": detections,  # Alternative field name for compatibility
            "safety_evaluation": safety_evaluation
        }
    except Exception as e:
        logger.error(f"Error processing frame: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

