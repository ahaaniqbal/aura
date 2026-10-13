import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { c, f } from "../theme";
import type { IconName } from "./ui";

export type TabKey = "today" | "ask" | "people" | "notes" | "you";
export const TABS: { key: TabKey; icon: IconName; label: string }[] = [
  { key: "today", icon: "sun", label: "Today" },
  { key: "ask", icon: "message-circle", label: "Ask" },
  { key: "people", icon: "users", label: "People" },
  { key: "notes", icon: "edit-3", label: "Notes" },
  { key: "you", icon: "user", label: "You" },
];

export default function TabBar({ tab, onChange, badges }: { tab: TabKey; onChange: (k: TabKey) => void; badges?: Partial<Record<TabKey, boolean>> }) {
  return (
    <View style={s.bar} accessibilityRole="tablist">
      {TABS.map((x) => {
        const on = tab === x.key;
        const badge = !!badges?.[x.key];
        return (
          <Pressable key={x.key} onPress={() => onChange(x.key)} style={s.item} accessibilityRole="tab" accessibilityState={{ selected: on }}
            accessibilityLabel={badge ? `${x.label}, needs attention` : x.label}>
            <View>
              <Feather name={x.icon} size={21} color={on ? c.ink : c.muted} />
              {badge ? <View style={s.badge} /> : null}
            </View>
            <Text style={[s.label, on && s.labelOn]}>{x.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: "row", backgroundColor: c.canvas, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.lineStrong, paddingTop: 8, paddingBottom: 6 },
  item: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 2 },
  label: { fontFamily: f.medium, fontSize: 11, color: c.muted, marginTop: 4 },
  labelOn: { color: c.ink },
  badge: { position: "absolute", top: -2, right: -5, width: 9, height: 9, borderRadius: 5, backgroundColor: c.signal, borderWidth: 2, borderColor: c.canvas },
});
