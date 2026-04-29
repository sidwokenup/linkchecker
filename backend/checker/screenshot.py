import os
import hashlib
from PIL import Image, ImageDraw, ImageFont
import textwrap

TEMP_DIR = "temp"

os.makedirs(TEMP_DIR, exist_ok=True)

async def save_screenshot(page, url: str):
    file_name = hashlib.md5(url.encode()).hexdigest() + ".png"
    path = os.path.join(TEMP_DIR, file_name)
    
    await page.screenshot(path=path, full_page=True)
    
    return path.replace("\\", "/")

async def save_error_screenshot(url: str, error_msg: str):
    file_name = hashlib.md5(url.encode()).hexdigest() + "_error.png"
    path = os.path.join(TEMP_DIR, file_name)
    
    img = Image.new('RGB', (1920, 1080), color=(240, 240, 240))
    draw = ImageDraw.Draw(img)
    
    try:
        font = ImageFont.truetype("arial.ttf", 36)
        title_font = ImageFont.truetype("arialbd.ttf", 60)
    except IOError:
        font = ImageFont.load_default()
        title_font = ImageFont.load_default()
        
    draw.text((100, 100), "🚨 Link Checker Browser Crash / Error", fill=(200, 50, 50), font=title_font)
    
    draw.text((100, 220), f"URL: {url}", fill=(50, 50, 50), font=font)
    
    # Wrap long error text
    wrapped_text = "\n".join(textwrap.wrap(error_msg, width=80))
    
    draw.text((100, 320), "Error Details:\n" + wrapped_text, fill=(80, 80, 80), font=font)
    
    img.save(path)
    return path.replace("\\", "/")
