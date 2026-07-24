"use client";

import { useState, useEffect, useRef } from "react";
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

export default function PartnersMapPage() {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);

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

  useEffect(() => {
    if (!mapReady || !mapDivRef.current || loading) return;

    const located = partners.filter((c) => c.latitude != null && c.longitude != null);

    const map = new window.google.maps.Map(mapDivRef.current, {
      center: INDIA_CENTER,
      zoom: 5,
    });
    mapRef.current = map;

    if (located.length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();
    const infoWindow = new window.google.maps.InfoWindow();

    located.forEach((c) => {
      const position = { lat: c.latitude, lng: c.longitude };
      const marker = new window.google.maps.Marker({
        position,
        map,
        title: c.username || c.phone_number,
      });
      marker.addListener("click", () => {
        infoWindow.setContent(`
          <div style="font-size:13px;line-height:1.5;">
            <strong>${c.username || "No name"}</strong><br/>
            ${c.phone_number}<br/>
            Pincode: ${c.pincode || "—"}
          </div>
        `);
        infoWindow.open(map, marker);
      });
      bounds.extend(position);
    });

    if (located.length > 1) {
      map.fitBounds(bounds);
    } else {
      map.setCenter(located[0] && { lat: located[0].latitude, lng: located[0].longitude });
      map.setZoom(11);
    }
  }, [mapReady, loading, partners]);

  const withLocation = partners.filter((c) => c.latitude != null && c.longitude != null);
  const withoutLocation = partners.length - withLocation.length;

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-gray-800">Partner Map</h2>
        <p className="text-xs text-gray-500">
          {withLocation.length} of {partners.length} partner{partners.length !== 1 ? "s" : ""} shown
          {withoutLocation > 0 && ` · ${withoutLocation} missing a pincode`}
        </p>
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
    </>
  );
}
