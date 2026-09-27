# PROJECT TIKVAH — Decision Log

Every significant technical or design decision gets an entry: ID, date, decision, rationale, and who made it. Newest entries go at the bottom. This log is append-only — superseded decisions get a "Superseded by Dn" note, never deleted.

Format per entry:
```
## Dn — <short title>
- **Date:** YYYY-MM-DD
- **Decision:** …
- **Rationale:** …
- **Decided by:** …
- **Status:** Active | Superseded by Dn
```

---

## D1 — Track A stack: Node.js + ws + canvas
- **Date:** 2026-09-26
- **Decision:** Track A (Handshake × OpenAI Multiplayer Game Challenge entry) is built on Node.js with the `ws` WebSocket library and a plain HTML5 canvas client.
- **Rationale:** Zero cost, no build step, runs anywhere — a browser and Node are all it takes. Keeps the challenge entry shippable fast and debuggable by anyone.
- **Decided by:** Ariel (via coordinator), recorded by Docs + QA Planner
- **Status:** Active

## D2 — Pixel art generated procedurally in code (Track A)
- **Date:** 2026-09-26
- **Decision:** Track A art is generated procedurally in code to the standards in GAME-ECOSYSTEM.md §5.
- **Rationale:** Zero cost, coherent style guaranteed by construction, no licensing risk from third-party assets.
- **Decided by:** Ariel (via coordinator), recorded by Docs + QA Planner
- **Status:** Active

## D3 — Track B foundation: Godot 4 + GDScript skeleton
- **Date:** 2026-09-26
- **Decision:** Track B (the full MMO) is scaffolded on Godot 4 with GDScript — a skeleton now, the real engine for the MMO future.
- **Rationale:** A real engine for real scope: scene system, animation, audio, and networking primitives the MMO will need, without reinventing them. Track A stays lean; Track B grows here.
- **Decided by:** Ariel (via coordinator), recorded by Docs + QA Planner
- **Status:** Active

## D4 — Server-authoritative multiplayer
- **Date:** 2026-09-26
- **Decision:** All multiplayer state (positions, interactions, inventory, puzzle state) is authoritative on the server. Clients render and predict; the server decides.
- **Rationale:** Anti-cheat and shared truth — two players must see the same world, especially for the cooperative ruin moment. No client-trusted shortcuts.
- **Decided by:** Ariel (via coordinator), recorded by Docs + QA Planner
- **Status:** Active

## D5 — No public deployment until Ariel approves hosting
- **Date:** 2026-09-26
- **Decision:** Nothing is deployed to a public URL until Ariel explicitly approves the hosting choice.
- **Rationale:** Hosting is her call — cost, account, and domain implications. The game is demo-ready locally first; public launch waits on her word.
- **Decided by:** Ariel (standing rule: no spending/publishing without her approval), recorded by Docs + QA Planner
- **Status:** Active

---

## Future decisions

Append new entries below in the same format (D6, D7, …).

*(none yet)*

## D6 — Room cap is 2 (competition spec)
- **Date:** 2026-09-26
- **Decision:** Server rejects a 3rd joiner with `room-full`. Competition entry is a 2-player co-op game; QA plan A4 expected rejection at 3rd player.
- **Rationale:** Matches the Handshake × OpenAI mission spec ("two players", room-code co-op). Larger rooms are a Track B concern.
- **Decided by:** polish worker, per Ariel's 2-player competition mandate
- **Status:** Superseded by D9 (2026-09-27) — room cap is now 10

---

## D7 — The game has a real ending: "The Garden of Hope"
- **Date:** 2026-09-26
- **Decision:** After the ruin opens, both players stepping into the garden plaza together triggers a shared ending overlay on both screens ("The Garden of Hope — Two travelers. One village. A hope discovered together.") with a Play Again button that resets the room for a fresh run.
- **Rationale:** Ariel: "make sure there's an end" — a judge needs a complete beginning→end arc (arrive → explore → cooperate → discover → ending). Reverent, hopeful, not preachy; no new Scripture introduced.
- **Decided by:** Ariel (explicit request), implemented by polish worker
- **Status:** Active — 13 headless asserts green

---

## D8 — Audio is 100% synthesized in code, zero assets
- **Date:** 2026-09-26
- **Decision:** All sound is generated with WebAudio oscillators (footsteps, chimes, ruin pad, ending motif). No audio files, no licensing. Mute toggle in HUD, preference persisted.
- **Rationale:** Keeps the build dependency-free and license-clean; competition judging rewards polish without asset risk.
- **Decided by:** polish worker, per "no external assets" constraint
- **Status:** Active — manual device listening check still pending

---

## D9 — Room cap raised to 10: mini-MMO milestone M1 (supersedes D6)
- **Date:** 2026-09-27
- **Decision:** `ROOM_CAP = 10` for ALL rooms. Private 4-letter room creation (newCode) and the create/join flow are EXACTLY as before — 4-letter codes, no logins. Ending trigger changed from "every outside player in the garden plaza" to "2 or more outside players in the garden plaza" (ruin-stones simultaneous-occupancy logic already generalizes to N players — untouched). Quick-chat added: 6 preset phrases only ("Hello! 👋", "Follow me!", "Stand on the other stone ✨", "Let's cook together! 🍲", "Thank you! 🙏", "The garden blooms! 🌸") — no free text (no moderation burden); server validates `id` against the preset list, rejects anything else, 2 s per-player cooldown; broadcasts `{t:'quickchat', by, id, text}` with server-side preset text (no injection possible). Client: 💬 button + touch-friendly phrase panel, incoming phrases show as speech bubbles above the sender for ~4 s; off-screen players get an edge arrow + name tag.
- **Rationale:** Ariel's 2026-09-27 directive — build TIKVAH into a mini-MMO by Friday, October 2, 2026: persistent public village, up to 10 players per room, persistent identity via localStorage + server UUID, NO logins, private 4-letter rooms keep working exactly as now. M1 = bigger rooms first; M2 = persistent village; M3 = identity; M4 = polish fold-in. Competition entry remains playable: ending needs only 2 in the garden, so 2-player co-op on a public-style room still completes the arc.
- **Decided by:** Ariel (explicit mini-MMO mandate), implemented by M1 worker
- **Status:** Active — tests assert 10 players join, 11th rejected `room-full`; quickchat valid/invalid/cooldown/injection asserts; ending fires with 3 players where only 2 are in the garden (track-a-test.mjs)

---
