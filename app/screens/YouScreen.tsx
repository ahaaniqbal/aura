import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import BrandIcon from "../components/BrandIcon";
import { Button, Divider, IconName, Press, Section } from "../components/ui";
import { c, f, layout, r, sp, t } from "../theme";

const TOOLS: { key: string; slug: string; brand: string; label: string; icon: IconName; sub: string }[] = [
  { key: "gmail", slug: "gmail", brand: "gmail", label: "Gmail", icon: "mail", sub: "Reads new mail, drafts replies for your OK" },
  { key: "gcal", slug: "google-calendar", brand: "googlecalendar", label: "Google Calendar", icon: "calendar", sub: "Knows when you're busy and when you're free" },
  { key: "notion", slug: "notion", brand: "notion", label: "Notion", icon: "file-text", sub: "Your notes and docs" },
  { key: "slack", slug: "slack", brand: "slack", label: "Slack", icon: "slack", sub: "Catches messages that need you" },
  { key: "whatsapp", slug: "", brand: "whatsapp", label: "WhatsApp", icon: "message-circle", sub: "Not available yet" },
  { key: "bank", slug: "", brand: "", label: "Bank and cards", icon: "credit-card", sub: "Not available yet" },
];

export default function YouScreen({ serverConnected, onConnect, isPro, onUpgrade, onSignOut }: {
  serverConnected: string[]; onConnect: (slug: string) => void; isPro: boolean; onUpgrade: () => void; onSignOut: () => void;
}) {
  const connectable = TOOLS.filter((x) => x.slug);
  const connected = connectable.filter((x) => serverConnected.includes(x.slug)).length;
  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <Text style={t.display} accessibilityRole="header">You</Text>

      {isPro ? (
        <View style={s.proOn}>
          <Text style={t.headline}>Aura Pro</Text>
          <Text style={[t.subhead, { marginTop: 2 }]}>Active. Unlimited people and promises, and the daily brief.</Text>
        </View>
      ) : (
        <View style={s.pro}>
          <Text style={s.proKicker}>Aura Pro</Text>
          <Text style={s.proTitle}>Keep everyone. Forget nothing.</Text>
          <Text style={s.proBody}>Unlimited people and promises, plus a daily brief of who needs you. Free for 7 days, then $12 a month.</Text>
          <Button label="Start free trial" variant="inverse" size="md" onPress={onUpgrade} style={{ alignSelf: "flex-start", marginTop: sp.xl }} />
        </View>
      )}

      <Section title="Connected apps" meta={`${connected} of ${connectable.length}`}>
        {TOOLS.map((x, i) => {
          const on = !!x.slug && serverConnected.includes(x.slug);
          const can = !!x.slug;
          return (
            <View key={x.key}>
              {i > 0 ? <Divider inset={38} /> : null}
              <View style={s.tool}>
                <View style={[s.logo, !can && { opacity: 0.45 }]}>{x.brand ? <BrandIcon brand={x.brand} size={20} /> : <Feather name={x.icon} size={18} color={c.ink2} />}</View>
                <View style={{ flex: 1 }}>
                  <Text style={[t.label, !can && { color: c.muted }]}>{x.label}</Text>
                  <Text style={[t.footnote, { marginTop: 2 }]}>{x.sub}</Text>
                </View>
                {on ? (
                  <View style={s.on}><Feather name="check" size={14} color={c.ink} /><Text style={s.onTxt}>Connected</Text></View>
                ) : can ? <Button label="Connect" size="sm" variant="secondary" onPress={() => onConnect(x.slug)} /> : null}
              </View>
            </View>
          );
        })}
      </Section>

      <Section title="Memory">
        <Text style={[t.subhead, { marginTop: sp.s }]}>Aura keeps what you tell it, and what it learns from apps you connect, so it can bring things back at the right moment. Clearing a conversation never erases what Aura remembers.</Text>
      </Section>

      <Section title="Account">
        <Press onPress={onSignOut} style={s.row} scaleTo={0.99} accessibilityLabel="Sign out">
          <Text style={[t.label, { flex: 1 }]}>Sign out</Text>
          <Feather name="log-out" size={17} color={c.ink2} />
        </Press>
      </Section>
      <Text style={[t.footnote, { marginTop: sp.h }]}>Aura 1.0</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { paddingHorizontal: layout.page, paddingTop: sp.xl, paddingBottom: 56 },
  pro: { marginTop: sp.xl, backgroundColor: c.accent, borderRadius: r.md, padding: sp.xl },
  proKicker: { fontFamily: f.medium, fontSize: 13, color: c.onAccentMuted },
  proTitle: { fontFamily: f.medium, fontSize: 28, lineHeight: 32, letterSpacing: -0.9, color: c.onAccent, marginTop: sp.s },
  proBody: { fontFamily: f.regular, fontSize: 15, lineHeight: 21, color: c.onAccentMuted, marginTop: sp.m },
  proOn: { marginTop: sp.xl, paddingVertical: sp.l, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong },
  tool: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 14 },
  logo: { width: 22, alignItems: "center" },
  on: { flexDirection: "row", alignItems: "center", gap: 5 },
  onTxt: { fontFamily: f.medium, fontSize: 13.5, color: c.ink },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
});
