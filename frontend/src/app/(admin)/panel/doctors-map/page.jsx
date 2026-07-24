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

// Doctor markers use a distinct red/clinic pin (vs. the default blue pin on
// the Customer Map) so the two maps are never confused with one another.
const DOCTOR_MARKER_ICON = {
  path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z",
  fillColor: "#dc2626",
  fillOpacity: 1,
  strokeColor: "#ffffff",
  strokeWeight: 1.5,
  scale: 1.6,
  anchor: { x: 12, y: 22 },
};

export default function DoctorsMapPage() {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    apiFetch("/admin/doctors")
      .then((data) => setDoctors(Array.isArray(data) ? data : []))
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

    const located = doctors.filter((d) => d.latitude != null && d.longitude != null);

    const map = new window.google.maps.Map(mapDivRef.current, {
      center: INDIA_CENTER,
      zoom: 5,
    });
    mapRef.current = map;

    if (located.length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();
    const infoWindow = new window.google.maps.InfoWindow();

    located.forEach((d) => {
      const position = { lat: d.latitude, lng: d.longitude };
      const marker = new window.google.maps.Marker({
        position,
        map,
        title: d.name,
        icon: {
          ...DOCTOR_MARKER_ICON,
          anchor: new window.google.maps.Point(12, 22),
        },
      });
      marker.addListener("click", () => {
        infoWindow.setContent(`
          <div style="font-size:13px;line-height:1.5;">
            <strong>Dr. ${d.name}</strong><br/>
            ${d.clinic_name ? `${d.clinic_name}<br/>` : ""}
            ${d.clinic_address ? `${d.clinic_address}<br/>` : ""}
            <span style="color:#888;">Added by ${d.owner_name || d.owner_phone}</span>
          </div>
        `);
        infoWindow.open(map, marker);
      });
      bounds.extend(position);
    });

    if (located.length > 1) {
      map.fitBounds(bounds);
    } else {
      map.setCenter({ lat: located[0].latitude, lng: located[0].longitude });
      map.setZoom(14);
    }
  }, [mapReady, loading, doctors]);

  const withLocation = doctors.filter((d) => d.latitude != null && d.longitude != null);
  const withoutLocation = doctors.length - withLocation.length;

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-gray-800">Doctors Map</h2>
        <p className="text-xs text-gray-500">
          {withLocation.length} of {doctors.length} doctor{doctors.length !== 1 ? "s" : ""} shown
          {withoutLocation > 0 && ` · ${withoutLocation} missing a clinic location`}
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
