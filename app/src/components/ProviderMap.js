import React, { useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { colors, spacing } from "../theme";

const MAP_HEIGHT = 320;
const MIN_DELTA = 0.02;

function regionFor(origin, pins) {
  const points = [origin, ...pins.map((p) => ({ lat: p.lat, lng: p.lng }))];
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.6, MIN_DELTA),
    longitudeDelta: Math.max((maxLng - minLng) * 1.6, MIN_DELTA),
  };
}

// Real Google Maps on native (Android/iOS via a custom dev client — this
// doesn't render in the stock Expo Go app). See MapView.web.js for the
// browser/react-native-web equivalent.
export default function ProviderMap({ origin, pins, onSelectPin }) {
  const [selected, setSelected] = useState(null);
  const initialRegion = useMemo(() => regionFor(origin, pins), [origin, pins]);

  return (
    <View>
      <View style={{ width: "100%", height: MAP_HEIGHT, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: colors.line }}>
        <MapView provider={PROVIDER_GOOGLE} style={{ flex: 1 }} initialRegion={initialRegion}>
          <Marker
            coordinate={{ latitude: origin.lat, longitude: origin.lng }}
            title="You"
            pinColor={colors.accent}
          />
          {pins.map((p) => (
            <Marker
              key={p.locationId}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              title={p.providerName}
              description={`${p.name} — ${p.priceText}`}
              onPress={() => setSelected(p)}
            />
          ))}
        </MapView>
      </View>

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
