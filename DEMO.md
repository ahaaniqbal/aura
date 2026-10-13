# Aura demo

**One line:** Aura is a personal AI for your work and your life. It remembers you, has a personality you pick, does things in your real apps with your OK, and for adults who opt in, it answers without the lectures.

## The 90-second demo (on the iPhone)

1. **First run.** Pick a personality (try Witty), then answer "What's on your plate?" with a few lines about work and life. Aura shows back what it picked up. *"It knows you after one message."*
2. **Aura tab.** Ask *"anything i'm forgetting today?"* It answers across work and life from memory, in the voice you picked.
3. **Demo: "Urgent email arrives".** Long-press the vermilion dot at the top of the chat to open the demo triggers (in development builds there's also a Demo button). An **Urgent** card shows the full reply Aura drafted. Edit it if you like, then **Send reply**. It waits five seconds behind Undo, then sends through Gmail.
4. **Demo: "Walk past a bakery".** Aura suggests picking up the cake a friend would love, with a **From memory** line showing why. Approve and it's ordered on the Aura card.
5. **Memory tab.** Everything Aura knows about you, your people and your reminders. Forget one fact (with Undo). *"Memory you can see and control."*
6. **You tab.** Switch personality to Blunt and ask the same question again. Then, once Unblock is connected, show **Unfiltered**: the 18+ confirmation, and the chat header now reads "Blunt · Unfiltered".

> Everything is one engine: `capture → remember → recall → decide → propose → approve → execute → learn`. The demo flows are config on it.

## Architecture

- **Expo (React Native)** app: Aura, Today, Memory and You tabs in ABC Diatype, local notifications, live via polling.
- **Butterbase** backend: Postgres (memories, cards, actions, settings), serverless functions (`agent`, `settings`, `feed`, `simulate`, `approve`), Claude via the AI gateway. App id `app_6nromeez40uq`.
- **HydraDB**: memory of record (per user via tenant and sub-tenant). The Postgres mirror is the fallback.
- **Composio** for Gmail, Calendar, Notion and Slack. **AgentCard** (test mode) for paying, with your OK.
- **Unblock** for Unfiltered mode. Needs `UNBLOCK_API_KEY` and `UNBLOCK_MODEL` on the server; until then the toggle shows "Not connected". See the README for what's wired.
