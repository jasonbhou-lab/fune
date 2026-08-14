import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { colors, spacing } from "../theme";
import { GOOGLE_MAPS_WEB_API_KEY } from "../config";

const MAP_HEIGHT = 320;

let loaderPromise = null;
function loadGoogleMaps() {
  if (typeof window !== "undefined" && window.google?.maps) return Promise.resolve(window.google.maps);
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_WEB_API_KEY}&loading=async`;
    script.async = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error("Failed to load Google Maps JavaScript API."));
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
