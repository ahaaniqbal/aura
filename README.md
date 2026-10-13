# Aura

**The ambient AI that remembers everything and acts before you ask.**

Aura is a notes and chat app with an ambient brain. You talk or jot things down, by text or voice, and Aura quietly remembers everything in a persistent memory layer (HydraDB), connects to your real tools (Gmail, Calendar, Notion, Slack), and works in the background. It reads your inbox, drafts replies in your voice, and surfaces a single card when something genuinely needs you, which you approve with one tap or a swipe right (swipe left to dismiss) to send the reply through your real Gmail. It can pay with a virtual card and act on your context, like offering to grab a friend's birthday cake when you pass a bakery.

Built by **Ahaan Iqbal** for the Agents you Love hackathon.

## What makes it useful

- **Memory that compounds.** Every thought, preference, person, and plan is stored in HydraDB and recalled the moment it is useful, across sessions.
- **Proactive, not reactive.** A background loop notices new email when you are free, drafts a reply in your voice, and surfaces one calm card. Approve it with a tap or a swipe right and it sends the reply through your real Gmail.
- **Acts in the real world.** Real OAuth to Gmail, Calendar, Notion, and Slack via Composio. A virtual card via AgentCard to transact. Voice in and out.
- **Protects your attention.** It handles the small stuff silently and only interrupts you when it matters.

## Architecture

```
Aura app (Expo, iPhone)
   |  REST + 2s feed poll, local notifications
   v
Butterbase  ──  serverless functions (the agent loop) + Postgres + Claude AI gateway
   ├── HydraDB ............ persistent memory of record (per-user, semantic recall)
   ├── Composio ........... managed OAuth + tool execution (gmail, calendar, notion, slack)
   ├── AgentCard .......... virtual card to transact (test mode)
   └── OpenAI Whisper ..... voice transcription
```

The engine is one loop: `capture -> remember -> recall -> decide -> surface -> approve -> act -> learn`. Three demo flows (proactive email, birthday-cake-near-a-bakery, urgent interrupt) are all configurations of this one engine.

## Repository

- `app/` — the Expo (React Native, TypeScript) app. `screens/` holds the five tabs (Today, Ask, People, Notes, You) and sign-in; `components/` holds the design system primitives (`ui.tsx`), approval cards with edit and undo, the person record, the conversation recorder and onboarding; `theme.ts` holds the tokens (ABC Diatype, cobalt for Aura, signal orange for "needs you now").
- `backend/functions/` — the Butterbase serverless functions (deployed at runtime):
  - `capture` — tool-aware chat: store + recall memory, read live Gmail when asked, reply in Aura's voice.
  - `sync_email` — fetch the real inbox, draft a reply to the message that needs one (deduped per message).
  - `approve` — execute an approved action: send the reply via real Gmail, AgentCard order, write-back to memory.
  - `simulate` — deterministic ambient triggers for the demo (near a bakery, incoming email, meeting ends).
  - `auto_tick` — cron that proactively surfaces a new email card when you are free.
  - `connect` / `connections` — real OAuth connect flow and connected-state.
  - `note` — capture a note straight into memory.
  - `set_location` — store real device location.
  - `transcribe` — Whisper voice transcription.
  - `feed` / `reset` — app polling endpoint and demo reset.
- `deck/` — the project presentation.

Secrets are never in the code. All keys (HydraDB, OpenAI, Butterbase, AgentCard) are injected as server-side environment variables on Butterbase.

## Run the app

```bash
cd app
npm install
npx expo start --tunnel
```

Open the QR in **Expo Go** (Expo SDK 54). First load asks for microphone and location permission.

## Built with

TypeScript, React Native, Expo, Butterbase, HydraDB, Composio, Claude (Anthropic), OpenAI Whisper, AgentCard, Node.js, PostgreSQL.

---

Aura, by Ahaan Iqbal.
