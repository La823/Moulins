"use client";

import { useState, useEffect, useRef } from "react";

const INDIA_CENTER = { lat: 22.5, lng: 79.5 };

let googleMapsScriptPromise = null;
function loadGoogleMaps() {
  if (window.google?.maps?.places) return Promise.resolve();
  if (googleMapsScriptPromise) return googleMapsScriptPromise;

  googleMapsScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return googleMapsScriptPromise;
}

// Modal map picker — search an address, click the map, or use the device's
// current location to drop a single marker, then hand back {lat, lng, address}.
export default function LocationPicker({ initial, onConfirm, onClose }) {
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const [picked, setPicked] = useState(initial || null);
  const mapDivRef = useRef(null);
  const searchInputRef = useRef(null);
  const mapObjRef = useRef(null);
  const markerRef = useRef(null);
  const geocoderRef = useRef(null);

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
    if (!mapReady || !mapDivRef.current) return;

    const start = picked || INDIA_CENTER;
    const map = new window.google.maps.Map(mapDivRef.current, {
      center: start,
      zoom: picked ? 15 : 5,
    });
    mapObjRef.current = map;
    geocoderRef.current = new window.google.maps.Geocoder();

    const setMarker = (position) => {
      if (markerRef.current) {
        markerRef.current.setPosition(position);
      } else {
        markerRef.current = new window.google.maps.Marker({ position, map, draggable: true });
        markerRef.current.addListener("dragend", () => {
          const pos = markerRef.current.getPosition();
          reverseGeocode(pos.lat(), pos.lng());
        });
      }
    };

    const reverseGeocode = (lat, lng) => {
      geocoderRef.current.geocode({ location: { lat, lng } }, (results, status) => {
        const address = status === "OK" && results?.[0] ? results[0].formatted_address : "";
        setPicked({ lat, lng, address });
      });
    };

    if (picked) setMarker(picked);

    map.addListener("click", (e) => {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      setMarker({ lat, lng });
      reverseGeocode(lat, lng);
    });

    if (searchInputRef.current) {
      const autocomplete = new window.google.maps.places.Autocomplete(searchInputRef.current, {
        componentRestrictions: { country: "in" },
        fields: ["geometry", "formatted_address"],
      });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place.geometry?.location) return;
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        setMarker({ lat, lng });
        setPicked({ lat, lng, address: place.formatted_address || "" });
        map.setCenter({ lat, lng });
        map.setZoom(16);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported on this device");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (markerRef.current) {
          markerRef.current.setPosition({ lat, lng });
        } else if (mapObjRef.current) {
          markerRef.current = new window.google.maps.Marker({ position: { lat, lng }, map: mapObjRef.current, draggable: true });
        }
        mapObjRef.current?.setCenter({ lat, lng });
        mapObjRef.current?.setZoom(16);
        geocoderRef.current?.geocode({ location: { lat, lng } }, (results, status) => {
          const address = status === "OK" && results?.[0] ? results[0].formatted_address : "";
          setPicked({ lat, lng, address });
        });
        setLocating(false);
      },
      () => {
        setError("Could not get your current location");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Set Clinic Location</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm">
            ✕
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search an address..."
              disabled={!mapReady}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-gray-500"
            />
            <button
              type="button"
              onClick={useCurrentLocation}
              disabled={!mapReady || locating}
              className="text-xs px-3 py-2 border border-gray-300 rounded-lg text-gray-700 hover:border-gray-500 disabled:opacity-50 whitespace-nowrap"
            >
              {locating ? "Locating..." : "📍 Current location"}
            </button>
          </div>

          {!mapReady ? (
            <div className="h-80 flex items-center justify-center text-sm text-gray-400 border border-gray-100 rounded-lg">
              Loading map...
            </div>
          ) : (
            <div ref={mapDivRef} className="h-80 w-full rounded-lg border border-gray-100" />
          )}

          <p className="text-xs text-gray-500">
            {picked ? picked.address || `${picked.lat.toFixed(5)}, ${picked.lng.toFixed(5)}` : "Search, use current location, or click the map to drop a pin."}
          </p>
        </div>

        <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-4 py-2 text-gray-600 hover:text-gray-900">
            Cancel
          </button>
          <button
            onClick={() => picked && onConfirm(picked)}
            disabled={!picked}
            className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
          >
            Use this location
          </button>
        </div>
      </div>
    </div>
  );
}
