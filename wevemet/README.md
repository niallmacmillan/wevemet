# WeveMet — remember everyone you meet

Never have the awkward *"…have we met?"* moment again. **WeveMet** helps you
learn people's **names, faces and details** with flashcards and quizzes —
built for networking events, new jobs, parties, conferences, anywhere you meet
a lot of people at once.

> _"Is this Jessica, Emma or Georgina?"_ → tap → _"What's Jessica's job
> title?"_ WeveMet drills you on the people you keep getting wrong until the
> names stick.

## What it does

- **Events** — keep a separate attendee list per event. Switch between them
  from the top bar.
- **Add people** three ways:
  - **One at a time** — name, job title, company, notes and a face photo.
  - **Bulk paste** — drop in a list (`Name, Title, Company` per line).
  - **Screenshot import 📸** — upload screenshots of an attendee/guest list and
    the app reads the names off the image (OCR), then lets you review and edit.
- **Rich profiles** for each attendee:
  - **Photos & videos** gallery (stored on-device in IndexedDB).
  - **Notes** — how you met, a memory hook, anything.
  - **Social links** — LinkedIn, X/Twitter, Instagram, Facebook, TikTok, website.
  - **🕵️ Research** — one-tap public searches (Google, LinkedIn, News), plus an
    optional **AI "Find info"** button (see below).
- **Edit / delete** any attendee at any time.
- **Quiz yourself**:
  - **Faces → name** ("Who is this?") with 4 name options.
  - **Name → details** ("What is Jessica's job title / company?") with 4 options.
  - **Mixed** mode, and a one-tap **"Practise weak spots"** drill that focuses on
    the people you keep getting wrong.
- **Scores & progress** — per-person mastery, who to work on, quiz history.
- **Private & offline** — all data (people, photos, videos, scores) is stored
  locally on your device. Nothing is uploaded. Export/import a backup of your
  people & scores.
- **Installable** — it's a PWA, so "Add to Home Screen" runs it like a native app.

## The AI "Find info" button

Each person has a **🕵️ Research** panel:

- **Search links** always work with no setup — they just open Google / LinkedIn /
  News searches for that person. No data leaves your device until you tap one.
- **✨ Find info with AI** is **opt-in**. Paste your own
  [Anthropic API key](https://console.anthropic.com/settings/keys) in
  **Stats → Settings**, and the button asks the model for a short summary of
  **publicly known professional information**. It only fills anything in when the
  model is **confident it's the right real person** — otherwise it shows nothing
  ("don't show unless certain"). Your API key is stored only on your device and
  is never included in backups.

A few honest notes:

- A static web app can't crawl the live web (browsers block it), so "AI" here
  means the model's own knowledge, not a real-time scrape. Treat results as a
  helpful starting point that can be wrong — always verify.
- Please use it only for **public, professional context** about people you've
  actually met, in line with privacy laws and good manners.

## Run it locally

No build step. Because it uses ES modules + a service worker, open it over
`http://`, not a `file://` path:

```bash
cd wevemet
python3 -m http.server 8000
# then open http://localhost:8000
```

To install on a phone, open the URL in the mobile browser → **Add to Home Screen**.

## Project structure

| File | Purpose |
|------|---------|
| `index.html` | App shell, tab bar, modal/toast hosts |
| `styles.css` | All styling (dark, mobile-first) |
| `app.js` | Views, quiz engine, routing, person editor |
| `store.js` | People/scores persistence (localStorage) + settings |
| `media.js` | IndexedDB blob store for photos & videos |
| `ocr.js` | Lazy Tesseract.js wrapper for screenshot OCR |
| `enrich.js` | Research links + optional AI lookup |
| `sw.js` | Service worker — offline caching |
| `manifest.webmanifest` | PWA metadata for install |
| `icons/` | App icons |

## Roadmap ideas

A complete, working MVP. Natural next steps toward a sellable product:

- **Cloud sync & accounts** so lists (and media) follow you across devices.
- **Auto face-cropping** when importing a group photo.
- **Smarter screenshot parsing** — tie a name to its row's title/company.
- **Spaced-repetition scheduling** (e.g. SM-2) for long-term retention.
- **Real web lookup** for AI research via a small backend (with consent + sources).
- **Shared lists** — an organiser publishes an attendee deck others can study.
