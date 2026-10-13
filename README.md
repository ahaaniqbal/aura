# Aura

**A personal AI that actually knows you.**

Aura is one AI for your work and your life. You talk to it like a person, by text or voice. It remembers what you tell it and learns your tastes as you go, searches the web, finds restaurants and flights and books them with your OK, plans trips, keeps an eye on your inbox, calendar and spending, runs routines on its own, records meetings, and works with any app or agent you connect over MCP. It has a personality you pick, colors you choose, and an optional Unfiltered mode for adults.

Built by **Ahaan Iqbal**.

## What it can do

| | How |
| --- | --- |
| Remember you and keep learning | Every chat feeds a typed memory graph (ported from Kaeva, see below): tastes, dislikes, work, home, goals, habits, places, people. Newer facts supersede older ones. Memory tab shows it all, grouped, and you can forget any of it. |
| Search the internet | `web` function: Exa, Tavily or Brave when a key is set, DuckDuckGo with none. Reads pages too. Answers come with sources. |
| Restaurants and places near you | `places` function: Google Places, biased to your current location. Results show rating, price, open now, call, map, website. |
| Book a table | Aura proposes the reservation as a card. Approve and it opens the restaurant's booking page (OpenTable or its site) and puts the dinner on your calendar. There is no universal restaurant booking API, so the last tap is yours. |
| Find and book flights | `travel` function on Duffel: real offers with times, stops and prices. Booking runs only from an approved card, with the traveler details you gave Aura. |
| Plan trips | Aura saves day-by-day trip plans you can open from Today. |
| Manage email | Search, read, archive, and draft replies that send through Gmail after you approve. |
| Manage your calendar | Read, find free time, add events. Invites to other people are a card first. |
| Money | Log spending by telling Aura, find receipts in Gmail, monthly budgets per category, recurring charges spotted automatically. |
| Routines | Start of day, Before each meeting (with other people), Inbox triage, End of day, Sunday money, or your own ("every Friday at 5, summarize my week"). |
| Record meetings in person | Record, transcribe, and get notes: summary, decisions, action items. Your action items become tasks; the transcript goes into memory. |
| Connect any MCP server | Paste a server address in You. Aura lists its tools, runs read-only ones directly, and asks before anything that changes something. |
| Work with other agents (A2A) | Pair an agent with a one-time code. It can message you, ask to read your memory, or ask Aura to act; you approve each in Aura. |
| Knows where you are | Location and timezone feed every answer and place reminders ("remind me when I'm at Trader Joe's"). |
| Personality and colors | Witty, Warm, Blunt or Chill, and the palette Aura glows in. |
| Unfiltered | For adults who opt in, conversations run on Unblock's open-weight models. |

Anything that leaves your world (sending, booking, paying, inviting, writing to another app) is never done silently: it becomes a card you approve, with five seconds to undo.

## The app

Four tabs, ABC Diatype, near-white canvas, one vermilion accent, and gradient auras instead of initials.

