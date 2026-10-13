import React, { useRef } from "react";
import { Animated, Dimensions, Easing, PanResponder, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { Button, Status, ui } from "./ui";
import { c, f, sp, t } from "../theme";
import { capitalize } from "../lib/dates";
import type { Card } from "../lib/api";

const SCREEN_W = Dimensions.get("window").width;
const SWIPE_THRESH = 100;

export const isReply = (card: Card) => card.type === "draft_held" || card.type === "urgent";
export const verbFor = (card: Card) => (isReply(card) ? "Send reply" : "Approve");

function memoryLine(card: Card): string | null {
  const first = (card.memory_refs || [])[0];
  if (!first) return null;
  const short = String(first).split("\n")[0].replace(/^extra context:\s*/i, "").trim();
  return short ? (short.length > 70 ? short.slice(0, 70).trimEnd() + "…" : short) : null;
}

// Everything Aura wants your ok on. A drafted reply is shown in full, exactly as it will be sent,
// and the button says what it does. In the conversation it can also be swiped: right to send,
// left to set aside. The parent hides it while the action waits behind an undo.
export default function ActionCard({ card, onAct, onEdit, busy, swipe }: { card: Card; onAct: (c: Card, d: "approve" | "decline") => void; onEdit?: (c: Card) => void; busy?: boolean; swipe?: boolean }) {
  const reply = isReply(card);
  const mem = memoryLine(card);
  const pan = useRef(new Animated.Value(0)).current;
  const acting = useRef(false);
  const onActRef = useRef(onAct); onActRef.current = onAct;
  const cardRef = useRef(card); cardRef.current = card;

  const finish = (decision: "approve" | "decline", dir: number) => {
    if (acting.current) return;
    acting.current = true;
    Haptics.notificationAsync(decision === "approve" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    if (!swipe) { onActRef.current(cardRef.current, decision); return; }
    Animated.timing(pan, { toValue: dir * (SCREEN_W + 60), duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true })
      .start(() => onActRef.current(cardRef.current, decision));
  };
  const responder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => !!swipe && !acting.current && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.3,
    onPanResponderMove: (_, g) => pan.setValue(g.dx),
    onPanResponderRelease: (_, g) => {
      if (g.dx > SWIPE_THRESH) finish("approve", 1);
      else if (g.dx < -SWIPE_THRESH) finish("decline", -1);
      else Animated.timing(pan, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.timing(pan, { toValue: 0, duration: 200, useNativeDriver: true }).start(),
  })).current;

  if (card.status === "dismissed" || card.status === "declined") return null;
  if (card.status === "done" || card.status === "approved") {
    return (
      <View style={s.done}>
        <Feather name="check" size={14} color={c.ink2} />
        <Text style={[t.subhead, { flex: 1 }]} numberOfLines={1}>{capitalize(card.title)}</Text>
        <Text style={t.caption}>{card.status === "done" ? "Done" : "Approved"}</Text>
      </View>
    );
  }

  const yesOp = pan.interpolate({ inputRange: [16, 96], outputRange: [0, 1], extrapolate: "clamp" });
  const noOp = pan.interpolate({ inputRange: [-96, -16], outputRange: [1, 0], extrapolate: "clamp" });
  const kind = card.type === "urgent" ? "Urgent" : card.type === "draft_held" ? "Draft reply" : card.type === "reminder" ? "Reminder" : "Suggestion";

  return (
    <Animated.View style={[ui.box, s.card, { transform: [{ translateX: pan }] }]} {...(swipe ? responder.panHandlers : {})}>
      {swipe ? (
        <>
          <Animated.Text pointerEvents="none" style={[s.stamp, { left: 16, color: c.accent, opacity: yesOp }]}>{verbFor(card)}</Animated.Text>
          <Animated.Text pointerEvents="none" style={[s.stamp, { right: 16, color: c.muted, opacity: noOp }]}>Not now</Animated.Text>
        </>
      ) : null}
      <Status label={kind} tone={card.type === "urgent" ? "signal" : "muted"} dot={card.type === "urgent"} />
      <Text style={[t.title2, { marginTop: 6 }]}>{capitalize(card.title)}</Text>
      {card.body ? (
        reply ? (
          <View style={s.draft}>
            <Text style={t.body}>{card.body}</Text>
          </View>
        ) : <Text style={[t.callout, { marginTop: 6 }]}>{card.body}</Text>
      ) : null}
      {mem ? (
        <View style={s.memory}>
          <Feather name="bookmark" size={12} color={c.accent} />
          <Text style={s.memoryTxt} numberOfLines={2}>From memory: {mem}</Text>
        </View>
      ) : null}
      <View style={s.actions}>
        <Button label={verbFor(card)} size="md" onPress={() => finish("approve", 1)} disabled={busy} style={{ flex: 1 }} />
        {reply && onEdit ? <Button label="Edit" size="md" variant="secondary" onPress={() => onEdit(card)} disabled={busy} style={{ paddingHorizontal: 18 }} /> : null}
        <Button label="Not now" size="md" variant="ghost" onPress={() => finish("decline", -1)} disabled={busy} style={{ paddingHorizontal: 12 }} />
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  card: { padding: sp.l, marginTop: sp.m, marginBottom: sp.s },
  draft: { marginTop: sp.m, paddingTop: sp.m, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  memory: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: sp.m },
  memoryTxt: { fontFamily: f.medium, fontSize: 13, lineHeight: 17, color: c.accent, flexShrink: 1, marginTop: -2 },
  actions: { flexDirection: "row", alignItems: "center", gap: sp.s, marginTop: sp.l },
  stamp: { position: "absolute", top: 16, zIndex: 5, fontFamily: f.medium, fontSize: 13 },
  done: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.line, marginTop: sp.s },
});
