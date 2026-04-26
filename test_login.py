import requests

try:
    response = requests.post(
        "http://localhost:8000/auth/login",
        data={"username": "admin", "password": "admin"},
    )
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
