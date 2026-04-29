import asyncio
import sys
import threading
from playwright.async_api import async_playwright
from checker.detector import detect_status
from checker.screenshot import save_screenshot, save_error_screenshot
from checker.safe_browsing import check_safe_browsing

_browsers = {}
_playwrights = {}

async def get_browser():
    loop_id = id(asyncio.get_running_loop())
    if loop_id not in _browsers:
        _playwrights[loop_id] = await async_playwright().start()
        _browsers[loop_id] = await _playwrights[loop_id].chromium.launch(
            headless=True,
            args=[
                "--no-sandbox", 
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage"
            ]
        )
    return _browsers[loop_id]

async def _check_link_impl(url: str):
    # 🔴 STEP 1: Check Google Safe Browsing FIRST
    is_safe_browsing_flagged = check_safe_browsing(url)
    
    # 🟢 STEP 2: Continue Playwright to capture screenshot
    context = None
    try:
        browser = await get_browser()
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080},
            ignore_https_errors=True,
            extra_http_headers={
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                "Accept-Language": "en-US,en;q=0.9",
                "Upgrade-Insecure-Requests": "1",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Sec-Fetch-User": "?1",
                "sec-ch-ua": '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"'
            }
        )
        
        # Add stealth script to evade bot detection
        await context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            window.chrome = {
                runtime: {}
            };
        """)
        
        page = await context.new_page()
        
        try:
            await page.goto(url, timeout=30000, wait_until="domcontentloaded")
        except Exception as nav_e:
            err_str = str(nav_e)
            # If Chrome blocks it directly or refuses connection, we still want a screenshot of the blocked/error page
            # We catch all Navigation errors to guarantee a screenshot is taken
            pass
        
        # Wait extra time for dynamic cloaked content / redirects / adware scripts to stabilize
        await page.wait_for_timeout(8000)
        
        # Get page content
        try:
            title = await page.title()
        except Exception:
            title = ""
        
        # Use javascript to get the text, fall back to an empty string if document.body is missing
        try:
            content = await page.evaluate("() => document.body ? document.body.innerText : ''")
        except Exception:
            content = ""
            
        # Get all text from the page to catch dynamically loaded warnings
        try:
            all_text = await page.evaluate("() => document.documentElement.innerText")
            content = content + " " + all_text
        except Exception:
            pass
        
        # Take screenshot
        screenshot_path = await save_screenshot(page, url)
        
        # Detect status
        status = detect_status(title, content)
        
        # If Google Safe Browsing flagged it, enforce flagged status regardless of UI content
        if is_safe_browsing_flagged:
            status = "flagged"
            
        # If page is completely blank (white page), mark as error instead of working
        # Unless it was already flagged by Safe Browsing, then keep it flagged
        if status == "working" and not content.strip() and not title.strip():
            status = "error"
            
        await context.close()
        
        return {
            "url": url,
            "status": status,
            "screenshot": screenshot_path
        }
        
    except Exception as e:
        if context:
            try:
                await context.close()
            except Exception:
                pass
        
        err_str = str(e)
        status = "error"
        if "ERR_BLOCKED_BY" in err_str or "SAFE_BROWSING" in err_str or is_safe_browsing_flagged:
            status = "flagged"
            
        # Dynamically generate an error screenshot using PIL so the frontend always has an image
        fallback_screenshot = await save_error_screenshot(url, err_str)
            
        return {
            "url": url,
            "status": status,
            "error": err_str,
            "screenshot": fallback_screenshot
        }

async def check_link(url: str):
    if sys.platform == 'win32' and isinstance(asyncio.get_running_loop(), asyncio.SelectorEventLoop):
        # Uvicorn with --reload on Windows forces SelectorEventLoop, which doesn't support Playwright's subprocesses.
        # We run it in a separate thread with a ProactorEventLoop to fix the NotImplementedError permanently.
        def run_in_proactor():
            loop = asyncio.ProactorEventLoop()
            asyncio.set_event_loop(loop)
            try:
                return loop.run_until_complete(_check_link_impl(url))
            finally:
                loop_id = id(loop)
                # Clean up the browser instance bound to this specific loop before destroying it
                if loop_id in _browsers:
                    loop.run_until_complete(_browsers[loop_id].close())
                    del _browsers[loop_id]
                if loop_id in _playwrights:
                    loop.run_until_complete(_playwrights[loop_id].stop())
                    del _playwrights[loop_id]
                    
                loop.close()
        
        return await asyncio.to_thread(run_in_proactor)
    else:
        return await _check_link_impl(url)

async def check_link_with_retry(url: str, retries=2):
    for attempt in range(retries + 1):
        result = await check_link(url)
        
        if result.get("status") != "error":
            return result
            
    return result
