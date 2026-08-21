import React, { useEffect, useState } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator } from "react-native";
import { Screen } from "../../components/ui";
import CategoryIcon from "../../components/CategoryIcon";
import { api } from "../../api";
import { colors, spacing } from "../../theme";
import { useScrollLayout } from "../../responsive";

export default function CategoriesScreen({ navigation }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const layout = useScrollLayout({ padding: spacing.md });

  useEffect(() => {
    api
      .categories()
      .then(setCategories)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Screen style={{ alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <Text style={{ color: colors.danger }}>{error}</Text>
      </Screen>
    );
  }

  // Full-bleed scroller with the column constraint on its content, so the
  // scrollbar lands at the window edge rather than partway across the page.
  // See useScrollLayout.
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={categories}
        numColumns={2}
        keyExtractor={(item) => item.id}
        style={layout.scroller}
        columnWrapperStyle={{ gap: spacing.sm }}
        contentContainerStyle={[layout.content, { gap: spacing.sm }]}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate("Results", { category: item.id })}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: 12,
              backgroundColor: colors.bgCard,
              padding: spacing.md,
              alignItems: "center",
              gap: 6,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: colors.bgSunk,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CategoryIcon id={item.id} size={18} color={colors.primary} />
            </View>
            <Text style={{ fontWeight: "700", fontSize: 13, color: colors.ink, textAlign: "center" }}>{item.label}</Text>
            <Text style={{ fontSize: 11, color: colors.faint, textAlign: "center" }}>{item.examples}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}
