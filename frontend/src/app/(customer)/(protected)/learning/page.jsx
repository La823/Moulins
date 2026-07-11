"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

export default function LearningPage() {
  const [videos, setVideos] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [search, setSearch] = useState("");
  const [activePlaylist, setActivePlaylist] = useState("");
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(null);

  useEffect(() => {
    apiFetch("/learning/playlists")
      .then((data) => setPlaylists(data || []))
      .catch(() => setPlaylists([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (activePlaylist) params.set("playlist_id", activePlaylist);
    apiFetch(`/learning/videos?${params.toString()}`)
      .then((data) => setVideos(data || []))
      .catch(() => setVideos([]))
      .finally(() => setLoading(false));
  }, [search, activePlaylist]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-10">
      <h1 className="text-2xl font-light text-gray-900 mb-1">Learning</h1>
      <p className="text-sm text-gray-400 mb-8">Videos and resources from Moulins Pharmaceuticals</p>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search videos..."
          className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      {playlists.length > 0 && (
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-1">
          <button
            onClick={() => setActivePlaylist("")}
            className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
              activePlaylist === "" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            All Videos
          </button>
          {playlists.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePlaylist(p.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                activePlaylist === p.id ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {p.title}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-video bg-gray-100 rounded-lg" />
              <div className="h-4 bg-gray-100 rounded mt-2 w-3/4" />
            </div>
          ))}
        </div>
      ) : videos.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-16">No videos found</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map((v) => (
            <button key={v.id} onClick={() => setPlaying(v)} className="text-left group">
              <div className="aspect-video rounded-lg overflow-hidden bg-gray-100 relative">
                <img src={v.thumbnail_url} alt={v.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
              <p className="text-sm font-medium text-gray-900 mt-2 line-clamp-2">{v.title}</p>
              {v.description && <p className="text-xs text-gray-400 mt-1 line-clamp-1">{v.description}</p>}
            </button>
          ))}
        </div>
      )}

      {playing && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setPlaying(null)}
        >
          <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="aspect-video rounded-lg overflow-hidden bg-black">
              <iframe
                src={`https://www.youtube.com/embed/${playing.youtube_id}?autoplay=1`}
                title={playing.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
            <div className="flex items-center justify-between mt-3">
              <p className="text-white text-sm font-medium">{playing.title}</p>
              <button onClick={() => setPlaying(null)} className="text-white/70 hover:text-white text-sm">
                Close &times;
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
