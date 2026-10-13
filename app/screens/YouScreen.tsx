import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import BrandIcon from "../components/BrandIcon";
import Mark from "../components/Mark";
import { Button, Divider, IconButton, IconName, Press, Section, Toggle } from "../components/ui";
import { c, f, inputReset, layout, r, sp, t } from "../theme";
import { PERSONALITIES } from "../lib/personality";
import type { McpServer, PairedAgent, Personality, Settings } from "../lib/api";
import { personalityLabel } from "../lib/personality";
import { swatch, TEXTURES } from "../lib/faces";

const TOOLS: { key: string; slug: string; brand: string; label: string; icon: IconName; sub: string }[] = [
  { key: "gmail", slug: "gmail", brand: "gmail", label: "Gmail", icon: "mail", sub: "Read and write emails, find receipts" },
  { key: "gcal", slug: "google-calendar", brand: "googlecalendar", label: "Google Calendar", icon: "calendar", sub: "Manage your calendar, prep for meetings" },
  { key: "drive", slug: "googledrive", brand: "googledrive", label: "Google Drive", icon: "folder", sub: "Find and share files" },
  { key: "slack", slug: "slack", brand: "slack", label: "Slack", icon: "slack", sub: "Search and send messages" },
  { key: "notion", slug: "notion", brand: "notion", label: "Notion", icon: "file-text", sub: "Search your workspace" },
  { key: "linear", slug: "linear", brand: "linear", label: "Linear", icon: "check-square", sub: "Manage issues" },
  { key: "github", slug: "github", brand: "github", label: "GitHub", icon: "github", sub: "Track PRs and issues" },
  { key: "todoist", slug: "todoist", brand: "todoist", label: "Todoist", icon: "check-circle", sub: "Your tasks, both ways" },
  { key: "spotify", slug: "spotify", brand: "spotify", label: "Spotify", icon: "music", sub: "Play and queue music" },
  { key: "strava", slug: "strava", brand: "strava", label: "Strava", icon: "activity", sub: "Your runs and rides" },
  { key: "whatsapp", slug: "", brand: "whatsapp", label: "WhatsApp", icon: "message-circle", sub: "Not available yet" },
];

