import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { colors, spacing } from "../theme";
import { GOOGLE_MAPS_WEB_API_KEY } from "../config";

const MAP_HEIGHT = 320;

// The Maps API signals readiness through a global callback named in the script
// URL. script.onload is NOT that signal: with loading=async the bootstrap
// script returns immediately and finishes initialising later, so at onload
// `window.google.maps` already exists while `window.google.maps.Map` is still
// undefined. Constructing the map there threw "google.maps.Map is not a
// constructor" inside a promise chain whose only visible effect was an empty
// grey box — which is why the map appeared to be a key or CSP problem.
const READY_CALLBACK = "__glpGoogleMapsReady";
const LOAD_TIMEOUT_MS = 15000;

// Auth failures are reported by the API asynchronously and usually *after* the
// ready callback has fired, so they can't be surfaced by rejecting the load
// promise. Fan them out to whatever maps are mounted instead.
let authFailure = null;
const authFailureListeners = new Set();

function reportAuthFailure() {
  authFailure =
    "Google Maps rejected the API key. Check that the Maps JavaScript API is enabled, " +
    "billing is active, and this site's origin is allowed by the key's restrictions.";
  authFailureListeners.forEach((notify) => notify(authFailure));
}

let loaderPromise = null;
function loadGoogleMaps() {
  if (typeof window === "undefined") return Promise.reject(new Error("No browser environment."));
  // Check for Map, not just maps: see the partially-initialised state above.
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise((resolve, reject) => {
    const fail = (message) => {
      // Drop the cached promise so remounting retries rather than replaying a
      // stale failure forever.
      loaderPromise = null;
      reject(new Error(message));
    };

    const timer = setTimeout(
      () => fail("Google Maps did not finish loading. Check the network connection and the API key."),
      LOAD_TIMEOUT_MS
    );

    window[READY_CALLBACK] = () => {
      clearTimeout(timer);
      delete window[READY_CALLBACK];
      resolve(window.google.maps);
    };

    window.gm_authFailure = reportAuthFailure;

    const script = document.createElement("script");
    script.src =
      "https://maps.googleapis.com/maps/api/js" +
      `?key=${encodeURIComponent(GOOGLE_MAPS_WEB_API_KEY)}` +
      `&loading=async&callback=${READY_CALLBACK}`;
    script.async = true;
    script.onerror = () => {
      clearTimeout(timer);
      fail("Failed to load the Google Maps JavaScript API.");
    };
    document.head.appendChild(script);
  });
  return loaderPromise;
}

// Web (react-native-web) equivalent of ProviderMap.js — Metro/webpack pick
// this file automatically for web builds based on the .web.js suffix.
export default function ProviderMap({ origin, pins, onSelectPin }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [selected, setSelected] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const key = useMemo(() => `${origin.lat},${origin.lng},${pins.map((p) => p.locationId).join("|")}`, [origin, pins]);

  // A rejected key produces a map that loads but renders nothing useful, and
  // the API only tells us out-of-band, so listen for it explicitly.
  useEffect(() => {
    if (authFailure) setLoadError(authFailure);
    authFailureListeners.add(setLoadError);
    return () => authFailureListeners.delete(setLoadError);
  }, []);

  useEffect(() => {
    if (!GOOGLE_MAPS_WEB_API_KEY) return;
    let cancelled = false;

    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;

        if (!mapRef.current) {
          mapRef.current = new maps.Map(containerRef.current, {
            center: { lat: origin.lat, lng: origin.lng },
            zoom: 11,
          });
        }
        const map = mapRef.current;

        markersRef.current.forEach((m) => m.setMap(null));
        markersRef.current = [];

        const bounds = new maps.LatLngBounds();

        const originMarker = new maps.Marker({
          map,
          position: { lat: origin.lat, lng: origin.lng },
          title: "You",
          icon: {
            path: maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: colors.accent,
            fillOpacity: 1,
            strokeColor: "#FFFFFF",
            strokeWeight: 2,
          },
        });
        markersRef.current.push(originMarker);
        bounds.extend({ lat: origin.lat, lng: origin.lng });

        pins.forEach((p) => {
          const marker = new maps.Marker({
            map,
            position: { lat: p.lat, lng: p.lng },
            title: `${p.providerName} — ${p.priceText}`,
            label: { text: p.priceText, fontSize: "10px", fontWeight: "700" },
          });
          marker.addListener("click", () => setSelected(p));
          markersRef.current.push(marker);
          bounds.extend({ lat: p.lat, lng: p.lng });
        });

        if (pins.length > 0) map.fitBounds(bounds, 48);
      })
      .catch((err) => !cancelled && setLoadError(err.message));

    return () => {
      cancelled = true;
    };
  }, [key]);

  return (
    <View>
      <View
        ref={containerRef}
        // @ts-ignore - RNW forwards this ref to the underlying DOM node.
        style={{ width: "100%", height: MAP_HEIGHT, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: colors.line }}
      />
      {loadError ? (
        <Text style={{ fontSize: 11, color: colors.danger, marginTop: spacing.sm, textAlign: "center" }}>{loadError}</Text>
      ) : !GOOGLE_MAPS_WEB_API_KEY ? (
        <Text style={{ fontSize: 11, color: colors.faint, marginTop: spacing.sm, textAlign: "center" }}>
          Map hidden until a Google Maps API key is set — add GOOGLE_MAPS_WEB_API_KEY in config.js.
        </Text>
      ) : null}

      {selected ? (
        <Pressable
          onPress={() => onSelectPin(selected.offeringId)}
          style={{
            marginTop: spacing.sm,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 10,
            padding: spacing.md,
            backgroundColor: colors.bgCard,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontWeight: "700" }}>{selected.providerName}</Text>
            <Text style={{ color: colors.faint, fontSize: 12 }}>{selected.distanceMiles} mi</Text>
          </View>
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
            {selected.name} — {selected.priceText}
          </Text>
          <Text style={{ fontSize: 11, color: colors.primary, marginTop: 6, fontWeight: "600" }}>View offer →</Text>
        </Pressable>
      ) : (
        <Text style={{ fontSize: 11, color: colors.faint, marginTop: spacing.sm, textAlign: "center" }}>
          Tap a pin to preview that provider.
        </Text>
      )}
    </View>
  );
}
