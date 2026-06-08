import re

def detect_status(title: str, content: str):
    text = (title + " " + content).lower()
    
    # We only care about Google Chrome Safe Browsing red screen warnings
    # We DO NOT flag the actual phishing pages (Facebook/Microsoft/Tech Support) themselves if they load successfully
    flagged_keywords = [
        "dangerous site",
        "deceptive site",
        "attackers on the site",
        "back to safety",
        "chrome strongly recommends",
        "security error",
        "privacy error",
        "err_cert_authority_invalid",
        "err_ssl_protocol_error"
    ]
    
    for keyword in flagged_keywords:
        if keyword in text:
            return "flagged"
            
    # Use word boundaries to prevent matching numbers like 4040 in CSS/scripts
    if re.search(r'\b404\b', text):
        return "error"
        
    error_keywords = [
        "page not found",
        "this site can't be reached",
        "err_connection_refused",
        "our services aren't available right now",
        "the request is blocked",
        "403 forbidden",
        "502 bad gateway",
        "503 service temporarily unavailable"
    ]
    
    for keyword in error_keywords:
        if keyword in text:
            return "error"
            
    return "working"