export default function YouScreen({ settings, onSettings, onUnfiltered, serverConnected, onConnect, isPro, onUpgrade, onSignOut, onPersonalize, mcp, onAddMcp, onRemoveMcp, agents, onPairAgent, onRevokeAgent, onDeleteAccount }: {
  settings: Settings; onSettings: (patch: { personality?: Personality; instructions?: string }) => Promise<boolean>; onUnfiltered: (on: boolean) => void;
  serverConnected: string[]; onConnect: (slug: string) => void; isPro: boolean; onUpgrade: () => void; onSignOut: () => void;
  onPersonalize: () => void; mcp: McpServer[]; onAddMcp: () => void; onRemoveMcp: (s: McpServer) => void;
  agents: PairedAgent[]; onPairAgent: () => void; onRevokeAgent: (a: PairedAgent) => void; onDeleteAccount: () => void;
}) {
  const [instr, setInstr] = useState(settings.instructions);
  const [focused, setFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setInstr(settings.instructions); }, [settings.instructions]);
  const dirty = instr.trim() !== (settings.instructions || "").trim();
  const connected = TOOLS.filter((x) => x.slug && serverConnected.includes(x.slug)).length;

  return (
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Text style={t.display} accessibilityRole="header">You</Text>

      <Press onPress={onPersonalize} style={s.hero} scaleTo={0.99} accessibilityLabel="Change how Aura looks">
        <Mark size={88} backdrop />
        <View style={{ flex: 1 }}>
          <Text style={t.title2}>Aura</Text>
          <Text style={[t.footnote, { marginTop: 2 }]}>{personalityLabel(settings.personality)}  ·  {TEXTURES.find((x) => x.key === settings.look.texture)?.label} {swatch(settings.look.color).label.toLowerCase()}</Text>
          <Text style={[t.label, { marginTop: sp.s, color: c.accentText }]}>Personalize</Text>
        </View>
      </Press>

      <Section title="Personality" meta="How Aura talks to you">
        {PERSONALITIES.map((p, i) => {
          const on = settings.personality === p.key;
          return (
            <View key={p.key}>
              {i > 0 ? <Divider /> : null}
              <Press onPress={() => !on && onSettings({ personality: p.key })} style={s.option} scaleTo={0.99} accessibilityRole="radio" accessibilityLabel={`${p.label}. ${p.line}`}>
                <View style={[s.radio, on && s.radioOn]}>{on ? <View style={s.radioDot} /> : null}</View>
                <View style={{ flex: 1 }}>
                  <Text style={t.label}>{p.label}</Text>
                  <Text style={[t.footnote, { marginTop: 2 }]}>{p.line}</Text>
                  {on ? <View style={s.sample}><Text style={t.callout}>{p.sample}</Text></View> : null}
                </View>
              </Press>
            </View>
          );
        })}
      </Section>

      <Section title="Unfiltered">
        <View style={s.unfiltered}>
          <View style={{ flex: 1 }}>
            <Text style={t.label}>Unfiltered mode</Text>
            <Text style={[t.callout, { marginTop: 4 }]}>
              {settings.unfiltered_available
                ? "Aura answers what you actually ask, mature and controversial topics included, without lectures or disclaimers. Runs on Unblock's open-weight models. For adults only."
                : "Runs on Unblock's open-weight models, without lectures or disclaimers. Available once Aura is connected to Unblock."}
            </Text>
          </View>
          {settings.unfiltered_available
            ? <Toggle value={settings.unfiltered} onChange={onUnfiltered} label="Unfiltered mode" />
            : <Text style={t.caption}>Not connected</Text>}
        </View>
      </Section>

      <Section title="Your instructions">
        <TextInput style={[s.instr, inputReset, focused && { borderColor: c.ink }]} value={instr} onChangeText={setInstr} multiline textAlignVertical="top"
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} selectionColor={c.accent} maxLength={1500}
          placeholder="Call me Ahaan. Keep it short. I work in product, so skip the basics." placeholderTextColor={c.faint} accessibilityLabel="Your instructions for Aura" />
        {dirty ? (
          <Button label="Save instructions" size="md" loading={saving} style={{ marginTop: sp.m, alignSelf: "flex-start" }}
            onPress={async () => { setSaving(true); await onSettings({ instructions: instr }); setSaving(false); }} />
        ) : null}
      </Section>

      <Section title="Connected apps" meta={`${connected} connected`}>
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
                ) : can ? <IconButton icon="plus" size={32} onPress={() => onConnect(x.slug)} label={`Connect ${x.label}`} style={{ borderRadius: 16 }} /> : null}
              </View>
            </View>
          );
        })}
      </Section>

      <Section title="MCP servers" action="Add" onAction={onAddMcp}>
        {mcp.length ? mcp.map((m, i) => (
          <View key={m.id}>
            {i > 0 ? <Divider inset={38} /> : null}
            <View style={s.tool}>
              <View style={s.logo}><Feather name="server" size={18} color={m.status === "ok" ? c.ink2 : c.accentText} /></View>
              <View style={{ flex: 1 }}>
                <Text style={t.label}>{m.name}</Text>
                <Text style={[t.footnote, { marginTop: 2 }, m.status !== "ok" && { color: c.accentText }]} numberOfLines={1}>{m.status === "ok" ? `${m.tools.length} tool${m.tools.length === 1 ? "" : "s"}  ·  ${hostOf(m.url)}` : m.last_error || "Can't reach it"}</Text>
              </View>
              <IconButton icon="x" size={32} variant="plain" color={c.ink2} onPress={() => onRemoveMcp(m)} label={`Remove ${m.name}`} />
            </View>
          </View>
        )) : (
          <Press onPress={onAddMcp} style={s.tool} scaleTo={0.99} accessibilityLabel="Connect an MCP server">
            <View style={s.logo}><Feather name="server" size={18} color={c.ink2} /></View>
            <View style={{ flex: 1 }}>
              <Text style={t.label}>Connect any MCP server</Text>
              <Text style={[t.footnote, { marginTop: 2 }]}>Your company's tools, Zapier, anything with a server address</Text>
            </View>
            <Feather name="plus" size={18} color={c.ink} />
          </Press>
        )}
      </Section>

      <Section title="Agents" action="Pair" onAction={onPairAgent}>
        {agents.length ? agents.map((a, i) => (
          <View key={a.id}>
            {i > 0 ? <Divider inset={38} /> : null}
            <View style={s.tool}>
              <View style={s.logo}><Feather name="cpu" size={18} color={c.ink2} /></View>
              <View style={{ flex: 1 }}>
                <Text style={t.label}>{a.label}</Text>
                <Text style={[t.footnote, { marginTop: 2 }]}>{a.recall_until ? `Can read your memory until ${timeOf(a.recall_until)}` : `Paired ${dayOf(a.created_at)}. Asks before reading or acting`}</Text>
              </View>
              <Button label="Remove" size="sm" variant="ghost" onPress={() => onRevokeAgent(a)} />
            </View>
          </View>
        )) : (
          <Text style={[t.callout, { paddingVertical: 14 }]}>Let another agent, like Claude or a work bot, message you through Aura and ask to use your memory. You approve every read and every action.</Text>
        )}
      </Section>

      <Section title="Plan">
        <View style={s.tool}>
          <View style={{ flex: 1 }}>
            <Text style={t.label}>{isPro ? "Aura Pro" : "Free"}</Text>
            <Text style={[t.footnote, { marginTop: 2 }]}>{isPro ? "Active. Unlimited memory and the daily brief." : "Pro adds unlimited memory and a daily brief. 7 days free, then $12 a month."}</Text>
          </View>
          {isPro ? null : <Button label="Try Pro" size="sm" variant="secondary" onPress={onUpgrade} />}
        </View>
      </Section>

      <Section title="Account">
        <Press onPress={onSignOut} style={s.row} scaleTo={0.99} accessibilityLabel="Sign out">
          <Text style={[t.label, { flex: 1 }]}>Sign out</Text>
          <Feather name="log-out" size={17} color={c.ink2} />
        </Press>
        <Divider />
        <Press onPress={onDeleteAccount} style={s.row} scaleTo={0.99} accessibilityLabel="Delete account and data">
          <Text style={[t.label, { flex: 1, color: c.accentText }]}>Delete account and data</Text>
          <Feather name="trash-2" size={17} color={c.accentText} />
        </Press>
      </Section>
      <Text style={[t.footnote, { marginTop: sp.h }]}>Aura 1.0</Text>
    </ScrollView>
  );
}

