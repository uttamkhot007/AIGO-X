import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProgressBar } from "@/components/ProgressBar";
import { useColors } from "@/hooks/useColors";
import { useDashboardKPIs, useComplianceFrameworks } from "@/hooks/useGrcApi";

export default function InsightsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { data: kpisData, isLoading: kpisLoading } = useDashboardKPIs();
  const { data: frameworks, isLoading: fwLoading } = useComplianceFrameworks();

  const grcScore = kpisData?.meta?.grcScore ?? 0;
  const scoreColor =
    grcScore >= 80 ? colors.success : grcScore >= 60 ? colors.warning : colors.destructive;

  const displayFws = (frameworks ?? []).slice(0, 8);
  const overallFwScore =
    displayFws.length > 0
      ? Math.round(displayFws.reduce((s, f) => s + f.pct, 0) / displayFws.length)
      : 0;

  const isLoading = kpisLoading || fwLoading;

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={[
          styles.header,
          { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Insights</Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading insights…</Text>
        </View>
      ) : (
        <>
          <View style={[styles.scoreCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.scoreLeft}>
              <Text style={[styles.scoreLabel, { color: colors.mutedForeground }]}>GRC SCORE</Text>
              <Text style={[styles.scoreValue, { color: scoreColor }]}>{grcScore}</Text>
              <Text style={[styles.scoreDesc, { color: colors.mutedForeground }]}>
                {grcScore >= 80 ? "Good standing" : grcScore >= 60 ? "Needs improvement" : grcScore > 0 ? "Action required" : "No data yet"}
              </Text>
            </View>
            <View style={styles.scoreRight}>
              <ScoreRing score={grcScore} color={scoreColor} />
            </View>
          </View>

          {displayFws.length > 0 && (
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.sectionHeader}>
                <Feather name="layers" size={16} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Framework Coverage</Text>
                <View style={[styles.avgBadge, { backgroundColor: colors.primary + "22" }]}>
                  <Text style={[styles.avgText, { color: colors.primary }]}>{overallFwScore}% avg</Text>
                </View>
              </View>
              <View style={styles.bars}>
                {displayFws.map((fw) => (
                  <ProgressBar
                    key={fw.id}
                    label={fw.name}
                    value={fw.pct}
                    max={100}
                    color={fw.color}
                  />
                ))}
              </View>
            </View>
          )}

          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Feather name="trending-up" size={16} color={colors.accent} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Key Metrics</Text>
            </View>
            <View style={styles.trendList}>
              {(kpisData?.kpis ?? []).map((kpi) => (
                <View key={kpi.id} style={[styles.trendRow, { borderBottomColor: colors.border }]}>
                  <View style={[styles.trendIcon, { backgroundColor: (kpi.up ? "#20bf8a" : "#e05535") + "22" }]}>
                    <Feather
                      name={kpi.up ? "trending-up" : "trending-down"}
                      size={14}
                      color={kpi.up ? colors.success : colors.destructive}
                    />
                  </View>
                  <View style={styles.trendContent}>
                    <Text style={[styles.trendLabel, { color: colors.foreground }]}>{kpi.label}</Text>
                    <Text style={[styles.trendValue, { color: colors.mutedForeground }]}>
                      {kpi.value}{kpi.unit}
                    </Text>
                  </View>
                  <Text style={[styles.trendDelta, { color: colors.mutedForeground }]}>{kpi.delta}</Text>
                </View>
              ))}
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function ScoreRing({ score, color }: { score: number; color: string }) {
  const size = 88;
  const stroke = 8;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: stroke,
          borderColor: color + "33",
          alignItems: "center",
          justifyContent: "center",
          position: "absolute",
        }}
      />
      <View
        style={{
          width: size - stroke * 2 + 2,
          height: size - stroke * 2 + 2,
          borderRadius: (size - stroke * 2) / 2,
          borderWidth: stroke,
          borderColor: color,
          borderTopColor: "transparent",
          borderLeftColor: score > 50 ? color : "transparent",
          alignItems: "center",
          justifyContent: "center",
          transform: [{ rotate: `-${90 - (score / 100) * 360 / 2}deg` }],
          position: "absolute",
        }}
      />
      <Text style={{ color, fontSize: 20, fontFamily: "Inter_700Bold" }}>{score}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  scoreCard: {
    margin: 16,
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  scoreLeft: { flex: 1 },
  scoreLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 1 },
  scoreValue: { fontSize: 44, fontFamily: "Inter_700Bold", lineHeight: 52 },
  scoreDesc: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
  scoreRight: { paddingLeft: 16 },
  section: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", flex: 1 },
  avgBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  avgText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  bars: { padding: 16 },
  trendList: {},
  trendRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  trendIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  trendContent: { flex: 1 },
  trendLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  trendValue: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  trendDelta: { fontSize: 11, fontFamily: "Inter_400Regular", maxWidth: 100, textAlign: "right" },
});
