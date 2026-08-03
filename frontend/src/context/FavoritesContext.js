"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const FavoritesContext = createContext(null);

export function FavoritesProvider({ children }) {
  const { user } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState(new Set());

  const refresh = useCallback(() => {
    if (!user) {
      setFavoriteIds(new Set());
      return;
    }
    apiFetch("/favorites/ids")
      .then((ids) => setFavoriteIds(new Set(ids || [])))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isFavorite = useCallback(
    (productId) => favoriteIds.has(productId),
    [favoriteIds]
  );

  const toggleFavorite = useCallback(
    async (productId) => {
      if (!user) return;
      const wasFavorite = favoriteIds.has(productId);
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        wasFavorite ? next.delete(productId) : next.add(productId);
        return next;
      });
      try {
        if (wasFavorite) {
          await apiFetch(`/favorites/${productId}`, { method: "DELETE" });
        } else {
          await apiFetch(`/favorites/${productId}`, { method: "POST" });
        }
      } catch {
        // Revert on failure
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          wasFavorite ? next.add(productId) : next.delete(productId);
          return next;
        });
      }
    },
    [favoriteIds, user]
  );

  return (
    <FavoritesContext.Provider
      value={{ favoriteIds, isFavorite, toggleFavorite, refresh }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites must be used within FavoritesProvider");
  return ctx;
}