const hostOf = (u: string) => { try { return new URL(u).hostname; } catch (_) { return u; } };
const timeOf = (iso: string) => { const d = new Date(iso); const h = d.getHours(); return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };
const dayOf = (iso: string) => { const d = new Date(iso); return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]} ${d.getDate()}`; };

const s = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center", gap: sp.l, marginTop: sp.xl, paddingVertical: sp.s },
  scroll: { paddingHorizontal: layout.page, paddingTop: sp.xl, paddingBottom: 56 },
  option: { flexDirection: "row", alignItems: "flex-start", gap: 14, paddingVertical: 14 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.control, alignItems: "center", justifyContent: "center", marginTop: 1 },
  radioOn: { borderColor: c.ink },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.ink },
  sample: { marginTop: sp.m, backgroundColor: c.sunken, borderRadius: r.md, paddingHorizontal: 14, paddingVertical: 10 },
  unfiltered: { flexDirection: "row", alignItems: "flex-start", gap: sp.l, paddingVertical: 14 },
  instr: { marginTop: sp.m, minHeight: 96, backgroundColor: c.surface, borderRadius: r.md, borderWidth: 1, borderColor: c.control, padding: 14, fontFamily: f.regular, fontSize: 15.5, lineHeight: 22, color: c.ink },
  tool: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 14 },
  logo: { width: 22, alignItems: "center" },
  on: { flexDirection: "row", alignItems: "center", gap: 5 },
  onTxt: { fontFamily: f.medium, fontSize: 13, color: c.ink },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
});
