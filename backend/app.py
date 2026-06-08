import sys
import os
import asyncio

print("PYTHONPATH:", os.getenv("PYTHONPATH"))
print("SYSTEM PATH:", sys.path)

if sys.platform.startswith("win"):
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

# Fix for Windows asyncio subprocess bug with Playwright and Uvicorn

from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from checker.engine import check_link, check_link_with_retry
from checker.safe_browsing import check_safe_browsing
from utils.parser import parse_links
from utils.concurrency import run_with_concurrency
import requests
import datetime

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure the Proactor event loop is correctly set for the thread when the app starts
    if sys.platform == 'win32':
        loop = asyncio.get_event_loop()
        if isinstance(loop, asyncio.SelectorEventLoop):
            # This shouldn't happen, but just in case
            pass
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if not os.path.exists("temp"):
    os.makedirs("temp")

app.mount("/temp", StaticFiles(directory="temp"), name="temp")

@app.get("/")
def read_root():
    return {"message": "Backend is running"}

@app.post("/check-link")
async def check_single_link(data: dict):
    url = data.get("url")
    
    if not url:
        return {"error": "URL is required"}
        
    result = await check_link(url)
    
    return result

@app.post("/check-links")
async def check_multiple_links(data: dict):
    raw_links = data.get("links")
    
    if not raw_links:
        return {"error": "Links are required"}
        
    links = parse_links(raw_links)
    
    tasks = [
        check_link_with_retry(link)
        for link in links
    ]
    
    results = await run_with_concurrency(5, tasks)
    
    working_links = [
        r["url"] for r in results if r.get("status") == "working"
    ]
    
    flagged_links = [
        r["url"] for r in results if r.get("status") == "flagged"
    ]
    
    error_links = [
        r["url"] for r in results if r.get("status") == "error"
    ]
    
    return {
        "results": results,
        "working_links": working_links,
        "flagged_links": flagged_links,
        "error_links": error_links,
        "total": len(results)
    }

@app.websocket("/ws/monitor")
async def websocket_monitor(websocket: WebSocket):
    await websocket.accept()
    monitor_tasks = []
    try:
        data = await websocket.receive_json()
        raw_links = data.get("links")
        if not raw_links:
            await websocket.send_json({"error": "No URLs provided"})
            await websocket.close()
            return
            
        # Parse cleanly
        urls = parse_links(raw_links)
        semaphore = asyncio.Semaphore(5) # Max 5 concurrent external requests at any given millisecond

        async def monitor_single_url(url: str):
            while True:
                timestamp = datetime.datetime.now().strftime("%I:%M:%S %p")
                try:
                    async with semaphore:
                        # Use the bulletproof Playwright engine for Live Monitoring
                        result = await check_link(url)
                        
                        message = "Safe & Active"
                        if result["status"] == "flagged":
                            message = "Flagged as Dangerous!"
                        elif result["status"] == "error":
                            message = result.get("error", "Error / Unreachable")
                            
                        await websocket.send_json({
                            "status": result["status"], 
                            "url": url, 
                            "timestamp": timestamp,
                            "message": message
                        })
                except Exception as e:
                    # Ignore internal errors so loop continues
                    pass
                
                # Wait 2 seconds before checking this specific URL again
                await asyncio.sleep(2)

        # Spawn a concurrent task for each URL
        for url in urls:
            task = asyncio.create_task(monitor_single_url(url))
            monitor_tasks.append(task)
            
        # Keep the connection open until client disconnects
        while True:
            await websocket.receive_text()
            
    except WebSocketDisconnect:
        print("Client disconnected from monitor")
    except Exception as e:
        print(f"Monitor error: {e}")
    finally:
        # Cancel all background tasks to prevent memory leaks and zombie loops
        for task in monitor_tasks:
            task.cancel()
        try:
            await websocket.close()
        except:
            pass
