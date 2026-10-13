# Aura

**A personal AI that actually knows you.**

Aura is one AI for your work and your life. You talk to it like a person, by text or voice. It remembers what you tell it, keeps an eye on your inbox and calendar, reminds you of things at the right time and place, and handles the small stuff with your OK. It has a personality you choose, and an optional Unfiltered mode for adults that answers what you actually ask, without lectures.

Built by **Ahaan Iqbal**.

## The app

Four tabs, set in ABC Diatype on a near-white canvas with one vermilion accent.

- **Aura.** The conversation. Ask anything, about work or life. Drafted replies and suggestions arrive inline as cards you approve, edit or dismiss (swipe right to approve, left to dismiss).
- **Today.** One sentence on what kind of day it is, then what's waiting for your OK, what's on your plate (time and place reminders), and the people who could use you. "Get my brief" asks Aura for the day in one message. "Record" captures a conversation and files the notes.
- **Memory.** Everything Aura knows, and the controls to change it. About you (forget any fact, or everything), People (a record per person), Reminders (by when, by place, and to dos). Teach it something directly from the top of the screen.
- **You.** Personality (Witty, Warm, Blunt, Chill), Unfiltered mode, your own standing instructions, connected apps, plan and account.

First run asks your name, how Aura should talk to you and what's on your plate, then shows back what it picked up.

## Personality and memory

- **Personality.** Each user picks a voice. The agent's system prompt gets the matching persona plus the user's own instructions (`settings` function, `user_settings` table). Aura texts like a person: short, lowercase, no filler.
- **Memory that compounds.** Facts, people, promises and plans go to HydraDB (with a Postgres mirror) and come back when useful, across sessions. People and their birthdays, wants and open promises live in a graph (`graph` function).
- **You stay in control.** Every memory can be forgotten from the Memory tab, with undo.

## Unfiltered mode

Unfiltered mode is Aura's edge: for adults who opt in, conversations run on Unblock's open-weight models (the same setup as Kaeva's Unblock), so Aura answers mature and controversial questions directly instead of refusing or moralizing.

- **Opt in only.** Off by default. Turning it on requires confirming you are 18 or older; the server rejects the switch without that confirmation (`adult_confirmation_required`).
- **Hard floor stays.** Requests involving the sexual exploitation of minors or violent exploitation are always refused, on every model, the same floor Unblock enforces (`illegalRequest` in `agent.ts`).
- **Status.** The toggle, age gate, settings storage and hard floor are built. Routing the agent loop to Unblock when Unfiltered is on is not wired yet. Until `UNBLOCK_API_KEY` and `UNBLOCK_MODEL` are set on the server, the You tab shows Unfiltered as "Not connected".

## Architecture

```
Aura app (Expo, iPhone)
   |  REST, 2s poll on the chat and 7s on Today, local notifications
   v
Butterbase  ──  serverless functions (the agent loop) + Postgres + Claude AI gateway
   ├── HydraDB ............ persistent memory of record (per user, semantic recall)
   ├── Composio ........... managed OAuth + tool execution (Gmail, Calendar, Notion, Slack)
   ├── Unblock ............ open-weight models for Unfiltered mode (planned routing)
   ├── AgentCard .......... virtual card to transact (test mode)
   └── OpenAI Whisper ..... voice transcription
```

The engine is one loop: `capture -> remember -> recall -> decide -> surface -> approve -> act -> learn`.

## Repository

- `app/`, the Expo (React Native, TypeScript) app.
  - `screens/`: `AuraScreen` (chat), `TodayScreen`, `MemoryScreen`, `YouScreen`, `AuthScreen`.
  - `components/`: design system primitives (`ui.tsx`), action cards, sheets (edit draft, confirm, age gate, Pro), the person record, the recorder, onboarding, the mark.
  - `lib/`: API client, personalities, date helpers, toast bus.
  - `theme.ts`: tokens. ABC Diatype, ink `#0D0E12`, canvas `#FBFBFC`, vermilion `#FF4F12` for Aura and for "needs you".
- `backend/functions/`, the Butterbase serverless functions:
  - `agent`: the conversation. Personality and instructions from settings, memory recall, tools (Gmail, Calendar, reminders, people), the hard floor.
  - `settings`: personality, Unfiltered with age confirmation, instructions, forget one memory or all of them.
  - `feed`, `remember`, `graph`, `brief`, `note`, `capture`: what the tabs read, reminders, people, the daily brief, quick notes, recorded conversations.
  - `sync_email`, `auto_tick`, `nudge_cron`, `pulse`: the proactive loop (new mail, drafts, nudges).
  - `approve`: carry out an approved card (send the reply through Gmail, order on the card), then write back to memory.
  - `connect`, `connections`, `set_location`, `set_timezone`, `register_device`, `transcribe`, `simulate`, `reset`.
- `deck/`, the project presentation.

## Environment

Secrets are never in the code. Set these on Butterbase as server-side environment variables:

| Variable | Used for |
| --- | --- |
| HydraDB, OpenAI, AgentCard keys | Memory, transcription, payments (as before) |
| `UNBLOCK_API_KEY` | Unfiltered mode. Bearer key for Unblock's API |
| `UNBLOCK_MODEL` | Unfiltered mode. The Unblock deployment id (`dep_...`) |
| `UNBLOCK_BASE_URL` | Optional. Defaults to `https://gounblock.ai/v1` |

After changing functions, redeploy them to Butterbase. `settings` is new and creates its table on first call.

## Run the app

```bash
cd app
npm install
npx expo start --tunnel
```

Open the QR in **Expo Go** (Expo SDK 54). Recording asks for microphone permission; place reminders ask for location.

## Notes before shipping

- ABC Diatype is used here under a trial license. Buy a production license before release.
- App Store: an app with user-requested mature AI content needs an age rating to match and in-app reporting (Guidelines 1.1 and 1.2), and in-app account deletion (5.1.1(v)). Account deletion is not built yet.

## Built with

TypeScript, React Native, Expo, Butterbase, HydraDB, Composio, Claude (Anthropic), Unblock, OpenAI Whisper, AgentCard, PostgreSQL.

---

Aura, by Ahaan Iqbal.
