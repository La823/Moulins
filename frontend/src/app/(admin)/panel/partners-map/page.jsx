"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { apiFetch } from "@/lib/api";

const INDIA_CENTER = { lat: 22.5, lng: 79.5 };

let googleMapsScriptPromise = null;
function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve();
  if (googleMapsScriptPromise) return googleMapsScriptPromise;

  googleMapsScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return googleMapsScriptPromise;
}

// a place name as typed by partners: trimmed, case and spacing ignored when
// grouping ("new delhi", "New  Delhi" are one city)
const norm = (s) => (s || "").trim().replace(/\s+/g, " ").toLowerCase();
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

// HTML-escape partner-typed text going into the map's info window
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export default function PartnersMapPage() {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [search, setSearch] = useState(""); // party name or phone
  const [state, setState] = useState(""); // normalised state, "" = all
  const [city, setCity] = useState(""); // normalised city, "" = all
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const infoRef = useRef(null);

  useEffect(() => {
    apiFetch("/admin/partners")
      .then((data) => setPartners(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
      setError("Google Maps API key is not configured");
      return;
    }
    loadGoogleMaps()
      .then(() => setMapReady(true))
      .catch(() => setError("Failed to load Google Maps"));
  }, []);

  // state and city choices, with how many partners each has (a city list
  // narrows to the chosen state)
  const states = useMemo(() => {
    const m = new Map();
    for (const p of partners) {
      const k = norm(p.state);
      if (k) m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [partners]);
  const cities = useMemo(() => {
    const m = new Map();
    for (const p of partners) {
      if (state && norm(p.state) !== state) continue;
      const k = norm(p.city);
      if (k) m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [partners, state]);

  const filtered = useMemo(() => {
    const q = norm(search);
    const qDigits = q.replace(/\D/g, "");
    return partners.filter((p) => {
      if (state && norm(p.state) !== state) return false;
      if (city && norm(p.city) !== city) return false;
      if (!q) return true;
      return (
        norm(p.username).includes(q) ||
        (qDigits.length >= 3 && (p.phone_number || "").replace(/\D/g, "").includes(qDigits)) ||
        norm(p.city).includes(q) ||
        norm(p.state).includes(q) ||
        (p.pincode || "").includes(q)
      );
    });
  }, [partners, search, state, city]);

  // the map, made once
  useEffect(() => {
    if (!mapReady || !mapDivRef.current || loading || mapRef.current) return;
    mapRef.current = new window.google.maps.Map(mapDivRef.current, { center: INDIA_CENTER, zoom: 5 });
    infoRef.current = new window.google.maps.InfoWindow();
  }, [mapReady, loading]);

  // pins for the partners that match, zoomed to fit them
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || loading) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    infoRef.current?.close();

    const located = filtered.filter((c) => c.latitude != null && c.longitude != null);
    if (located.length === 0) {
      map.setCenter(INDIA_CENTER);
      map.setZoom(5);
      return;
    }
    const bounds = new window.google.maps.LatLngBounds();
    located.forEach((c) => {
      const position = { lat: c.latitude, lng: c.longitude };
      const marker = new window.google.maps.Marker({ position, map, title: c.username || c.phone_number });
      marker.addListener("click", () => {
        infoRef.current.setContent(`
          <div style="font-size:13px;line-height:1.5;">
            <strong>${esc(c.username || "No name")}</strong><br/>
            ${esc(c.phone_number)}<br/>
            ${esc([c.city, c.state].filter(Boolean).join(", ") || "City not set")}<br/>
            Pincode: ${esc(c.pincode || "—")}
          </div>
        `);
        infoRef.current.open(map, marker);
      });
      markersRef.current.push(marker);
      bounds.extend(position);
    });
    if (located.length > 1) {
      map.fitBounds(bounds);
    } else {
      map.setCenter({ lat: located[0].latitude, lng: located[0].longitude });
      map.setZoom(11);
    }
  }, [filtered, mapReady, loading]);

  const filtering = Boolean(search.trim() || state || city);
  const withLocation = filtered.filter((c) => c.latitude != null && c.longitude != null);
  const withoutLocation = filtered.length - withLocation.length;
  // Not on the map = no coordinates: either no pincode at all, or a pincode
  // the geocoder couldn't place (often a typo). Counted apart so this
  // matches the Partners list's "No pincode" filter.
  const noPincode = filtered.filter((c) => !(c.pincode && c.pincode.trim())).length;
  const notFound = withoutLocation - noPincode;

  const field =
    "px-3 py-2 text-sm text-gray-900 bg-white border border-gray-300 rounded-lg focus:border-gray-500 outline-none";

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Partner Map</h2>
        <p className="text-xs text-gray-500">
          {withLocation.length} of {filtered.length} partner{filtered.length !== 1 ? "s" : ""} shown
          {filtering && ` (${partners.length} in all)`}
          {withoutLocation > 0 && ` · ${withoutLocation} not on the map`}
          {withoutLocation > 0 && (
            <span className="text-gray-400">
              {" "}({[noPincode > 0 && `${noPincode} without a pincode`, notFound > 0 && `${notFound} with a pincode that couldn't be located`]
                .filter(Boolean)
                .join(", ")})
            </span>
          )}
        </p>
      </div>

      {/* filters: party, state, city */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search party name, phone, city or pincode"
          className={`${field} flex-1 min-w-[220px]`}
        />
        <select
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setCity("");
          }}
          className={field}
        >
          <option value="">All states</option>
          {states.map(([k, n]) => (
            <option key={k} value={k}>
              {titleCase(k)} ({n})
            </option>
          ))}
        </select>
        <select value={city} onChange={(e) => setCity(e.target.value)} className={field}>
          <option value="">All cities</option>
          {cities.map(([k, n]) => (
            <option key={k} value={k}>
              {titleCase(k)} ({n})
            </option>
          ))}
        </select>
        {filtering && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setState("");
              setCity("");
            }}
            className="px-3 py-2 text-sm text-red-600 hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading || !mapReady ? (
          <div className="h-[600px] flex items-center justify-center text-sm text-gray-400">
            Loading map...
          </div>
        ) : (
          <div ref={mapDivRef} className="h-[600px] w-full" />
        )}
      </div>

      {/* the matching partners, under the map, when a filter is on */}
      {filtering && (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">No partner matches.</p>
          ) : (
            filtered.slice(0, 200).map((p) => {
              const located = p.latitude != null && p.longitude != null;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={!located}
                  onClick={() => {
                    const map = mapRef.current;
                    if (!map || !located) return;
                    map.setCenter({ lat: p.latitude, lng: p.longitude });
                    map.setZoom(13);
                    const marker = markersRef.current.find(
                      (m) => m.getPosition().lat() === p.latitude && m.getPosition().lng() === p.longitude,
                    );
                    if (marker) window.google.maps.event.trigger(marker, "click");
                    mapDivRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                  className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-gray-50 disabled:hover:bg-white"
                >
                  <span>
                    <span className="text-sm font-medium text-gray-900">{p.username || "No name"}</span>
                    <span className="ml-2 text-xs text-gray-500">{p.phone_number}</span>
                  </span>
                  <span className="text-xs text-gray-500 text-right">
                    {[p.city, p.state].filter(Boolean).join(", ") || "City not set"}
                    {!located && <span className="block text-amber-600">not on the map</span>}
                  </span>
                </button>
              );
            })
          )}
          {filtered.length > 200 && (
            <p className="px-4 py-2 text-xs text-gray-400">Showing the first 200 of {filtered.length}. Narrow the search to see the rest.</p>
          )}
        </div>
      )}
    </>
  );
}
