import React from "react";
import { Text, View } from "react-native";
import { c, f } from "../theme";

// Monogram avatars, deliberately neutral: a person's initials on a quiet well. Color in a row is
// reserved for one thing, the signal dot that means this person needs you now.
export function initials(name: string): string {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const a = parts[0][0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

export default function Avatar({ name, size = 44, signal, onDark }: { name: string; size?: number; signal?: boolean; onDark?: boolean }) {
  const d = Math.max(10, Math.round(size * 0.24));
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: onDark ? "rgba(13,14,18,0.12)" : c.sunken, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontFamily: f.medium, fontSize: Math.max(11, size * 0.36), letterSpacing: -0.2, color: onDark ? c.ink : c.ink2 }}>{initials(name)}</Text>
      </View>
      {signal ? (
        <View style={{ position: "absolute", right: -1, bottom: -1, width: d, height: d, borderRadius: d / 2, backgroundColor: c.accent, borderWidth: 2, borderColor: c.canvas }} />
      ) : null}
    </View>
  );
}
