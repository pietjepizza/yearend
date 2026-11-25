# Mood Pulse: Finance Operations peak-season check-in

A live, **fully anonymous** pulse survey for the year-end all-hands, before the busiest stretch of the year: the year-end close of a record sales year, the annual report and the ERP migration. Attendees scan a QR code, tap an answer and can add one word. The big screen updates live in a consulting-deck style.

## The flow

| Screen | What the room sees |
| --- | --- |
| **Welcome** | A lobby with the QR code and a live "connected" counter. An animated roadmap (Exhibit 0) shows the year-end close, the annual report, the ERP migration, the holiday break and a workload curve that peaks in Jan–Feb. |
| **Q1: How are you feeling right now?** | Signal-strength scale with a pulse index and positive share |
| **Q2: If 2026 were a share price…** | Sparkline answers, from "Exponential growth" to "Trading sideways" |
| **Q3: Battery level going into peak season?** | Battery scale. People can say they're running on reserve, and that gets acknowledged. |
| **Q4: What would help you most through the peak?** | Clear priorities, focus time, backup, celebrating wins, a real break. Gives leadership something to act on. |
| **Summary** | "We hear you": the takeaway from every question, the top words, participation numbers and a holiday sign-off |

**Headlines stay constructive whatever the result.** Each question lists several `takeaways`, and the first one whose threshold is met is shown. For example:
- If 60% or more feel positive: "60% feel positive or energised: strong energy for the peak"
- If fewer do: "A mixed picture, honestly shared. Thank you for that"
- If few do: "It's been a demanding year, and we hear you"

## Animation and the December mood

**Throughout:**
- A live heartbeat line in the top bar that spikes with every vote and reaction
- Gentle snowfall (press **S** to toggle)
- A "days to the holiday break" chip
- Slide-style transitions and titles that reveal word by word

**Question screens:**
- Bars that grow in a staggered sequence and icons that animate:
  - signal bars ripple
  - batteries charge, with a lightning bolt on the leading answer
  - share-price sparklines draw themselves
- A red-pen circle and a handwritten note on the leading answer
- A live word cloud and a stock-style ticker of the words people submit
- Count-up numbers, a "+1" on each vote, and confetti at 10, 25, 50 and 100+ responses
- Emoji reactions from phones that float up the screen

**Summary:** confetti, and heavier snowfall.

## Test link (no setup)

A ready-to-try copy is published as a claude.ai page. It is private to you until you share it.

- **The page itself** is the presenter screen. Move the mouse to show the controls, then press **▶ Simulate the room** to fill it with about 40 simulated colleagues.
- **On your phone:** scan the QR code (or open the same link ending in `#join`). Live voting across devices works when you are signed in to claude.ai on both.

To rebuild it after changing questions or styling: `ARTIFACT_URL=<link> npm run build:artifact`, which writes `dist/mood-pulse.html`.

## Run it for the real event

```bash
npm install
HOST_KEY=letmein npm start
```

The console prints the participant link (the QR code points there) and the presenter link `/host?key=letmein`. Phones must be able to reach the server:
- **Quick option:** use a tunnel, and start with `PUBLIC_URL=https://<tunnel-url>`.
- **Sturdier option:** deploy to any Node host (Render, Railway, Fly.io) with `PUBLIC_URL` and `HOST_KEY` set.

### Presenter controls

The controls appear on mouse move. The keyboard works too:

| Key | Action |
| --- | --- |
| → / Space | Next screen (every phone follows) |
| ← | Previous screen |
| H | Hide or reveal results (stamps "Results under embargo…") |
| S | Snow on or off |
| Click a word | Remove it from the word cloud and ticker |
| U | Restore removed words |
| C, then C again | Clear the answers to the current question |
| Reset button, clicked twice | Start over |

| Env var | Default | Purpose |
| --- | --- | --- |
| `PORT` | 3000 | Port to listen on |
| `PUBLIC_URL` | `http://<lan-ip>:PORT` | Address encoded in the QR code |
| `HOST_KEY` | random (printed at startup) | Required to control the presenter screen |
| `DATA_FILE` | `./data.json` | Where answers are saved, so a restart keeps them |

## Make it your own

Everything is in `questions.json`:

- **`holidayDate`**: drives the countdown chip.
- **`lobby`**: the welcome text and the roadmap. The dates are placeholders, so adjust each item's `start`, `end` and `note`, and the `holiday` block.
- **`summary`**: the closing title and sign-off.
- **`reactions`**: the emoji buttons shown on phones.
- **Each question** has:
  - `title` and `context`
  - `wordPrompt`: the label for the optional one-word answer
  - `takeaways`: an ordered list of `{ minTopBox, minAvg, text }`. Placeholders are `{topBox}`, `{avg}`, `{top}`, `{topPct}` and `{n}`.
  - `options`: each has `id`, `label`, `icon`, an optional `score` from 1 to 5, and an optional red-pen `note`
  - `demo`: weights and words for the simulator
- **Icons**:
  - `signal:1` to `signal:5`
  - `chart:rocket`, `chart:bull`, `chart:volatile`, `chart:recovery` or `chart:sideways`
  - `battery:0` to `battery:100`
  - `help:target`, `help:focus`, `help:team`, `help:trophy` or `help:snow`

The colours are variables at the top of `public/style.css`. They are a provisional, ASML-inspired palette, so replace them with the official brand values.

## How it's built

| File | Role |
| --- | --- |
| `public/core.js` | Survey logic, shared by the server and the test page |
| `public/host.js`, `public/join.js` | The presenter screen and the phone view |
| `public/fx.js`, `public/icons.js` | Motion, effects and icons |
| `server.js` + `public/transport-server.js` | The real-event server (Server-Sent Events) |
| `artifact/` + `scripts/build-artifact.js` | The claude.ai test page (shared data store plus a live room) |

## Privacy

No names or logins. Each phone gets a random token so people can change their answer, but the token is not linked to who they are.