- **Aura.** The conversation. Results arrive as UI you can act on: places with Book a table, flights with prices, sources, trip plans, spending, meeting notes. Messages from paired agents show who sent them, with Reply.
- **Today.** One sentence on your day, then what's waiting for your OK, what Aura runs on its own, what's on your plate, trips and money, and the people who could use you.
- **Memory.** What Aura learned about you (Likes, Doesn't like, Work, Life, Places), your notes, your people and your reminders. Teach it directly; forget anything.
- **You.** Aura's colors, personality, Unfiltered, your instructions, connected apps, MCP servers, paired agents, plan, sign out, delete account and data.

**Auras instead of initials.** Everyone gets an aura: a soft, grainy gradient from a curated palette, picked from their name so the same person always looks the same, with no faces and nothing guessed about who they are. Aura itself is the vermilion dot inside its own glow, which breathes while it works; you pick the palette it glows in (Ember, Clay, Bloom, Sun, Moss, Sea, Tide, Plum, Dune). Drawn as SVG in `app/lib/auras.ts`, with a grain texture laid over the top.

## Built on Kaeva and Unblock

Viraj's Kaeva work (`Kaeva-labs/kaeva-service`, design records in `kaeva-record`) and Unblock (`Kaeva-labs/unblock-10-5`) are libraries and specs, not hosted APIs, so the pieces are ported into Aura's own functions:

- **Memory module** (`memory.ts`, from `packages/memory`): immutable source chunks; a typed graph of nodes and edges from a closed vocabulary (Kaeva's personal-life subset plus KNOWS, LIVES_IN, BORN_ON, VISITED, PLANS_TO_VISIT and PURSUES for life); evidence quotes on edges; contested keys so a newer fact supersedes an older one; contradictions recorded; Kaeva's `values_agree` for merging "Priya" with "Priya Shah"; lexical recall with `tsvector('simple')` and `ts_rank`, weighted by recency. Extraction uses Kaeva's prompt, on DeepInfra when `DEEPINFRA_API_KEY` is set, otherwise the gateway model.
- **Context layer** (`agent.ts`): each turn carries time and timezone, location, meeting state, connected MCP apps, what Aura knows about you, memory relevant to this message, and older conversation picked by Kaeva's reader ranker (`0.5^(age_hours/6) x role weight x density`). Following Kaeva's rule, recalled text is passed as quoted data, never as instructions.
- **A2A** (`a2a.ts`, from `packages/a2a`): Kaeva's A2A over MCP, as one stateless function. One-time pairing codes, verbs `recall`, `remember`, `send`, `watch`, `consent`, `act`, Kaeva's tap gate (reads need a timed consent, actions always need your tap), and receipts in a hash chain. Outgoing, Aura reaches other agents as MCP servers.
- **Privacy check** (`mcp.ts`, from Kaeva `tap.mjs`): before a tool call leaves Aura, 5-word fingerprints of the arguments are compared with your private memory; a match holds the call for your approval.
- **Unblock**: Unfiltered conversations go to `gounblock.ai/v1/chat/completions`. The unfiltered instructions are sent only to Unblock; if it fails or its deployment has expired, the turn finishes on the standard model without them. Unblock's hard floor (sexual content involving minors, violent exploitation) is enforced in Aura before any model call, on every model.

## Architecture

```
Aura app (Expo, iPhone)
   |  REST, polling, local notifications
   v
Butterbase  ──  serverless functions + Postgres + AI gateway (Claude)
   ├── agent .......... the loop: context, ~35 tools, approval cards, rich results
   ├── memory ......... Kaeva memory graph          ├── web ....... search and read
   ├── places ......... Google Places               ├── travel .... Duffel flights, trips
   ├── money .......... expenses, budgets, receipts ├── routines .. + routine_tick cron
   ├── mcp ............ MCP client + privacy check  ├── a2a ....... Kaeva A2A over MCP
   ├── approve ........ runs approved cards         ├── settings .. personality, look, unfiltered, delete
   ├── Composio ....... Gmail, Calendar, Drive, Slack, Notion, Linear, GitHub and more
   ├── HydraDB ........ optional semantic memory alongside the graph
   ├── Unblock ........ open-weight models for Unfiltered
   └── OpenAI Whisper . transcription
```

## Repository

- `app/` is the Expo (React Native, TypeScript) app.
  - `screens/`: `AuraScreen`, `TodayScreen`, `MemoryScreen`, `YouScreen`, `AuthScreen`.
  - `components/`: `ui.tsx` primitives, `Results.tsx` (places, flights, sources, trip, money, notes), `Personalize.tsx` (Aura's colors), `Avatar.tsx` and `Mark.tsx` (auras), sheets, onboarding, recorder.
  - `lib/`: `api.ts`, `auras.ts` (palettes and gradient art), personalities, dates, toast.
- `backend/functions/` holds the Butterbase functions listed above, plus `capture` (recordings and quick notes), `feed`, `remember`, `graph`, `brief`, `note`, `sync_email`, `auto_tick`, `nudge_cron`, `pulse`, `connect`, `connections`, `set_location`, `set_timezone`, `register_device`, `transcribe`, `simulate`, `reset`.

## Environment

Secrets live only in Butterbase's server-side environment.

| Variable | Needed for |
| --- | --- |
| `AURA_INTERNAL_KEY` | **Required.** Any long random string. Lets crons and approvals act as a user (routines, booking, MCP calls, A2A). |
| `AURA_MODEL` | Optional. Gateway model for the agent. Defaults to `anthropic/claude-sonnet-4.6`, falling back to `anthropic/claude-haiku-4.5`. |
| `EXA_API_KEY` or `TAVILY_API_KEY` or `BRAVE_API_KEY` | Better web search. Without one, DuckDuckGo's HTML results are used. |
| `GOOGLE_PLACES_API_KEY` | Places and restaurants. Without it, place search falls back to web search. |
| `DUFFEL_API_KEY` | Flight search and booking. A test key books Duffel Airways with a test balance; a live key books real tickets. Without it, Aura shares a Google Flights link. |
| `DEEPINFRA_API_KEY`, `DEEPINFRA_MODEL` | Optional. Memory extraction on DeepInfra, as Kaeva does. Otherwise `AURA_EXTRACT_MODEL` or Haiku on the gateway. |
| `UNBLOCK_API_KEY`, `UNBLOCK_MODEL`, `UNBLOCK_BASE_URL` | Unfiltered mode. The key starts with `ub_`; the model is a `dep_` deployment id; the base URL defaults to `https://gounblock.ai/v1`. |
| HydraDB, OpenAI, AgentCard, Neo4j keys | As before. |

**Deploy:** redeploy every function. Add a cron trigger for `routine_tick` every 5 minutes (`*/5 * * * *`), next to `auto_tick` and `nudge_cron`. New tables create themselves on first call.

## Run the app

```bash
cd app
npm install
npx expo start --tunnel
```

Open the QR in **Expo Go** (Expo SDK 54).

## Known limits

- Restaurant reservations end on the restaurant's own booking page; there is no universal booking API to complete them silently.
- Bank connections (Plaid) aren't built; money comes from what you tell Aura, Gmail receipts and the Aura card.
- Account deletion erases all of Aura's data for the user; removing the sign-in itself needs Butterbase's admin API.
- Unblock deployments expire after 30 to 60 minutes, and its README says live inference hasn't passed end to end yet. Aura falls back to the standard model when it's unavailable.
- ABC Diatype is used under a trial license. App Store review needs an age rating that matches Unfiltered, a way to report content (Guidelines 1.1 and 1.2), and the in-app deletion that's now here (5.1.1(v)).

---

Aura, by Ahaan Iqbal.
