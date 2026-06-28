import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StatCard } from "@/components/StatCard";
import { ActivityRow } from "@/components/ActivityRow";
import { getRoleMeta } from "@/constants/roleData";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  useDashboardKPIs,
  useDashboardActivity,
  toFeatherIcon,
  BADGE_TO_STATUS,
} from "@/hooks/useGrcApi";

const KPI_ICON: Record<string, string> = {
  "grc-score": "shield",
  "open-risks": "alert-triangle",
  "controls": "check-circle",
  "audits": "clipboard",
  "privacy": "lock",
};
const KPI_COLOR: Record<string, string> = {
  "grc-score": "#5b7af8",
  "open-risks": "#e05535",
  "controls": "#20bf8a",
  "audits": "#f0a030",
  "privacy": "#5b7af8",
};

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, activeRole } = useAuth();
  const meta = getRoleMeta(activeRole);
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { data: kpisData, isLoading: kpisLoading } = useDashboardKPIs();
  const { data: activityData, isLoading: activityLoading } = useDashboardActivity();

  const kpis = kpisData?.kpis ?? [];
  const activities = activityData ?? [];

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={meta.bgGradient}
        style={[styles.header, { paddingTop: topPad + 16 }]}
      >
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>{meta.greeting}</Text>
            <Text style={styles.userName} numberOfLines={1}>
              {user?.name ?? "Welcome"}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={[styles.headerBtn, { backgroundColor: "#ffffff18" }]}>
              <Feather name="bell" size={18} color="#fff" />
            </TouchableOpacity>
            <View style={[styles.rolePill, { backgroundColor: meta.color + "33", borderColor: meta.color + "66" }]}>
              <Text style={[styles.roleText, { color: meta.color }]}>{meta.title}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.orgBadge, { backgroundColor: "#ffffff12" }]}>
          <Feather name="globe" size={12} color="#ffffff88" />
          <Text style={styles.orgText}>{user?.tenantId ? "Enterprise" : "AIGO-X GRC"}</Text>
        </View>
      </LinearGradient>

      {kpisLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading metrics…</Text>
        </View>
      ) : (
        <View style={[styles.statsGrid, { marginTop: -1 }]}>
          {kpis.map((kpi) => (
            <View key={kpi.id} style={styles.statCell}>
              <StatCard
                label={kpi.label}
                value={String(kpi.value)}
                unit={kpi.unit}
                iconName={(KPI_ICON[kpi.id] ?? "activity") as keyof typeof Feather.glyphMap}
                iconColor={KPI_COLOR[kpi.id] ?? colors.primary}
                trend={kpi.up ? "up" : "down"}
                trendValue={kpi.delta}
                gradient={[colors.card, colors.card]}
              />
            </View>
          ))}
        </View>
      )}

      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent Activity</Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)/activities")}>
            <Text style={[styles.seeAll, { color: colors.primary }]}>See all</Text>
          </TouchableOpacity>
        </View>
        {activityLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : activities.length === 0 ? (
          <View style={[styles.loadingRow, { paddingVertical: 20 }]}>
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>No recent activity</Text>
          </View>
        ) : (
          activities.slice(0, 5).map((item) => (
            <ActivityRow
              key={item.id}
              title={item.title}
              subtitle={item.detail}
              status={BADGE_TO_STATUS(item.badge)}
              timestamp={new Date(item.ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              iconName={toFeatherIcon(item.icon) as keyof typeof Feather.glyphMap}
            />
          ))
        )}
      </View>

      <View style={[styles.quickActions, { gap: 10 }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground, paddingHorizontal: 4 }]}>Quick Actions</Text>
        <View style={styles.actionRow}>
          <QuickAction icon="plus-circle" label="New Task" color="#5b7af8" colors={colors} onPress={() => router.push("/(tabs)/activities")} />
          <QuickAction icon="bar-chart-2" label="Reports" color="#20bf8a" colors={colors} onPress={() => router.push("/(tabs)/insights")} />
          <QuickAction icon="alert-triangle" label="Incident" color="#e05535" colors={colors} onPress={() => router.push("/(tabs)/activities")} />
          <QuickAction icon="user" label="Profile" color="#f0a030" colors={colors} onPress={() => router.push("/(tabs)/profile")} />
        </View>
      </View>
    </ScrollView>
  );
}

function QuickAction({
  icon,
  label,
  color,
  colors,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  color: string;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.actionIcon, { backgroundColor: color + "22" }]}>
        <Feather name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.actionLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 24 },
  headerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  greeting: { fontSize: 13, color: "#ffffff88", fontFamily: "Inter_400Regular" },
  userName: { fontSize: 22, color: "#fff", fontFamily: "Inter_700Bold", marginTop: 2 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rolePill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  roleText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  orgBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, alignSelf: "flex-start" },
  orgText: { fontSize: 12, color: "#ffffff88", fontFamily: "Inter_400Regular" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 16 },
  loadingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", padding: 12, gap: 10 },
  statCell: { flexBasis: "47%", flexGrow: 1 },
  section: { marginHorizontal: 16, marginTop: 8, borderWidth: 1, borderRadius: 14, overflow: "hidden" },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  seeAll: { fontSize: 13, fontFamily: "Inter_500Medium" },
  quickActions: { margin: 16, marginTop: 16 },
  actionRow: { flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: 12, borderWidth: 1, gap: 6 },
  actionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
});
