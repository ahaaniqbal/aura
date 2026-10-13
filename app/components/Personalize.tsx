import React, { useId, useMemo, useState } from "react";
import { Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Mark from "./Mark";
import { Button, IconButton, LinkButton, Press } from "./ui";
import { c, f, sp, t } from "../theme";
import { ACCESSORIES, AuraLook, BACKDROPS, EXPRESSIONS, SWATCHES, TEXTURES, auraSvg, normalizeLook } from "../lib/faces";

// Dress Aura up. Every option is shown as Aura wearing it, so you pick by looking, not by reading.
export default function Personalize({ visible, initial, onSave, onClose, saveLabel = "Save look", inline }: {
  visible?: boolean; initial: AuraLook; onSave: (look: AuraLook) => void; onClose?: () => void; saveLabel?: string; inline?: boolean;
}) {
  const [look, setLook] = useState<AuraLook>(normalizeLook(initial));
  const set = (patch: Partial<AuraLook>) => { Haptics.selectionAsync().catch(() => {}); setLook((l) => ({ ...l, ...patch })); };
  const surprise = () => {
    const r = <T,>(a: { key: T }[]) => a[Math.floor(Math.random() * a.length)].key;
    set({ color: r(SWATCHES), texture: r(TEXTURES), expression: r(EXPRESSIONS), accessory: r(ACCESSORIES), backdrop: r(BACKDROPS.filter((b) => b.key !== "none")) });
  };

  const body = (
    <View style={{ flex: 1 }}>
      <View style={s.top}>
        {onClose ? <IconButton icon="chevron-left" variant="outline" size={40} onPress={onClose} label="Back" /> : <View style={{ width: 40 }} />}
        <LinkButton label="Surprise me" icon="shuffle" color={c.ink2} onPress={surprise} />
      </View>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.preview} accessibilityLabel="Preview of Aura">
          <Mark size={208} look={look} backdrop />
        </View>

        <Row title="Color">
          {SWATCHES.map((x) => (
            <Ring key={x.key} on={look.color === x.key} onPress={() => set({ color: x.key })} label={x.label} size={44}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: x.base, borderWidth: 1, borderColor: "rgba(13,14,18,0.08)" }} />
            </Ring>
          ))}
        </Row>
        <Row title="Texture">
          {TEXTURES.map((x) => (
            <Ring key={x.key} on={look.texture === x.key} onPress={() => set({ texture: x.key })} label={x.label} size={84} caption>
              <Thumb look={{ ...look, texture: x.key, accessory: "none" }} size={68} />
            </Ring>
          ))}
        </Row>
        <Row title="Accessories">
          {ACCESSORIES.map((x) => (
            <Ring key={x.key} on={look.accessory === x.key} onPress={() => set({ accessory: x.key })} label={x.label} size={68}>
              {x.key === "none" ? <Feather name="slash" size={22} color={c.faint} /> : <Thumb look={{ ...look, accessory: x.key }} size={56} />}
            </Ring>
          ))}
        </Row>
        <Row title="Expression">
          {EXPRESSIONS.map((x) => (
            <Ring key={x.key} on={look.expression === x.key} onPress={() => set({ expression: x.key })} label={x.label} size={68}>
              <Thumb look={{ ...look, expression: x.key, accessory: "none" }} size={56} />
            </Ring>
          ))}
        </Row>
        <Row title="Backdrop">
          {BACKDROPS.map((x) => (
            <Ring key={x.key} on={look.backdrop === x.key} onPress={() => set({ backdrop: x.key })} label={x.label} size={52}>
              {x.key === "none" ? <View style={[s.swatch, { backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }]} /> : <Backdrop look={{ ...look, backdrop: x.key }} />}
            </Ring>
          ))}
        </Row>
        <View style={{ height: 96 }} />
      </ScrollView>
      <View style={s.saveWrap} pointerEvents="box-none">
        <Button label={saveLabel} onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); onSave(look); }} style={s.save} />
      </View>
    </View>
  );

  if (inline) return body;
  return (
    <Modal visible={!!visible} animationType="slide" presentationStyle={Platform.OS === "ios" ? "fullScreen" : undefined} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>{body}</SafeAreaView>
    </Modal>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: sp.xl }}>
      <Text style={[t.headline, { paddingHorizontal: 24 }]} accessibilityRole="header">{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>{children}</ScrollView>
    </View>
  );
}

function Ring({ on, onPress, label, size, caption, children }: { on: boolean; onPress: () => void; label: string; size: number; caption?: boolean; children: React.ReactNode }) {
  return (
    <Press onPress={onPress} scaleTo={0.94} accessibilityRole="radio" accessibilityLabel={label} style={{ alignItems: "center" }}>
      <View style={[s.ring, { width: size, height: size, borderRadius: size / 2 }, on && s.ringOn]}>{children}</View>
      {caption ? <Text style={[t.caption, { marginTop: 6, color: on ? c.ink : c.muted }]}>{label}</Text> : null}
    </Press>
  );
}

function Thumb({ look, size }: { look: AuraLook; size: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const xml = useMemo(() => auraSvg(look, uid), [JSON.stringify(look), uid]);
  return <SvgXml xml={xml} width={size} height={size} />;
}

// A swatch of the backdrop alone: the character is drawn off-canvas so only the gradient shows.
function Backdrop({ look }: { look: AuraLook }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const xml = useMemo(() => auraSvg(look, uid, { backdrop: true }).replace(/<path d="M[^"]*" fill="url\(#b[^)]*\)"\/>[\s\S]*<\/svg>$/, "</svg>"), [JSON.stringify(look), uid]);
  return <View style={s.swatch}><SvgXml xml={xml} width={44} height={44} /></View>;
}

const s = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8 },
  scroll: { paddingTop: sp.m },
  preview: { alignItems: "center", paddingVertical: sp.m },
  row: { paddingHorizontal: 20, paddingTop: sp.m, gap: 10, alignItems: "flex-start" },
  ring: { alignItems: "center", justifyContent: "center", backgroundColor: c.sunken, borderWidth: 2, borderColor: "transparent" },
  ringOn: { borderColor: c.ink, backgroundColor: c.surface },
  swatch: { width: 44, height: 44, borderRadius: 22, overflow: "hidden" },
  saveWrap: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingBottom: 20, paddingTop: 12 },
  save: { borderRadius: 26, height: 54 },
});
