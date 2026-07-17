"use client";

import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";

export default function AdminLearningPage() {
  const [videos, setVideos] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Add video form
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [playlistId, setPlaylistId] = useState("");
  const [addingVideo, setAddingVideo] = useState(false);
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const productFieldRef = useRef(null);

  // New playlist form
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);

  // Assign-to-playlist popover state (per video)
  const [assigning, setAssigning] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([apiFetch("/learning/videos"), apiFetch("/learning/playlists")])
      .then(([v, p]) => {
        setVideos(v || []);
        setPlaylists(p || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // Server-side product search — the catalog is too large to preload and
  // filter client-side, so we debounce and let the backend's ILIKE search do the work.
  useEffect(() => {
    const t = setTimeout(() => {
      apiFetch(`/products?search=${encodeURIComponent(productSearch)}&limit=50`)
        .then((res) => setProducts(res?.products || res || []))
        .catch(() => setProducts([]));
    }, 300);
    return () => clearTimeout(t);
  }, [productSearch]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (productFieldRef.current && !productFieldRef.current.contains(e.target)) {
        setProductDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectProduct = (p) => {
    setProductId(p.id);
    setProductSearch(p.name);
    setProductDropdownOpen(false);
  };

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(""), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);

  const handleAddVideo = async (e) => {
    e.preventDefault();
    setError("");
    setAddingVideo(true);
    try {
      if (!productId) {
        setError("Please link a product to this video");
        setAddingVideo(false);
        return;
      }
      await apiFetch("/admin/learning/videos", {
        method: "POST",
        body: JSON.stringify({
          youtube_url: youtubeUrl,
          title,
          description: description || null,
          playlist_id: playlistId || null,
          product_id: productId,
        }),
      });
      setYoutubeUrl("");
      setTitle("");
      setDescription("");
      setPlaylistId("");
      setProductId("");
      setProductSearch("");
      setSuccess("Video added and broadcast to all customers");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingVideo(false);
    }
  };

  const handleCreatePlaylist = async (e) => {
    e.preventDefault();
    if (!newPlaylistTitle.trim()) return;
    setCreatingPlaylist(true);
    try {
      await apiFetch("/admin/learning/playlists", {
        method: "POST",
        body: JSON.stringify({ title: newPlaylistTitle }),
      });
      setNewPlaylistTitle("");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingPlaylist(false);
    }
  };

  const handleDeletePlaylist = async (id) => {
    if (!confirm("Delete this playlist? Videos in it are not deleted.")) return;
    try {
      await apiFetch(`/admin/learning/playlists/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      alert("Failed: " + err.message);
    }
  };

  const handleDeleteVideo = async (id) => {
    if (!confirm("Delete this video permanently?")) return;
    try {
      await apiFetch(`/admin/learning/videos/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      alert("Failed: " + err.message);
    }
  };

  const handleAssignToPlaylist = async (videoId, pid) => {
    if (!pid) return;
    try {
      await apiFetch(`/admin/learning/playlists/${pid}/videos`, {
        method: "POST",
        body: JSON.stringify({ video_id: videoId }),
      });
      setAssigning(null);
      setSuccess("Added to playlist");
      load();
    } catch (err) {
      alert("Failed: " + err.message);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse bg-white rounded-xl border border-gray-200 p-6 h-40" />
      </div>
    );
  }

  return (
    <>
      <h1 className="text-xl font-semibold text-gray-900 mb-5">Learning Platform</h1>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: forms */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
              Add Video
            </h3>
            <form onSubmit={handleAddVideo} className="space-y-3">
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="YouTube link"
                required
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                required
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
              />
              <div className="relative" ref={productFieldRef}>
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value);
                    setProductId("");
                    setProductDropdownOpen(true);
                  }}
                  onFocus={() => setProductDropdownOpen(true)}
                  placeholder="Link a product... *"
                  required={!productId}
                  autoComplete="off"
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 ${
                    productId ? "border-green-300 bg-green-50" : "border-gray-300"
                  }`}
                />
                {productDropdownOpen && (
                  <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                    {products.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-gray-400 italic">No products found</p>
                    ) : (
                      products.map((p) => (
                        <button
                          type="button"
                          key={p.id}
                          onClick={() => handleSelectProduct(p)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                            p.id === productId ? "bg-gray-50 font-medium" : "text-gray-700"
                          }`}
                        >
                          {p.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
                {!productId && !productDropdownOpen && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    Start typing to find a product
                  </p>
                )}
              </div>
              <select
                value={playlistId}
                onChange={(e) => setPlaylistId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">No playlist</option>
                {playlists.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
              <button
                type="submit"
                disabled={addingVideo}
                className="w-full px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {addingVideo ? "Adding..." : "Add & Broadcast"}
              </button>
              <p className="text-[11px] text-gray-400">
                Broadcasts a notification to every customer when added.
              </p>
            </form>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
              Playlists
            </h3>
            <form onSubmit={handleCreatePlaylist} className="flex gap-2 mb-4">
              <input
                type="text"
                value={newPlaylistTitle}
                onChange={(e) => setNewPlaylistTitle(e.target.value)}
                placeholder="New playlist title"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              <button
                type="submit"
                disabled={creatingPlaylist}
                className="px-3 py-2 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                Create
              </button>
            </form>
            {playlists.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No playlists yet</p>
            ) : (
              <div className="space-y-2">
                {playlists.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-2 rounded-lg border border-gray-200">
                    <div>
                      <p className="text-sm text-gray-900">{p.title}</p>
                      <p className="text-xs text-gray-400">{p.video_count} video{p.video_count !== 1 ? "s" : ""}</p>
                    </div>
                    <button
                      onClick={() => handleDeletePlaylist(p.id)}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: video grid */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
              All Videos ({videos.length})
            </h3>
            {videos.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No videos uploaded yet</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {videos.map((v) => (
                  <div key={v.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    <img src={v.thumbnail_url} alt={v.title} className="w-full aspect-video object-cover" />
                    <div className="p-3">
                      <p className="text-sm font-medium text-gray-900 line-clamp-2">{v.title}</p>
                      {v.product_name && (
                        <p className="text-xs text-gray-400 mt-0.5">Linked: {v.product_name}</p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <button
                          onClick={() => setAssigning(assigning === v.id ? null : v.id)}
                          className="text-xs text-gray-500 hover:text-gray-900"
                        >
                          + Playlist
                        </button>
                        <button
                          onClick={() => handleDeleteVideo(v.id)}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      </div>
                      {assigning === v.id && (
                        <select
                          autoFocus
                          defaultValue=""
                          onChange={(e) => handleAssignToPlaylist(v.id, e.target.value)}
                          className="mt-2 w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                        >
                          <option value="" disabled>Select playlist...</option>
                          {playlists.map((p) => (
                            <option key={p.id} value={p.id}>{p.title}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
