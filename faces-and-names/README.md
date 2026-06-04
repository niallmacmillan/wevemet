# Faces & Names — networking memory app

Learn people's **names, faces and details** with flashcards and quizzes.
Built for networking events, new jobs, parties — anywhere you meet a lot of
people at once and don't want to get caught out.

> _"Is this Jessica, Emma or Georgina?"_ → tap → _"What's Jessica's job
> title?"_ The app drills you on the people you keep getting wrong until the
> names stick.

## What it does

- **Events** — keep a separate attendee list per event (mixer, conference,
  new team, party…). Switch between them from the top bar.
- **Add people** three ways:
  - **One at a time** — name, job title, company, notes and a photo.
  - **Bulk paste** — drop in a list (`Name, Title, Company` per line).
  - **Screenshot import 📸** — upload screenshots of an attendee/guest list and
    the app reads the names off the image (OCR), then lets you review and edit
    before adding.
- **Edit / delete** any attendee at any time; add photos and details later.
- **Quiz yourself**:
  - **Faces → name** ("Who is this?") with 4 name options.
  - **Name → details** ("What is Jessica's job title / company?") with 4 options.
  - **Mixed** mode combines them.
  - Questions are **weighted toward the people you get wrong**, and there's a
    one-tap **"Practise weak spots"** drill.
- **Scores & progress** — per-person mastery, who to work on next, quiz history
  and average score.
- **Private & offline** — all data (including photos) is stored locally on your
  device. Nothing is uploaded. Export/import a backup file to move devices.
- **Installable** — it's a PWA, so you can "Add to Home Screen" on a phone and
  run it like a native app.

## Run it

No build step or server is required for development — but because it uses ES
modules and a service worker, it should be opened over `http://`, not as a
`file://` path. Any static server works:

```bash
cd faces-and-names
python3 -m http.server 8000
# then open http://localhost:8000
```

To "install" on a phone, open that URL in the mobile browser and choose
**Add to Home Screen**.

## How the screenshot import works

The first time you import a screenshot, the app downloads a small
text-recognition engine ([Tesseract.js](https://tesseract.js.org/)) from a CDN.
If you're offline or the download is blocked, the app falls back to showing the
screenshot next to a box where you can type the names in manually — so the
feature degrades gracefully and never blocks you.

## Project structure

| File | Purpose |
|------|---------|
| `index.html` | App shell, tab bar, modal/toast hosts |
| `styles.css` | All styling (dark, mobile-first) |
| `app.js` | Views, quiz engine, routing, person editor |
| `store.js` | All persistence (localStorage), mastery scoring |
| `ocr.js` | Lazy Tesseract.js wrapper for screenshot OCR |
| `sw.js` | Service worker — offline caching |
| `manifest.webmanifest` | PWA metadata for install |
| `icons/` | App icons |

## Roadmap ideas

The current version is a complete, working MVP. Natural next steps toward a
sellable product:

- **Cloud sync & accounts** so lists follow you across devices.
- **Auto face-cropping** when importing a group photo.
- **Smarter screenshot parsing** — match a name to the row's title/company,
  not just the name.
- **Spaced repetition scheduling** (e.g. SM-2) for long-term retention.
- **Shared lists** — an event organiser publishes an attendee deck others can
  study.
- **Themability / white-label** for the networking, dating, party and
  onboarding use-cases.
