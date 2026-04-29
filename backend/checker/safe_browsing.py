import requests
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Strictly get the key from the environment variable (No hardcoded fallback!)
API_KEY = os.getenv("GOOGLE_API_KEY")

def check_safe_browsing(url: str):
    endpoint = f"https://safebrowsing.googleapis.com/v4/threatMatches:find?key={API_KEY}"
    
    payload = {
        "client": {
            "clientId": "link-checker",
            "clientVersion": "1.0"
        },
        "threatInfo": {
            "threatTypes": ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"],
            "platformTypes": ["ANY_PLATFORM"],
            "threatEntryTypes": ["URL"],
            "threatEntries": [{"url": url}]
        }
    }
    
    try:
        response = requests.post(endpoint, json=payload)
        
        if response.status_code == 200:
            data = response.json()
            if "matches" in data:
                return True  # flagged
        return False  # safe
    except Exception:
        return False