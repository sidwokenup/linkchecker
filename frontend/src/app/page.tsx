"use client";

import { useState } from "react";
import Image from "next/image";

export default function Home() {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  const [links, setLinks] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [workingLinks, setWorkingLinks] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

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

  return (
    <main className="min-h-screen bg-gray-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <h1 className="text-3xl md:text-4xl font-bold mb-6 text-gray-800">
          🔗 Link Checker Dashboard
        </h1>

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
            className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 active:scale-95 transition transform duration-150 disabled:opacity-50"
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
            className="mt-2 bg-green-600 text-white px-4 py-1 rounded hover:bg-green-700 transition transform duration-150 active:scale-95"
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
      </div>

      {/* Modal */}
      {selectedImage && (
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