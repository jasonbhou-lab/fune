import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { Screen, Chip, Card, Badge, SecondaryButton } from "../../components/ui";
import { RatingBadge } from "../../components/StarRating";
import ProviderMap from "../../components/ProviderMap";
import { api } from "../../api";
import { useAppState } from "../../context/AppState";
import { activeFilterCount } from "../../attributes";
import { colors, spacing, type } from "../../theme";

export default function SearchResultsScreen({ navigation, route }) {
  const { location, compareTray, addToCompare, removeFromCompare, filters, setFilters, clearFilters } = useAppState();
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState("list");

  useEffect(() => {
    if (route.params?.category !== undefined) setFilters({ category: route.params.category });
  }, [route.params?.category]);

  const runSearch = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = { zip: location.zip };
    if (filters.category) params.category = filters.category;
    if (filters.verifiedOnly) params.verifiedOnly = "true";
    ["veteranSupport", "greenOptions", "accessibility", "livestreaming", "onlineArrangement", "receptionFacilities"].forEach(
      (key) => {
        if (filters[key]) params[key] = "true";
      }
    );
    api
      .search(params)
      .then((data) => setResults(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [location.zip, filters]);

  useEffect(() => {
    runSearch();
  }, [runSearch]);

  const filterCount = activeFilterCount(filters);

  const pinsByLocation = useMemo(() => {
    if (!results) return [];
    const map = new Map();
    for (const r of results.results) {
      if (!map.has(r.locationId)) {
        map.set(r.locationId, {
          locationId: r.locationId,
          offeringId: r.offeringId,
          providerName: r.providerName,
          verified: r.verified,
          distanceMiles: r.distanceMiles,
          lat: r.lat,
          lng: r.lng,
          name: r.name,
          priceText: r.price.text,
        });
      }
    }
    return [...map.values()];
  }, [results]);

  return (
    <Screen>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
        <Text style={type.h3}>
          {location.city}, {location.state} {location.zip}
        </Text>
        <SecondaryButton
          title={`Filters${filterCount ? ` (${filterCount})` : ""}`}
          onPress={() => navigation.navigate("Filters")}
          style={{ paddingVertical: 6, paddingHorizontal: 10 }}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Pressable
            onPress={() => setViewMode("list")}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 20,
              backgroundColor: viewMode === "list" ? colors.primary : colors.bgCard,
              borderWidth: 1,
              borderColor: viewMode === "list" ? colors.primary : colors.line,
              marginRight: 8,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "700", color: viewMode === "list" ? colors.primaryInk : colors.muted }}>
              List
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setViewMode("map")}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 20,
              backgroundColor: viewMode === "map" ? colors.primary : colors.bgCard,
              borderWidth: 1,
              borderColor: viewMode === "map" ? colors.primary : colors.line,
              marginRight: 12,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "700", color: viewMode === "map" ? colors.primaryInk : colors.muted }}>
              Map
            </Text>
          </Pressable>
          <Chip label="Verified only" active={Boolean(filters.verifiedOnly)} onPress={() => setFilters({ verifiedOnly: !filters.verifiedOnly })} />
        </View>
      </ScrollView>

      {compareTray.length > 0 ? (
        <Pressable
          onPress={() => navigation.navigate("Compare", { ids: compareTray })}
          style={{ backgroundColor: colors.primary, borderRadius: 10, padding: 10, marginBottom: spacing.md }}
        >
          <Text style={{ color: colors.primaryInk, fontWeight: "700", textAlign: "center" }}>
            Compare {compareTray.length} offer{compareTray.length > 1 ? "s" : ""} →
          </Text>
        </Pressable>
      ) : null}

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[type.caption, { marginTop: spacing.sm }]}>Finding providers near {location.zip}…</Text>
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.danger, textAlign: "center" }}>{error}</Text>
          <SecondaryButton title="Try again" onPress={runSearch} style={{ marginTop: spacing.md }} />
        </View>
      ) : results.results.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg }}>
          <Text style={{ fontWeight: "700", marginBottom: 6 }}>No providers match yet</Text>
          <Text style={[type.caption, { textAlign: "center", marginBottom: spacing.md }]}>
            No published listings near {location.zip} match these filters.
          </Text>
          <SecondaryButton title="Clear filters" onPress={clearFilters} />
        </View>
      ) : viewMode === "map" ? (
        <ScrollView>
          <ProviderMap
            origin={results.origin}
            pins={pinsByLocation}
            onSelectPin={(offeringId) => navigation.navigate("OfferDetail", { offeringId })}
          />
        </ScrollView>
      ) : (
        <FlatList
          data={results.results}
          keyExtractor={(item) => item.offeringId}
          contentContainerStyle={{ gap: spacing.sm }}
          renderItem={({ item }) => {
            const inTray = compareTray.includes(item.offeringId);
            return (
              <Card>
                <Pressable onPress={() => navigation.navigate("OfferDetail", { offeringId: item.offeringId })}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontWeight: "700", fontSize: 14, flex: 1 }}>{item.providerName}</Text>
                    <Text style={type.caption}>{item.distanceMiles} mi</Text>
                  </View>
                  <View style={{ marginTop: 4, marginBottom: 4, flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" }}>
                    <Badge label={item.verified ? "Verified" : "Unverified"} tone={item.verified ? "ok" : "warn"} />
                    <RatingBadge rating={item.rating} size={13} />
                  </View>
                  <Text style={{ fontSize: 13 }}>
                    {item.name} — <Text style={{ fontWeight: "700" }}>{item.price.text}</Text>
                  </Text>
                  <Text style={type.caption}>
                    {item.disclosure.complete} of {item.disclosure.total} disclosures on file
                    {item.reviewedDaysAgo != null ? ` · reviewed ${item.reviewedDaysAgo}d ago` : ""}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => (inTray ? removeFromCompare(item.offeringId) : addToCompare(item.offeringId))}
                  style={{ marginTop: 8, alignSelf: "flex-start" }}
                >
                  <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>
                    {inTray ? "✓ Added to compare" : "+ Add to compare"}
                  </Text>
                </Pressable>
              </Card>
            );
          }}
        />
      )}
    </Screen>
  );
}
