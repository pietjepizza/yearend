# Peak Season Pulse: Finance Operations year-end game show

A live, **fully anonymous** poll for the year-end all-hands, styled as a game show in ASML blues. People scan a QR code, become a secret player (for example "Captain VLOOKUP"), and vote. Their answers race across the big screen. The show ends on a motivating "YES WE CAN!".

## The show

| # | Screen | What happens |
| --- | --- | --- |
| 0 | **Lobby** | Bouncy title, how-to-play steps, a big QR code. Players pop in with their secret names. |
| 1–3 | **Questions** | A 25-second countdown, then "TIME'S UP!", a confetti reveal and an upbeat headline. Each answer is a glowing light racing along its own lane, and the winner gets a gold ring and a callout. Words float in as bubbles. |
| 5 | **Recap** | "Thank you for your honesty!" Each question's result is shown with a **We'll do** pledge. |
| 6 | **The road ahead** | A clean timeline: thin bars on a December to March axis for the year-end close, SOX controls, the annual report and the ERP migration (DR2, ramp-down, the gold cutover, ramp-up and hypercare). Three quiet markers show today, the Christmas break and the cutover. Underneath, one **team workload** line, worked out from how the workstreams overlap, marks the peak. On entry the bars grow in from left to right and the workload line draws along, in about three seconds. Press **H** to skip the animation. |
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

## Online, with live voting (GitHub Pages + Supabase)

`docs/` is the website for GitHub Pages: https://pietjepizza.github.io/yearend/
- `index.html`: the landing page
- `presenter.html`: **live**. The deck for the projector. To control it, open `presenter.html?key=<presenter key>`. Without the key the page is a view-only mirror.
- `phone.html`: **live**. The QR code points here, and attendees vote from anywhere.
- `simulator.html`: a stand-alone simulator that runs in the browser only

Live voting uses a small Supabase database: the tables `pulse_state`, `pulse_votes` and `pulse_secrets`, and the functions `pulse_vote` and `pulse_set_state`, set up by `supabase/pulse_live_voting.sql`.
- **Reading:** everyone can read the current screen and the anonymous answers.
- **Writing:** phones can only submit answers through `pulse_vote`, which validates the input. Only someone with the presenter key can change the screen.
- **Reset:** the Reset button starts a new run and deletes the answers from earlier runs.
- **The key** is stored only as a SHA-256 hash. Never commit the key or its hash.
- **Connection fallback:** if a network blocks WebSockets, the pages fall back to checking every couple of seconds. Reactions and the "connected" counter need the live connection.

To rebuild the site: `npm run build:pages`. You can override `PAGES_URL`, `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Add `&sim=1` to the presenter URL to show the room simulator, but don't use it during the real event, because simulated answers would mix with real ones.

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
| H | Reveal now, or hide again. On the timeline: skip the animation |
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

- **`countdown`**: the chip at the top right, counting the days to `date` (now the year-end close on Monday 4 January 2027) with its `label`. `after` is the text once the date has passed.
- **`timer`**: seconds per question. A question can set its own `timer`, and 0 turns the countdown off.
- **`lobby`**: the title and intro.
- **`recap`**: the thank-you title and subtitle.
- **`roadmap`**: the timeline. **The dates are indicative and to be confirmed.**
  - `start` and `end`: the date range shown, such as `2026-12-01` to `2027-03-15`. `today` is optional; without it, today's real date is marked.
  - `holiday`: the Christmas break band, with `label`, `start`, `end`, `callout` (the label at the dip) and `factor` (how much it damps the workload)
  - `rows`: one row per workstream, each with a `label`, a `note` and `items`. An item is either
    - a bar: `type: "bar"`, `label`, `start`, `end`, plus `fade: true` to let it trail off (hypercare), or
    - a milestone: `type: "milestone"`, `label`, `date` and `note`. With `key: true` it becomes the gold cutover line with a callout at the top, which can use `when` for its date text.
  - `weight` on any item: how much it adds to the workload (default 1). The workload chart adds up whatever is active each day, on top of `baseLoad` (default 0.6), smooths it, and scales the busiest day to "Peak".
  - `workloadLabel`, `peakLabel` and `source`: the workload label, the peak label and the footnote
  - `style`: `gantt` (the default), `peak` (the mountain range) or `road` (the winding road). The other two styles use `steps` instead of `rows`, with `type`, `when`, `label`, `note`, `load` (0 to 100), `month`, `group` and `say`.
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
