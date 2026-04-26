"""
Simple script to start the FastAPI backend server
Run this script to start the PPE Detection API server

IMPORTANT: Make sure you're using the correct Python environment!
If your notebook uses conda env 'machinelearning', activate it first:
    conda activate machinelearning
"""

import sys
import uvicorn

def check_imports():
    """Check if required imports are available"""
    try:
        from ultralytics import YOLOWorld
        print("✓ YOLOWorld import successful")
        return True
    except ImportError:
        try:
            from ultralytics.models.yolo.world import YOLOWorld
            print("✓ YOLOWorld import successful (from models.yolo.world)")
            return True
        except ImportError:
            print("✗ ERROR: YOLOWorld cannot be imported!")
            print("\nPlease ensure you're using the correct Python environment.")
            print("If your notebook uses conda env 'machinelearning', run:")
            print("    conda activate machinelearning")
            print("\nOr see ENVIRONMENT_FIX.md for more details.")
            return False

if __name__ == "__main__":
    print("=" * 60)
    print("PPE Detection API Server")
    print("=" * 60)
    print(f"Python: {sys.executable}")
    print(f"Python Version: {sys.version}")
    print("=" * 60)
    
    # Check imports before starting
    if not check_imports():
        sys.exit(1)
    
    print("\nStarting server...")
    print("Server will be available at: http://localhost:8000")
    print("API Documentation: http://localhost:8000/docs")
    print("\nPress Ctrl+C to stop the server\n")
    
    try:
        uvicorn.run(
            "backend_api:app",
            host="0.0.0.0",
            port=8000,
            reload=True,  # Auto-reload on code changes
            log_level="info"
        )
    except KeyboardInterrupt:
        print("\n\nServer stopped by user.")
    except Exception as e:
        print(f"\n✗ Error starting server: {e}")
        print("\nPlease check ENVIRONMENT_FIX.md for troubleshooting.")
        sys.exit(1)

