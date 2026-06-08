"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";

// Helper function to play a custom audio file or fallback to Web Audio buzz
const playBuzzSound = (audioRef: React.MutableRefObject<HTMLAudioElement | null>) => {
  try {
    if (!audioRef.current) {
      audioRef.current = new Audio('/lleo.mp3');
      audioRef.current.loop = true; // Set to loop continuously
    }
    
    // Only play if it's not already playing
    if (audioRef.current.paused) {
      audioRef.current.play().catch((err) => {
        console.warn("Failed to play custom audio file, falling back to synthesizer buzz", err);
        fallbackBuzz();
      });
    }
  } catch (err) {
    console.error("Audio API error", err);
    fallbackBuzz();
  }
};

const stopBuzzSound = (audioRef: React.MutableRefObject<HTMLAudioElement | null>) => {
  if (audioRef.current) {
    audioRef.current.pause();
    audioRef.current.currentTime = 0; // Reset audio to beginning
  }
};

const fallbackBuzz = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    
    gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.8);
  } catch (err) {
    console.error("Audio API not supported or blocked");
  }
};

export default function Home() {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  // App Tabs
  const [activeTab, setActiveTab] = useState<"batch" | "monitor">("batch");

  // Batch Checker State
  const [links, setLinks] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [workingLinks, setWorkingLinks] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Live Monitor State
  const [monitorLinks, setMonitorLinks] = useState("");
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [monitorData, setMonitorData] = useState<Record<string, { status: string; message: string; timestamp: string }>>({});
  const [monitorLogs, setMonitorLogs] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Clean up WebSocket and Audio on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      stopBuzzSound(audioRef);
    };
  }, []);

  const handleCheck = async () => {
    if (!links.trim()) {
      alert("Please enter at least one link");
      return;
    }

    const linksArray = links.split(",").filter((l) => l.trim());

    setLoading(true);
    setProgress(0);
    setTotal(linksArray.length);
    setResults([]);
    setWorkingLinks([]);

    try {
      const res = await fetch(`${API_URL}/check-links`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ links }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();

      setTotal(data.total || 0);
      setResults(data.results || []);
      setWorkingLinks(data.working_links || []);
      setProgress(data.results ? data.results.length : 0);
    } catch (err) {
      console.error(err);
      alert("Error connecting to backend");
    }

    setLoading(false);
  };

  const filteredResults = results.filter((item) => {
    if (filter === "all") return true;
    return item.status === filter;
  });

  const startMonitoring = () => {
    if (!monitorLinks.trim()) {
      alert("Please enter at least one link to monitor");
      return;
    }

    const linksArray = monitorLinks.split(",").filter((l) => l.trim());
    if (linksArray.length === 0) return;

    setIsMonitoring(true);
    setMonitorLogs([]);
    
    // Initialize data map
    const initialData: Record<string, any> = {};
    linksArray.forEach(link => {
      // Basic formatting to match backend parsing
      let formattedLink = link.trim();
      if (!formattedLink.startsWith("http://") && !formattedLink.startsWith("https://")) {
        formattedLink = "https://" + formattedLink;
      }
      initialData[formattedLink] = { status: "waiting", message: "Waiting to start...", timestamp: "--" };
    });
    setMonitorData(initialData);

    const wsProtocol = API_URL.startsWith("https") ? "wss" : "ws";
    const wsBaseUrl = API_URL.replace(/^https?/, wsProtocol);
    
    const ws = new WebSocket(`${wsBaseUrl}/ws/monitor`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ links: monitorLinks }));
      setMonitorLogs((prev) => [`[${new Date().toLocaleTimeString()}] Connected to monitor. Starting checks for ${linksArray.length} links...`, ...prev]);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.error) {
          setMonitorLogs((prev) => [`[Error] ${data.error}`, ...prev]);
          stopMonitoring();
          return;
        }

        // Update the specific URL's status
        setMonitorData((prev) => {
          const newData = {
            ...prev,
            [data.url]: {
              status: data.status,
              message: data.message,
              timestamp: data.timestamp
            }
          };
          
          // Check if ANY link is flagged
          const hasFlagged = Object.values(newData).some((item: any) => item.status === "flagged");
          if (hasFlagged) {
            playBuzzSound(audioRef);
          } else {
            stopBuzzSound(audioRef);
          }
          
          return newData;
        });

        // Add to logs
        setMonitorLogs((prev) => {
          let hostname = data.url;
          try { hostname = new URL(data.url).hostname; } catch(e) {}
          const newLogs = [`[${data.timestamp}] [${hostname}] ${data.status.toUpperCase()} - ${data.message}`, ...prev];
          return newLogs.slice(0, 100); // Keep last 100 logs so it doesn't crash browser memory
        });

      } catch (err) {
        console.error("Failed to parse websocket message", err);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket Error:", error);
      setMonitorLogs((prev) => [`[Error] Connection error`, ...prev]);
    };

    ws.onclose = () => {
      setIsMonitoring(false);
      setMonitorLogs((prev) => [`[${new Date().toLocaleTimeString()}] Monitor connection closed.`, ...prev]);
      stopBuzzSound(audioRef);
    };
  };

  const stopMonitoring = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setIsMonitoring(false);
    stopBuzzSound(audioRef); // Ensure sound stops when user manually clicks "Stop Monitoring"
  };

  return (
    <main className="min-h-screen bg-gray-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header & Tabs */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800">
            🔗 Link Checker Dashboard
          </h1>
          <div className="flex w-full sm:w-auto bg-white rounded-lg shadow p-1">
            <button
              onClick={() => setActiveTab("batch")}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm sm:text-base font-medium transition ${
                activeTab === "batch" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              Batch Checker
            </button>
            <button
              onClick={() => setActiveTab("monitor")}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm sm:text-base font-medium transition ${
                activeTab === "monitor" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              Live Monitor ⚡
            </button>
          </div>
        </div>

        {/* --- TAB: BATCH CHECKER --- */}
        {activeTab === "batch" && (
          <>
            {/* Input Card */}
            <div className="bg-white rounded-2xl shadow p-5 mb-6">
              <textarea
                rows={4}
                className="w-full border rounded-lg p-3 text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Paste links separated by comma..."
                value={links}
                onChange={(e) => setLinks(e.target.value)}
              />

              <button
                onClick={handleCheck}
                disabled={loading}
                className="mt-4 w-full sm:w-auto bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 active:scale-95 transition transform duration-150 disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Checking...
                  </span>
                ) : (
                  "Check Links"
                )}
              </button>
            </div>

            {/* Working Links */}
            <div className="bg-white rounded-2xl shadow p-5 mb-6">
              <h2 className="text-xl font-semibold mb-3 text-gray-700">
                ✅ Clean Working Links (Flagged & Error Removed)
              </h2>

              <textarea
                readOnly
                value={workingLinks.join("\n")}
                className="w-full h-32 border rounded-lg p-3 text-gray-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => navigator.clipboard.writeText(workingLinks.join("\n"))}
                className="mt-2 w-full sm:w-auto bg-green-600 text-white px-4 py-1 rounded hover:bg-green-700 transition transform duration-150 active:scale-95"
              >
                Copy Links
              </button>
            </div>

            {/* Progress Indicator */}
            {loading && (
              <div className="mb-4">
                <div className="text-sm text-gray-600 mb-1">
                  Checking {progress} / {total} links
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${total > 0 ? (progress / total) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Filter Buttons */}
            {results.length > 0 && (
              <div className="flex gap-3 mb-4 flex-wrap">
                {["all", "working", "flagged", "error"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-4 py-1 rounded-full border transition-colors ${
                      filter === f
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            )}

            {/* Results Grid */}
            <div>
              <h2 className="text-xl font-semibold mb-4 text-gray-700">
                📊 Results
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-fadeIn">
                {filteredResults.map((item, index) => (
                  <div
                    key={index}
                    className="bg-white rounded-2xl shadow p-4 hover:shadow-xl transition duration-300 flex flex-col"
                  >
                    <p className="text-sm font-semibold text-gray-800 break-all mb-2">
                      {item.url}
                    </p>

                    <p className="mb-2">
                      Status:{" "}
                      <span
                        className={`px-3 py-1 text-sm rounded-full ${
                          item.status === "working"
                            ? "bg-green-100 text-green-700"
                            : item.status === "flagged"
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {item.status}
                      </span>
                    </p>

                    {item.screenshot && (
                      <div 
                        className="relative w-full h-40 mt-auto cursor-pointer hover:opacity-80 rounded-lg border overflow-hidden"
                        onClick={() => setSelectedImage(`${API_URL}/${item.screenshot}`)}
                      >
                        <Image
                          src={`${API_URL}/${item.screenshot}`}
                          alt="Website screenshot"
                          fill
                          unoptimized
                          className="object-cover"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Empty State */}
              {!loading && results.length === 0 && (
                <div className="text-gray-500 text-center mt-10">
                  No results yet. Paste links and click &quot;Check Links&quot;.
                </div>
              )}
            </div>
          </>
        )}

        {/* --- TAB: LIVE MONITOR --- */}
        {activeTab === "monitor" && (
          <div className="animate-fadeIn">
            <div className="bg-white rounded-2xl shadow p-6 mb-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">⚡ Live Monitor</h2>
              <p className="text-gray-600 mb-6">
                Continuously monitor a single link every 2 seconds. An alarm will buzz instantly if it gets flagged.
              </p>

              <div className="flex flex-col md:flex-row gap-4 mb-6">
                <textarea
                  rows={4}
                  className="flex-1 border rounded-lg p-3 text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Paste links separated by comma (e.g. https://example.com, https://google.com)"
                  value={monitorLinks}
                  onChange={(e) => setMonitorLinks(e.target.value)}
                  disabled={isMonitoring}
                />
                
                <div className="flex flex-col sm:flex-row justify-end">
                  {!isMonitoring ? (
                    <button
                      onClick={startMonitoring}
                      className="w-full sm:w-auto bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 active:scale-95 transition"
                    >
                      Start Monitoring
                    </button>
                  ) : (
                    <button
                      onClick={stopMonitoring}
                      className="w-full sm:w-auto bg-red-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-red-700 active:scale-95 transition"
                    >
                      Stop Monitoring
                    </button>
                  )}
                </div>
              </div>

              {/* Status Display Grid */}
              <div className="border-t pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-700">Live Status ({Object.keys(monitorData).length} Links)</h3>
                  {isMonitoring && (
                    <span className="flex items-center gap-2 text-sm text-blue-600 font-semibold animate-pulse">
                      <div className="w-2 h-2 bg-blue-600 rounded-full"></div> Active
                    </span>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(monitorData).map(([url, info]) => (
                    <div key={url} className={`p-4 rounded-xl border-2 transition-colors duration-300 ${
                      info.status === "working" ? "bg-green-50 border-green-200" :
                      info.status === "flagged" ? "bg-red-50 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]" :
                      info.status === "error" ? "bg-yellow-50 border-yellow-200" :
                      "bg-gray-50 border-gray-200"
                    }`}>
                      <div className="mb-2 truncate font-semibold text-gray-800 text-sm" title={url}>
                        {url}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`inline-block px-3 py-1 text-xs rounded-full font-bold ${
                          info.status === "working" ? "bg-green-100 text-green-700" :
                          info.status === "flagged" ? "bg-red-600 text-white animate-bounce" :
                          info.status === "error" ? "bg-yellow-100 text-yellow-700" :
                          "bg-gray-200 text-gray-600"
                        }`}>
                          {info.status.toUpperCase()}
                        </span>
                        <span className="text-xs text-gray-500">{info.timestamp}</span>
                      </div>
                      <p className={`mt-2 text-sm font-medium ${info.status === "flagged" ? "text-red-700" : "text-gray-700"}`}>
                        {info.message}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Logs */}
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Monitor Logs</h3>
                <div className="bg-gray-900 rounded-lg p-4 h-48 overflow-y-auto font-mono text-sm">
                  {monitorLogs.length === 0 ? (
                    <span className="text-gray-500">No logs yet...</span>
                  ) : (
                    monitorLogs.map((log, i) => (
                      <div key={i} className={`mb-1 ${
                        log.includes("FLAGGED") ? "text-red-400 font-bold" : 
                        log.includes("WORKING") ? "text-green-400" : 
                        "text-gray-300"
                      }`}>
                        {log}
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          </div>
        )}
      </div>

      {/* Modal for Batch Checker */}
      {selectedImage && activeTab === "batch" && (
        <div
          className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative w-[90vw] h-[90vh]">
            <Image
              src={selectedImage}
              alt="Full website screenshot"
              fill
              unoptimized
              className="object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </main>
  );
}