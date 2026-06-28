import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ActivityRow, type ActivityStatus } from "@/components/ActivityRow";
import { useColors } from "@/hooks/useColors";
import {
  useDashboardActivity,
  toFeatherIcon,
  BADGE_TO_STATUS,
  type ActivityItem,
} from "@/hooks/useGrcApi";

const FILTERS: { label: string; value: ActivityStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "In Progress", value: "in_progress" },
  { label: "Open", value: "open" },
  { label: "Done", value: "done" },
  { label: "Overdue", value: "overdue" },
];

function formatTs(ts: string): string {
  try {
    return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

export default function ActivitiesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<ActivityStatus | "all">("all");

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { data: activityData, isLoading } = useDashboardActivity();
  const allItems: ActivityItem[] = activityData ?? [];

  const filtered =
    filter === "all"
      ? allItems
      : allItems.filter((a) => BADGE_TO_STATUS(a.badge) === filter);

  function handleFilter(v: ActivityStatus | "all") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFilter(v);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Activities</Text>
        {!isLoading && (
          <View style={[styles.countBadge, { backgroundColor: colors.primary + "22" }]}>
            <Text style={[styles.countText, { color: colors.primary }]}>
              {filtered.length}
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.filterBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      >
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[
              styles.filterChip,
              {
                backgroundColor: filter === f.value ? colors.primary : colors.muted,
                borderColor: filter === f.value ? colors.primary : colors.border,
              },
            ]}
            onPress={() => handleFilter(f.value)}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.filterText,
                { color: filter === f.value ? "#fff" : colors.mutedForeground },
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading activities…</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ActivityRow
              title={item.title}
              subtitle={item.detail}
              status={BADGE_TO_STATUS(item.badge)}
              timestamp={formatTs(item.ts)}
              iconName={toFeatherIcon(item.icon) as keyof typeof Feather.glyphMap}
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            />
          )}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="check-circle" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No {filter === "all" ? "" : filter.replace("_", " ")} items
              </Text>
            </View>
          }
          scrollEnabled
          showsVerticalScrollIndicator={false}
          style={[styles.list, { backgroundColor: colors.background }]}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        activeOpacity={0.85}
        onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
      >
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  countBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  countText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  filterBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    maxHeight: 56,
    paddingVertical: 10,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  list: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 60 },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    textTransform: "capitalize",
  },
  fab: {
    position: "absolute",
    bottom: 100,
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
