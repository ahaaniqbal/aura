import React, { useState } from "react";
import { Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import Mark from "./Mark";
import { Button, Divider, IconButton, Press } from "./ui";
import { c, layout, sp, t } from "../theme";
import { AuraLook, normalizeLook, PALETTES } from "../lib/auras";

// Pick the palette Aura glows in. Same radio list as the personality picker, with Aura itself as
// the preview at the top: one choice, made by looking.
export default function Personalize({ visible, initial, onSave, onClose, saveLabel = "Use these colors", inline }: {
  visible?: boolean; initial: AuraLook; onSave: (look: AuraLook) => void; onClose?: () => void; saveLabel?: string; inline?: boolean;
}) {
  const [look, setLook] = useState<AuraLook>(normalizeLook(initial));
  const pick = (key: string) => { Haptics.selectionAsync().catch(() => {}); setLook({ palette: key }); };

  const body = (
    <View style={{ flex: 1 }}>
      {!inline ? (
        <View style={s.top}>
          <IconButton icon="chevron-left" size={36} variant="plain" onPress={onClose} label="Back" />
        </View>
      ) : null}
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {!inline ? <Text style={t.title1} accessibilityRole="header">Aura's colors</Text> : null}
        <View style={s.preview} accessibilityLabel={`Preview: ${PALETTES.find((p) => p.key === look.palette)?.label}`}>
          <Mark size={180} look={look} />
        </View>
        <View style={s.list}>
          {PALETTES.map((p, i) => {
            const on = look.palette === p.key;
            return (
              <View key={p.key}>
                {i > 0 ? <Divider inset={54} /> : null}
                <Press onPress={() => pick(p.key)} style={s.option} scaleTo={0.99} accessibilityRole="radio" accessibilityLabel={`${p.label}. ${p.line}`}>
                  <Mark size={40} look={{ palette: p.key }} dot={false} />
                  <View style={{ flex: 1 }}>
                    <Text style={t.label}>{p.label}</Text>
                    <Text style={[t.footnote, { marginTop: 2 }]}>{p.line}</Text>
                  </View>
                  <View style={[s.radio, on && s.radioOn]}>{on ? <View style={s.radioDot} /> : null}</View>
                </Press>
              </View>
            );
          })}
        </View>
        <View style={{ height: 96 }} />
      </ScrollView>
      <View style={s.saveWrap} pointerEvents="box-none">
        <Button label={saveLabel} onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); onSave(look); }} />
      </View>
    </View>
  );

  if (inline) return body;
  return (
    <Modal visible={!!visible} animationType="slide" presentationStyle={Platform.OS === "ios" ? "pageSheet" : undefined} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>{body}</SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  top: { paddingHorizontal: 12, paddingTop: 6 },
  scroll: { paddingHorizontal: layout.page, paddingTop: sp.s },
  preview: { alignItems: "center", paddingVertical: sp.l },
  list: { borderTopWidth: 1, borderTopColor: c.ink },
  option: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.control, alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: c.ink },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.ink },
  saveWrap: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: layout.page, paddingBottom: 20, paddingTop: 12, backgroundColor: c.canvas },
});
