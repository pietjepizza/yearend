# Mood Pulse: Finance Operations year-end check-in

A live pulse survey for the year-end all-hands. Attendees scan a QR code, pick an answer (and can add one word), and the presenter screen updates live in a consulting-deck style:

- **A headline that states the result**, such as "73% of the team feels positive or energised"
- **An exhibit** showing the distribution of answers, plus KPI tiles for responses, pulse index and positive share
- **A live ticker** of the words people submit
- **An executive summary** slide after the last question

## Try it locally (5 minutes)

```bash
npm install
HOST_KEY=letmein npm start
```

The console prints two links:

- **Participants:** `http://<your-laptop-ip>:3000`. The QR code points here.
- **Presenter screen:** `http://<your-laptop-ip>:3000/host?key=letmein`. Open this on the projector.

Phones must be on the **same Wi-Fi** as your laptop. To test on your own, open the participant link in a few browser tabs or on your phone.

### Presenter controls (keyboard, on the host screen)

| Key | Action |
| --- | --- |
| → / Space | Next question (every phone switches automatically). After the last question, this shows the executive summary |
| ← | Previous question |
| H | Hide or reveal the results, for a drum-roll moment |
| C | Clear the answers to the current question |

## Make it your own

Edit `questions.json` and restart the server. Each question has:

- `title`: the question text
- `wordPrompt`: the label for the optional one-word answer
- `takeaway`: the headline shown on screen. It can use these placeholders:
  - `{topBox}`: the % of answers with a score of 4 or more
  - `{avg}`: the average score
  - `{top}` and `{topPct}`: the most-picked answer and its share
  - `{n}`: the number of responses
- `options`: each has an `id`, a `label`, an `icon` and an optional `score` from 1 to 5. Scored questions also show the pulse index and the positive share.
  - Icons: `signal:1` to `signal:5`; `chart:rocket`, `chart:bull`, `chart:volatile`, `chart:recovery` or `chart:sideways`; `battery:0` to `battery:100`

The colours are set as variables at the top of `public/style.css`. They are a provisional, ASML-inspired palette, so replace them with the official brand values.

## Using it on the day

Office Wi-Fi often blocks phones from talking to each other, and people may join on 4G or 5G, so host the app on a public URL:

- **Quick:** run it locally and expose it with a tunnel (for example `cloudflared tunnel --url http://localhost:3000`). Then start with `PUBLIC_URL=https://<tunnel-url> npm start` so the QR code uses that address.
- **Sturdier:** deploy to any Node host (Render, Railway, Fly.io). Set the `PUBLIC_URL` and `HOST_KEY` environment variables there.

| Env var | Default | Purpose |
| --- | --- | --- |
| `PORT` | 3000 | Port to listen on |
| `PUBLIC_URL` | `http://<lan-ip>:PORT` | Address encoded in the QR code |
| `HOST_KEY` | random (printed at startup) | Required to control the presenter screen |
| `DATA_FILE` | `./data.json` | Where answers are saved, so a restart keeps them |

Names are optional, stored only in `data.json`, and never shown on screen.
