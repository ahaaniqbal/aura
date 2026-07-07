import React from "react";
import { Image, View } from "react-native";
import { c } from "../theme";

// Placeholder 3D character faces (Microsoft Fluent Emoji, MIT). Deterministic per person,
// so the same name always maps to the same face. Swap for custom art later, one require array.
const AV = [
  require("../assets/avatars/av0.png"), require("../assets/avatars/av1.png"), require("../assets/avatars/av2.png"),
  require("../assets/avatars/av3.png"), require("../assets/avatars/av4.png"), require("../assets/avatars/av5.png"),
  require("../assets/avatars/av6.png"), require("../assets/avatars/av7.png"), require("../assets/avatars/av8.png"),
];
function pick(name: string): number {
  const s = (name || "?").toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % AV.length;
}

// ring: a color = the person's connection state (mint in-touch, coral owed, grey drifting, pink birthday).
export default function Avatar({ name, size = 48, ring, glow }: { name: string; size?: number; ring?: string; glow?: boolean }) {
  const pad = ring ? 3 : 0;
  const inner = size - pad * 2;
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2, padding: pad,
        backgroundColor: ring || "transparent",
        ...(glow ? { shadowColor: c.pink, shadowOpacity: 0.7, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } } : null),
      }}
    >
      <View style={{ width: inner, height: inner, borderRadius: inner / 2, overflow: "hidden", backgroundColor: "#ECE7FA", borderWidth: ring ? 2 : 0, borderColor: "#fff" }}>
        <Image source={AV[pick(name)]} style={{ width: inner, height: inner * 1.08, marginTop: -inner * 0.02 }} resizeMode="cover" />
      </View>
    </View>
  );
}
