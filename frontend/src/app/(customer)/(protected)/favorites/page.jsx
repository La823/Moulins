"use client";

import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { useFavorites } from "@/context/FavoritesContext";
import ProductCard from "@/components/products/ProductCard";

export default function FavoritesPage() {
  const { favoriteIds, toggleFavorite, refresh } = useFavorites();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef(null);

  const loadFavorites = () => {
    setLoading(true);
    apiFetch("/favorites")
      .then((data) => setFavorites(Array.isArray(data) ? data : []))
      .catch(() => setFavorites([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadFavorites();
  }, [favoriteIds.size]);

  const handleSearchChange = (value) => {
    setSearch(value);
    clearTimeout(searchTimer.current);
    if (!value.trim()) {
      setSearchResults([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      setSearching(true);
      apiFetch(`/products?search=${encodeURIComponent(value)}&limit=10`)
        .then((res) => setSearchResults(res.products || []))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 300);
  };

  const isSearching = search.trim().length > 0;

  return (
    <div className="max-w-6xl mx-auto px-6 sm:px-8 py-10">
      <h1 className="text-2xl font-light text-gray-900 mb-6">My Favorites</h1>

      <input
        type="text"
        value={search}
        onChange={(e) => handleSearchChange(e.target.value)}
        placeholder="Search products to add..."
        className="w-full sm:w-96 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 mb-6"
      />

      {isSearching ? (
        searching ? (
          <p className="text-sm text-gray-400">Searching...</p>
        ) : searchResults.length === 0 ? (
          <p className="text-sm text-gray-400">No products found.</p>
        ) : (
          <div className="space-y-2">
            {searchResults.map((p) => {
              const fav = favoriteIds.has(p.id);
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3"
                >
                  <span className="text-sm font-medium text-gray-900">{p.name}</span>
                  <button
                    onClick={() => toggleFavorite(p.id)}
                    className="text-sm font-medium"
                    style={{ color: fav ? "#F5A623" : "#9CA3AF" }}
                  >
                    {fav ? "★ Favorited" : "☆ Favorite"}
                  </button>
                </div>
              );
            })}
          </div>
        )
      ) : loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : favorites.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400">No favorites yet.</p>
          <p className="text-sm text-gray-400 mt-1">
            Search above or tap the star on a product to add it.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
          {favorites.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
