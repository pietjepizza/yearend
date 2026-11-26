# Peak Season Pulse: Finance Operations year-end game show

A live, **fully anonymous** poll for the year-end all-hands, styled as a game show in ASML blues. People scan a QR code, become a secret player (for example "Captain VLOOKUP"), and vote. Their answers race across the big screen. The show ends on a motivating "YES WE CAN!".

## The show

| # | Screen | What happens |
| --- | --- | --- |
| 0 | **Lobby** | Bouncy title, how-to-play steps, a big QR code. Players pop in with their secret names. |
| 1–3 | **Questions** | A 25-second countdown, then "TIME'S UP!", a confetti reveal and an upbeat headline. Each answer is a glowing light racing along its own lane, and the winner gets a gold ring and a callout. Words float in as bubbles. |
| 5 | **Recap** | "Thank you for your honesty!" Each question's result is shown with a **We'll do** pledge. |
| 6 | **The road ahead** | A straight, animated roadmap. A light pulse travels from today through the year-end close, the holiday break and the annual report to the ERP migration (a gold key milestone), ending with "Peak conquered!". |
| 7 | **Finale** | Rally lines slam in, then a giant "YES WE CAN!" with fireworks and a wave of light, one dot per player. Phones turn into a big **CHEER!** button. |

The questions:
1. **If the ERP migration were a movie…** The icebreaker: Mission: Impossible, Ocean's Eleven and more.
2. **How charged are you for peak season?** The energy check, with a team-energy meter.
3. **What's the weather forecast for January?** A light-hearted outlook, with a team-forecast meter.

Questions that were dropped are kept under `spareQuestions` in `questions.json`. To bring one back, move it into `questions`.

Between the live words, the bottom ticker shows light-hearted finance lines such as "Reconciling the audience… 98% matched". They come from the `ticker` list in `questions.json`.

The headlines stay encouraging whatever the outcome.

## Test link

The test copy is published as a private claude.ai page.
- The page is the presenter screen. Move the mouse to show the controls, then press **▶ Simulate the room** to play through with about 40 simulated players.
- Phones scan the QR code (the link ends in `#join`). Cross-device play works when signed in to claude.ai.

To rebuild it: `ARTIFACT_URL=<link> npm run build:artifact` writes `dist/mood-pulse.html`.

## Simulator (test everything on one page)

`dist/simulator.html` shows the presenter screen with two to four live phones beside it, plus a control panel:
- jump to any screen
- go back and forward, reveal, or reset
- choose the countdown (off, 10 or 25 seconds)
- run a simulated room with a size and speed you pick
- fire bursts of reactions

Everything runs in the browser, with no login or devices needed. To rebuild it: `ARTIFACT_URL=<test link> npm run build:sim`.

## Online demo (GitHub Pages)

`docs/` is a static website for GitHub Pages: https://pietjepizza.github.io/yearend/
- `index.html`: the landing page
- `simulator.html`: the simulator, fully working in the browser
- `presenter.html`: the deck full-screen, in demo mode, with the room simulator
- `phone.html`: the phone view, which syncs with `presenter.html` in the same browser only

To rebuild it: `npm run build:pages` (set `PAGES_URL` if the address differs). GitHub Pages only serves files, so live voting from other devices on the day needs the Node server below, or a realtime backend.

## Run it for the real event

```bash
npm install
HOST_KEY=letmein npm start
```

Open the presenter link `/host?key=letmein` on the projector. Phones need to reach the server:
- **Quick option:** a tunnel, with `PUBLIC_URL=https://<tunnel>`.
- **Sturdier option:** a Node host such as Render, Railway or Fly.io.

| Key | Action |
| --- | --- |
| → / Space | Next screen (phones follow) |
| ← | Previous screen |
| H | Reveal now, or hide again |
| S | Snow on or off |
| Click a word | Remove it from the screen |
| U | Restore removed words |
| C, then C again | Clear the current question |
| Reset button, clicked twice | Start over |

| Env var | Default | Purpose |
| --- | --- | --- |
| `PORT` | 3000 | Port to listen on |
| `PUBLIC_URL` | `http://<lan-ip>:PORT` | Address in the QR code |
| `HOST_KEY` | random (printed at startup) | Required to control the screen |
| `DATA_FILE` | `./data.json` | Saved answers |

## The full all-hands deck

The whole meeting runs from this app. `show` in `questions.json` is the running order: every slide, poll and special screen, in sequence. The phones follow along. On ordinary slides they show "Look up!" and people can still send reactions.

| `type` | What it shows | Main fields |
| --- | --- | --- |
| `title` | Opening slide | `kicker`, `title`, `subtitle`, `meta` |
| `lobby` | QR code and players joining | – |
| `agenda` | Running order (`live: true` marks the live polls) | `title`, `items[{time, title, who, live}]` |
| `section` | Big numbered divider | `number`, `title`, `subtitle` |
| `bullets` | Icon cards that build in one by one | `title`, `subtitle`, `points[{icon, title, text}]` |
| `stats` | Figures that count up | `title`, `subtitle`, `stats[{value, label, note}]` |
| `shoutouts` | Thank-you cards | `title`, `subtitle`, `people[{name, team, reason}]` |
| `quote` | A big quote | `quote`, `by` |
| `qa` | Questions slide | `title`, `subtitle` |
| `question` | A live poll, by its `id` | `question` |
| `recap`, `roadmap`, `finale` | The special screens | – |

Every step can have a short `nav` label, which shows in the presenter controls and on the simulator buttons. Text in `[brackets]` is highlighted on screen as a placeholder until you replace it, and "XX" marks figures still to fill in.

## Edit the content

Everything is in `questions.json`:

- **`timer`**: seconds per question. A question can set its own `timer`, and 0 turns the countdown off.
- **`lobby`**: the title and intro.
- **`recap`**: the thank-you title and subtitle.
- **`roadmap.steps`**: the timeline. Each step has a `type` (`start`, `level`, `rest`, `boss` for the gold key milestone, or `finish`), `when`, `label` and `note`. **The dates are placeholders marked "date TBD".**
- **`finale`**: the rally `lines`, the big `title` and the `thanks`.
- **Each question** has:
  - `title`, `context` and `wordPrompt`
  - `takeaways`: the upbeat headline, picked by outcome
  - `pledge`: the "We'll do" line on the recap
  - `options`: each has `label`, `icon`, an optional `score` from 1 to 5, and a speech-bubble `note`
  - `demo`: data for the simulator

Colours and fonts are set at the top of `public/style.css`.

## Privacy

No names and no login. Phones get a random token so people can change their answer. Player names are built from fixed word lists, so nobody can put their own text on screen as a name. Words typed as answers can be removed by clicking them.
