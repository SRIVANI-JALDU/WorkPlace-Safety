# Personal Protective Equipment (PPE) Detection System
## Factory Workers Safety Project

---

## Table of Contents
1. [Abstract](#1-abstract)
2. [Objectives](#2-objectives)
3. [Related Work](#3-related-work)
4. [Methodology](#4-methodology)
5. [Implementation](#5-implementation)
6. [Project Setup](#6-project-setup)
   - [6.1 Prerequisites](#61-prerequisites)
   - [6.2 Setup for macOS](#62-setup-for-macos)
   - [6.3 Setup for Windows](#63-setup-for-windows)
7. [Running the Project](#7-running-the-project)
8. [Project Structure](#8-project-structure)
9. [API Documentation](#9-api-documentation)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Abstract

The Personal Protective Equipment (PPE) Detection System is an intelligent computer vision solution designed to enhance workplace safety by automatically detecting whether factory workers are wearing required safety equipment. The system utilizes state-of-the-art deep learning models, specifically YOLO-World (YOLOv8-World), to perform real-time detection of PPE items such as hard hats, safety vests, gloves, masks, and safety glasses in images and video streams.

The project implements a full-stack application with a FastAPI backend for model inference and a Next.js frontend for real-time monitoring, alert management, and analytics. The system can process live camera feeds, uploaded videos, and static images to identify safety violations, generate alerts, and provide comprehensive safety analytics. By automating PPE compliance monitoring, the system helps reduce workplace accidents, ensures regulatory compliance, and creates safer working environments in industrial settings.

**Key Features:**
- Real-time PPE detection using YOLO-World model
- Detection of multiple PPE items (helmets, vests, gloves, masks, safety glasses)
- Hazard detection (machinery, equipment proximity)
- Risk scoring and violation tracking
- Live video monitoring and video upload processing
- Alert management system with filtering and analytics
- Web-based dashboard for monitoring and management
- JWT-based authentication system

---

## 2. Objectives

### Primary Objectives

1. **Automated PPE Compliance Monitoring**
   - Detect the presence or absence of required PPE items in real-time
   - Identify missing safety equipment (helmets, vests, gloves, masks)
   - Generate alerts when violations are detected

2. **Real-Time Safety Monitoring**
   - Process live camera feeds for continuous monitoring
   - Support video file uploads for batch processing
   - Provide immediate feedback on safety violations

3. **Hazard Detection and Risk Assessment**
   - Identify hazardous machinery and equipment in the vicinity
   - Calculate risk scores based on detected violations
   - Track worker proximity to dangerous equipment

4. **Comprehensive Safety Analytics**
   - Maintain historical records of safety violations
   - Generate statistics and trends on PPE compliance
   - Provide insights for safety management

5. **User-Friendly Interface**
   - Develop an intuitive web-based dashboard
   - Enable real-time visualization of detections
   - Support alert management and filtering

### Secondary Objectives

1. **Scalability and Performance**
   - Optimize model inference for real-time processing
   - Support multiple concurrent video streams
   - Efficient background processing for video files

2. **Extensibility**
   - Modular architecture for adding new detection capabilities
   - Support for custom model training
   - Easy integration with existing safety management systems

---

## 3. Related Work

### Computer Vision for Safety Monitoring

The application of computer vision and deep learning for workplace safety monitoring has gained significant attention in recent years. Several research works and commercial solutions have explored automated PPE detection:

1. **YOLO-Based Detection Systems**
   - YOLO (You Only Look Once) models have been widely adopted for real-time object detection
   - YOLOv8 and YOLO-World provide state-of-the-art performance with improved accuracy and speed
   - These models excel at detecting multiple object classes simultaneously

2. **PPE Detection Research**
   - Multiple studies have focused on detecting specific PPE items like hard hats and safety vests
   - Research has explored the use of CNNs, R-CNNs, and YOLO variants for PPE detection
   - Challenges include varying lighting conditions, occlusions, and different PPE designs

3. **Industrial Safety Systems**
   - Commercial solutions exist but often require expensive hardware and proprietary software
   - Open-source alternatives provide flexibility but may lack comprehensive features
   - Integration with existing safety management systems remains a challenge

### Technology Stack

- **YOLO-World**: A zero-shot object detection model that can detect objects based on text descriptions without requiring training on specific datasets
- **Ultralytics**: The library providing YOLOv8 and YOLO-World implementations
- **FastAPI**: Modern Python web framework for building high-performance APIs
- **Next.js**: React framework for building the frontend dashboard
- **OpenCV**: Computer vision library for image and video processing
- **PyTorch**: Deep learning framework used by YOLO models

---

## 4. Methodology

### 4.1 Detection Approach

The project employs a **zero-shot object detection** approach using YOLO-World, which allows detection of objects based on text descriptions without requiring extensive training on labeled datasets. This methodology offers several advantages:

1. **Flexibility**: Can detect new object classes by simply adding text descriptions
2. **No Training Required**: Uses pre-trained models that can be customized with class definitions
3. **Real-Time Performance**: Optimized for fast inference on standard hardware

### 4.2 Detection Pipeline

The detection process follows these steps:

1. **Image/Frame Acquisition**
   - Capture frames from live camera feed, uploaded video, or static image
   - Convert input to appropriate format (OpenCV BGR format)

2. **Preprocessing**
   - Resize images to model input size (640x640 pixels)
   - Normalize pixel values

3. **Model Inference**
   - Pass preprocessed image through YOLO-World model
   - Model uses custom class definitions (103+ classes including PPE items, machinery, tools)
   - Confidence threshold set to 0.1-0.15 for optimal detection sensitivity

4. **Post-Processing**
   - Extract bounding boxes, confidence scores, and class labels
   - Normalize class names (handle variations like "vest", "safety vest", "hi-vis vest")
   - Filter detections based on confidence thresholds

5. **Safety Evaluation**
   - Check for presence of required PPE items (helmet, vest, gloves, mask)
   - Identify hazardous machinery and equipment
   - Calculate risk scores based on violations
   - Generate violation alerts

6. **Alert Generation**
   - Store alerts in memory (or database in production)
   - Categorize alerts by type (PPE, Hazard, Posture)
   - Associate alerts with timestamps and metadata

### 4.3 Custom Class Definitions

The system uses an extensive list of custom classes (103+ items) organized into categories:

**PPE Items:**
- Head protection: hard hat, helmet, safety helmet, construction helmet
- Body protection: vest, safety vest, reflective vest, high visibility vest, safety jacket
- Hand protection: gloves, safety gloves, work gloves, protective gloves
- Eye protection: safety glasses, goggles, protective eyewear
- Respiratory protection: respirator, face mask, dust mask, safety mask
- Foot protection: safety boots, work boots, steel toe boots
- Other: ear protection, safety harness, fall protection

**Hazardous Equipment:**
- Heavy machinery: excavator, backhoe, bulldozer, loader, crane, forklift
- Power tools: chainsaw, grinder, welding torch, power drill
- Construction equipment: dump truck, cement truck, compactor, generator

### 4.4 Safety Evaluation Logic

The safety evaluation algorithm:

1. **Worker Detection**: Identifies presence of workers/persons in the frame
2. **PPE Completeness Check**: Verifies all required PPE items are present
   - Helmet/Hard Hat: Required
   - Safety Vest: Required
   - Gloves: Required
   - Mask/Respirator: Required
3. **Hazard Assessment**: Checks for dangerous machinery or equipment
4. **Risk Scoring**: Calculates risk score (0.0 to 1.0) based on:
   - Missing PPE items (0.25 per missing critical item)
   - Multiple missing items (additional 0.1 per additional item)
   - Proximity to hazardous equipment (+0.2)
5. **Violation Generation**: Creates specific violation messages for each missing item or hazard

### 4.5 System Architecture

The system follows a **client-server architecture**:

- **Backend (FastAPI)**: Handles model inference, safety evaluation, and alert management
- **Frontend (Next.js)**: Provides user interface for monitoring, alerts, and analytics
- **Communication**: RESTful API for inference requests, WebSocket for real-time updates (optional)

---

## 5. Implementation

### 5.1 Backend Implementation

#### 5.1.1 Model Loading (`backend_api.py`)

The backend initializes the YOLO-World model on startup:

```python
def load_model():
    """Load and initialize the YOLO-World model with custom classes"""
    model = YOLOWorld("yolov8l-world.pt")
    model.set_classes(CUSTOM_CLASSES)  # 103+ custom classes
    return model
```

**Key Features:**
- Lazy loading: Model loaded only when needed
- Custom class configuration: Sets 103+ detection classes
- Error handling: Handles different Ultralytics versions
- Fallback mechanisms: Supports both YOLOWorld and YOLO classes

#### 5.1.2 Frame Processing

The `/infer/frame` endpoint processes single frames:

1. Receives base64-encoded image
2. Decodes to OpenCV format
3. Runs model inference with confidence threshold 0.15
4. Processes detections and evaluates safety
5. Returns bounding boxes, safety evaluation, and violations

#### 5.1.3 Video Processing

The `/infer/upload` endpoint handles video files:

1. Saves uploaded video temporarily
2. Extracts first frame for immediate response
3. Processes first frame and returns results
4. Processes full video in background thread
5. Aggregates detections from all frames
6. Cleans up temporary files

#### 5.1.4 Safety Evaluation

The `evaluate_safety()` function:

- Checks for each required PPE item individually
- Identifies missing items
- Detects hazardous machinery
- Calculates risk scores
- Generates violation messages
- Returns comprehensive safety status

#### 5.1.5 Alert Management

- In-memory storage (can be replaced with database)
- Filtering by event type, date range
- Statistics generation
- Automatic cleanup (max 1000 alerts)

### 5.2 Frontend Implementation

#### 5.2.1 Dashboard (`frontend/app/dashboard/page.tsx`)

Main dashboard with tabbed interface:
- **Live Monitoring**: Real-time video processing
- **Alerts Dashboard**: View and filter safety alerts
- **Analytics Dashboard**: Statistics and trends
- **Settings**: Configuration options

#### 5.2.2 Live Monitoring (`frontend/components/LiveMonitoring.tsx`)

Features:
- Webcam capture and processing
- Video file upload
- Image upload
- Real-time detection visualization
- Bounding box overlay
- Safety status display
- Violation notifications

#### 5.2.3 Alerts Dashboard (`frontend/components/AlertsDashboard.tsx`)

Features:
- Alert listing with filtering
- Event type filtering (PPE, Hazard, Posture)
- Date range filtering
- Risk score visualization
- Alert details view

#### 5.2.4 Analytics Dashboard (`frontend/components/AnalyticsDashboard.tsx`)

Features:
- Total alerts statistics
- Average risk score
- Alerts by type (pie chart)
- Time-series trends
- Violation breakdown

### 5.3 Authentication System

- JWT-based authentication
- OAuth2 password flow
- Protected API endpoints
- Session management with Zustand store

### 5.4 API Endpoints

**Authentication:**
- `POST /auth/login`: User login
- `GET /auth/me`: Get current user info

**Inference:**
- `POST /infer/frame`: Process single frame
- `POST /infer/frame/enhanced`: Process frame with enhanced features
- `POST /infer/sequence`: Process sequence of frames
- `POST /infer/upload`: Process uploaded video
- `POST /infer/upload/enhanced`: Process video with enhanced features

**Alerts:**
- `GET /alerts`: Get alerts with filtering
- `GET /alerts/stats`: Get alert statistics
- `GET /alerts/debug`: Debug endpoint

**Health:**
- `GET /`: Health check
- `GET /health`: Detailed health status

---

## 6. Project Setup

### 6.1 Prerequisites

**Required Software:**
- Python 3.8 or higher
- Node.js 18.x or higher
- npm or yarn package manager
- Git (for cloning repository)

**System Requirements:**
- Minimum 4GB RAM (8GB+ recommended)
- 2GB free disk space for models and dependencies
- Webcam (for live monitoring feature)
- Internet connection (for downloading models and dependencies)

### 6.2 Setup for macOS

#### Step 1: Install Python

1. **Check if Python is installed:**
   ```bash
   python3 --version
   ```

2. **If not installed, install via Homebrew:**
   ```bash
   # Install Homebrew if not already installed
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   
   # Install Python
   brew install python3
   ```

3. **Alternatively, download from python.org:**
   - Visit https://www.python.org/downloads/
   - Download Python 3.8+ for macOS
   - Run the installer

#### Step 2: Install Node.js

1. **Check if Node.js is installed:**
   ```bash
   node --version
   npm --version
   ```

2. **If not installed, install via Homebrew:**
   ```bash
   brew install node
   ```

3. **Or download from nodejs.org:**
   - Visit https://nodejs.org/
   - Download LTS version for macOS
   - Run the installer

#### Step 3: Clone the Repository

```bash
# Navigate to your desired directory
cd ~/Downloads  # or your preferred location

# Clone the repository (if you have the Git URL)
# git clone <repository-url>
# Or extract the project if you have it as a ZIP file
```

#### Step 4: Navigate to Project Directory

```bash
cd "Personal-Protective-Equipment-Detection-main/Factory Workers safety project "
```

#### Step 5: Create Python Virtual Environment (Recommended)

```bash
# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Your terminal prompt should now show (venv)
```

#### Step 6: Install Python Dependencies

```bash
# Make sure virtual environment is activated
pip install --upgrade pip

# Install requirements
pip install -r requirements.txt
```

**Note:** If you encounter issues with PyTorch installation, you may need to install it separately:
```bash
pip install torch torchvision torchaudio
```

#### Step 7: Install Frontend Dependencies

```bash
# Navigate to frontend directory
cd frontend

# Install Node.js dependencies
npm install

# Return to project root
cd ..
```

#### Step 8: Download Model Files (if not present)

The model files (`yolov8l-world.pt` and `custom_yolov8l.pt`) should be in the project root. If they're missing:

1. The model will be automatically downloaded on first run, OR
2. Run the Jupyter notebook `Personal Protective Equipment (PPE) Detection.ipynb` which will download the models

### 6.3 Setup for Windows

#### Step 1: Install Python

1. **Download Python:**
   - Visit https://www.python.org/downloads/
   - Download Python 3.8 or higher for Windows
   - **Important:** Check "Add Python to PATH" during installation

2. **Verify installation:**
   ```cmd
   python --version
   pip --version
   ```

#### Step 2: Install Node.js

1. **Download Node.js:**
   - Visit https://nodejs.org/
   - Download LTS version for Windows
   - Run the installer (default options are fine)

2. **Verify installation:**
   ```cmd
   node --version
   npm --version
   ```

#### Step 3: Clone/Extract the Repository

1. **If you have Git installed:**
   ```cmd
   cd C:\Users\YourUsername\Downloads
   git clone <repository-url>
   ```

2. **Or extract the ZIP file to a location like:**
   ```
   C:\Users\YourUsername\Downloads\Personal-Protective-Equipment-Detection-main
   ```

#### Step 4: Navigate to Project Directory

```cmd
cd "C:\Users\YourUsername\Downloads\Personal-Protective-Equipment-Detection-main\Factory Workers safety project "
```

#### Step 5: Create Python Virtual Environment

```cmd
# Create virtual environment
python -m venv venv

# Activate virtual environment
venv\Scripts\activate

# Your command prompt should now show (venv)
```

#### Step 6: Install Python Dependencies

```cmd
# Upgrade pip
python -m pip install --upgrade pip

# Install requirements
pip install -r requirements.txt
```

**Note:** On Windows, you might encounter issues with some packages. If so:
```cmd
# Install PyTorch separately (CPU version)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
```

#### Step 7: Install Frontend Dependencies

```cmd
# Navigate to frontend directory
cd frontend

# Install Node.js dependencies
npm install

# Return to project root
cd ..
```

#### Step 8: Download Model Files

Same as macOS - models will be downloaded automatically or can be obtained by running the Jupyter notebook.

---

## 7. Running the Project

### 7.1 Starting the Backend Server

#### On macOS/Linux:

```bash
# Make sure you're in the project root directory
# Activate virtual environment if not already activated
source venv/bin/activate

# Start the backend server
python start_backend.py
```

**Or directly:**
```bash
python backend_api.py
```

#### On Windows:

```cmd
# Activate virtual environment
venv\Scripts\activate

# Start the backend server
python start_backend.py
```

**Expected Output:**
```
============================================================
PPE Detection API Server
============================================================
Python: /path/to/python
Python Version: 3.x.x
============================================================

✓ YOLOWorld import successful

Starting server...
Server will be available at: http://localhost:8000
API Documentation: http://localhost:8000/docs

Press Ctrl+C to stop the server
```

The backend will be running at `http://localhost:8000`

**API Documentation:** Visit `http://localhost:8000/docs` for interactive API documentation

### 7.2 Starting the Frontend Server

Open a **new terminal/command prompt** (keep backend running):

#### On macOS/Linux:

```bash
# Navigate to frontend directory
cd frontend

# Start the development server
npm run dev
```

#### On Windows:

```cmd
cd frontend
npm run dev
```

**Expected Output:**
```
  ▲ Next.js 14.0.4
  - Local:        http://localhost:3000
  - Ready in 2.3s
```

The frontend will be running at `http://localhost:3000`

### 7.3 Accessing the Application

1. **Open your web browser**
2. **Navigate to:** `http://localhost:3000`
3. **Login:**
   - Username: `admin`
   - Password: `admin`
4. **You should see the dashboard with the following tabs:**
   - **Live Monitoring**: Real-time video processing
   - **Alerts**: Safety violation alerts
   - **Analytics**: Statistics and trends
   - **Settings**: Configuration

### 7.4 Using the Application

#### Live Monitoring:

1. Click on **"Live Monitoring"** tab
2. Select mode:
   - **Live Camera**: Uses your webcam
   - **Upload Video**: Upload a video file
   - **Upload Image**: Upload a static image
3. The system will process frames and display:
   - Bounding boxes around detected objects
   - Safety status (PPE complete/incomplete)
   - Risk score
   - Violation alerts

#### Viewing Alerts:

1. Click on **"Alerts"** tab
2. View all safety violations
3. Filter by:
   - Event type (PPE, Hazard, Posture)
   - Date range
4. View details of each alert

#### Analytics:

1. Click on **"Analytics"** tab
2. View:
   - Total alerts
   - Average risk score
   - Alerts by type (charts)
   - Trends over time

### 7.5 Stopping the Servers

- **Backend:** Press `Ctrl+C` in the terminal running the backend
- **Frontend:** Press `Ctrl+C` in the terminal running the frontend

---

## 8. Project Structure

```
Factory Workers safety project/
│
├── backend_api.py              # FastAPI backend with model inference
├── start_backend.py            # Script to start backend server
├── requirements.txt            # Python dependencies
├── yolov8l-world.pt            # YOLO-World model file
├── custom_yolov8l.pt           # Custom trained model (if available)
│
├── frontend/                   # Next.js frontend application
│   ├── app/
│   │   ├── dashboard/         # Main dashboard page
│   │   ├── login/             # Login page
│   │   ├── page.tsx           # Root page (redirects)
│   │   ├── layout.tsx         # Root layout
│   │   └── globals.css        # Global styles
│   │
│   ├── components/
│   │   ├── LiveMonitoring.tsx      # Live video monitoring component
│   │   ├── AlertsDashboard.tsx     # Alerts management component
│   │   ├── AnalyticsDashboard.tsx  # Analytics and statistics
│   │   ├── SettingsPage.tsx        # Settings page
│   │   └── Sidebar.tsx             # Navigation sidebar
│   │
│   ├── hooks/
│   │   ├── useInference.ts         # Inference API hooks
│   │   ├── useEnhancedInference.ts # Enhanced inference hooks
│   │   └── useWebSocket.ts         # WebSocket hooks (optional)
│   │
│   ├── lib/
│   │   └── api.ts                  # API client configuration
│   │
│   ├── store/
│   │   └── authStore.ts            # Authentication state management
│   │
│   ├── package.json                # Node.js dependencies
│   ├── next.config.js             # Next.js configuration
│   └── tailwind.config.js          # Tailwind CSS configuration
│
├── images/                    # Sample test images
├── runs/                      # Model output directory (detections)
├── Personal Protective Equipment (PPE) Detection.ipynb  # Jupyter notebook for model training/testing
└── PROJECT_DOCUMENTATION.md   # This documentation file
```

---

## 9. API Documentation

### 9.1 Authentication Endpoints

#### POST `/auth/login`
Login and get access token.

**Request Body:**
```json
{
  "username": "admin",
  "password": "admin"
}
```

**Response:**
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer"
}
```

#### GET `/auth/me`
Get current user information (requires authentication).

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "username": "admin",
  "role": "admin"
}
```

### 9.2 Inference Endpoints

#### POST `/infer/frame`
Process a single frame/image.

**Request Body:**
```json
{
  "frame_data": "base64_encoded_image_string",
  "filename": "optional_filename.jpg",
  "is_test_video": false
}
```

**Response:**
```json
{
  "detection": {
    "bounding_boxes": [
      {
        "x1": 100.0,
        "y1": 150.0,
        "x2": 200.0,
        "y2": 250.0,
        "confidence": 0.85,
        "class_name": "safety vest",
        "class_id": 0
      }
    ]
  },
  "safety_evaluation": {
    "ppe_complete": false,
    "hazard_proximity": true,
    "missing_ppe": ["Helmet", "Gloves"],
    "ppe_status": {
      "helmet": false,
      "vest": true,
      "gloves": false,
      "mask": true
    },
    "risk_score": 0.4,
    "violations": [
      "⚠️ HAZARD: Worker detected without helmet/hard hat",
      "⚠️ HAZARD: Worker detected without protective gloves"
    ]
  }
}
```

#### POST `/infer/upload`
Upload and process a video file.

**Request:** Multipart form data with file upload

**Response:** Immediate results from first frame (full video processed in background)

### 9.3 Alerts Endpoints

#### GET `/alerts`
Get stored alerts with optional filtering.

**Query Parameters:**
- `limit`: Maximum number of alerts to return (default: 100)
- `event_type`: Filter by type - "PPE", "Hazard", "Posture", or "all"
- `start_date`: Start date filter (ISO format)
- `end_date`: End date filter (ISO format)

**Response:**
```json
{
  "alerts": [
    {
      "id": "alert_1234567890_0",
      "timestamp": "2024-01-15T10:30:00",
      "event_type": "PPE",
      "risk_score": 0.4,
      "description": "⚠️ HAZARD: Worker detected without helmet/hard hat",
      "bounding_boxes": [...],
      "filename": "video.mp4"
    }
  ],
  "total": 1
}
```

#### GET `/alerts/stats`
Get alert statistics.

**Response:**
```json
{
  "total_alerts": 150,
  "average_risk_score": 0.35,
  "by_type": {
    "ppe_violations": 100,
    "posture_violations": 30,
    "hazard_proximity": 20
  }
}
```

### 9.4 Health Check Endpoints

#### GET `/`
Basic health check.

**Response:**
```json
{
  "status": "ok",
  "message": "PPE Detection API is running"
}
```

#### GET `/health`
Detailed health check.

**Response:**
```json
{
  "status": "healthy",
  "model_loaded": true
}
```

---

## 10. Troubleshooting

### Common Issues and Solutions

#### Issue 1: YOLOWorld Import Error

**Error:**
```
✗ ERROR: YOLOWorld cannot be imported!
```

**Solutions:**
1. **Check Python environment:**
   ```bash
   # Make sure you're using the correct Python environment
   which python  # macOS/Linux
   where python  # Windows
   ```

2. **Reinstall ultralytics:**
   ```bash
   pip uninstall ultralytics
   pip install ultralytics
   ```

3. **Check Python version:**
   ```bash
   python --version  # Should be 3.8 or higher
   ```

#### Issue 2: Model File Not Found

**Error:**
```
FileNotFoundError: Model file not found
```

**Solutions:**
1. **Download model manually:**
   - The model `yolov8l-world.pt` should be in the project root
   - If missing, it will be downloaded automatically on first inference
   - Or run the Jupyter notebook to download it

2. **Check file path:**
   ```bash
   ls yolov8l-world.pt  # macOS/Linux
   dir yolov8l-world.pt  # Windows
   ```

#### Issue 3: Port Already in Use

**Error:**
```
Address already in use
```

**Solutions:**
1. **Find and kill the process:**
   ```bash
   # macOS/Linux
   lsof -ti:8000 | xargs kill -9  # Backend
   lsof -ti:3000 | xargs kill -9  # Frontend
   
   # Windows
   netstat -ano | findstr :8000
   taskkill /PID <PID> /F
   ```

2. **Use different ports:**
   - Edit `start_backend.py` to change port 8000
   - Edit `frontend/package.json` to change port 3000

#### Issue 4: Frontend Build Errors

**Error:**
```
Module not found or TypeScript errors
```

**Solutions:**
1. **Clear cache and reinstall:**
   ```bash
   cd frontend
   rm -rf node_modules package-lock.json  # macOS/Linux
   rmdir /s node_modules  # Windows
   npm install
   ```

2. **Check Node.js version:**
   ```bash
   node --version  # Should be 18.x or higher
   ```

#### Issue 5: CORS Errors

**Error:**
```
CORS policy: No 'Access-Control-Allow-Origin' header
```

**Solutions:**
1. **Check backend CORS configuration:**
   - In `backend_api.py`, ensure frontend URL is in `allow_origins`
   - Default: `["http://localhost:3000", "http://127.0.0.1:3000"]`

2. **Verify frontend is running on correct port**

#### Issue 6: Slow Inference

**Solutions:**
1. **Use GPU (if available):**
   - Install CUDA-enabled PyTorch
   - Change `device="cpu"` to `device="cuda"` in `backend_api.py`

2. **Reduce image size:**
   - Lower `imgsz` parameter (e.g., from 640 to 416)

3. **Increase confidence threshold:**
   - Higher `conf` value reduces detections but speeds up processing

#### Issue 7: Webcam Not Working

**Solutions:**
1. **Check browser permissions:**
   - Allow camera access when prompted
   - Check browser settings for camera permissions

2. **Try different browser:**
   - Chrome/Edge usually work best
   - Firefox may have compatibility issues

3. **Check if webcam is being used by another application**

#### Issue 8: Authentication Issues

**Solutions:**
1. **Default credentials:**
   - Username: `admin`
   - Password: `admin`

2. **Clear browser cache and cookies**

3. **Check backend authentication endpoint:**
   - Visit `http://localhost:8000/docs`
   - Test `/auth/login` endpoint

### Getting Help

If you encounter issues not covered here:

1. **Check the logs:**
   - Backend logs in terminal
   - Browser console (F12) for frontend errors

2. **Verify all dependencies are installed:**
   ```bash
   pip list  # Python packages
   npm list  # Node packages (in frontend directory)
   ```

3. **Ensure both servers are running:**
   - Backend: `http://localhost:8000`
   - Frontend: `http://localhost:3000`

4. **Check API documentation:**
   - Visit `http://localhost:8000/docs` for interactive API testing

---

## Additional Notes

### Model Files

- The `yolov8l-world.pt` model file is approximately 338MB
- It will be automatically downloaded on first use if not present
- Ensure you have sufficient disk space and internet connection

### Performance Considerations

- **CPU Inference:** Suitable for testing and low-volume usage
- **GPU Inference:** Recommended for production and real-time monitoring
- **Model Size:** YOLOv8l-World is a large model; consider smaller variants (n, s, m) for faster inference

### Security Notes

- **Default credentials:** Change admin password in production
- **JWT Secret:** Update `SECRET_KEY` in `backend_api.py` for production
- **CORS:** Restrict allowed origins in production
- **HTTPS:** Use HTTPS in production environments

### Future Enhancements

Potential improvements:
- Database integration for persistent alert storage
- Real-time WebSocket streaming
- Multi-camera support
- Advanced pose estimation for unsafe posture detection
- Fatigue detection using eye tracking
- Mobile app for on-the-go monitoring
- Integration with existing safety management systems

---

## License

[Specify your license here]

## Authors

[Specify authors/contributors here]

## Acknowledgments

- Ultralytics for YOLO-World model
- FastAPI for the backend framework
- Next.js for the frontend framework
- OpenCV for computer vision operations

---

**Last Updated:** [Current Date]
**Version:** 1.0.0

