# WeveMet research backend (optional)

This is a tiny [Cloudflare Worker](https://workers.cloudflare.com/) that powers
the **"Find info with AI"** button with a **live web search** and returns
**sources**. It's optional — WeveMet works fully without it, and the per-person
search links never need it.

Why a backend at all? A web page can't safely hold an API key or crawl the web
(browsers block cross-site requests). This Worker holds the key as a secret and
does the search server-side. Cloudflare's free tier (100k requests/day) is
plenty for personal use; you only pay for Anthropic API usage.

## What you need

- A free [Cloudflare account](https://dash.cloudflare.com/sign-up)
- An [Anthropic API key](https://console.anthropic.com/settings/keys)
- [Node.js](https://nodejs.org/) installed (for the `wrangler` CLI)

## Deploy (about 5 minutes)

From this `backend/` folder:

```bash
# 1. Log in to Cloudflare (opens a browser)
npx wrangler login

# 2. Store your Anthropic key as a secret (paste it when prompted)
npx wrangler secret put ANTHROPIC_API_KEY

# 3. Deploy
npx wrangler deploy
```

`wrangler deploy` prints a URL like:

```
https://wevemet-research.<your-subdomain>.workers.dev
```

## Connect it to the app

1. Open WeveMet → **Stats → Settings · AI research**.
2. Paste that URL into **Research backend URL** and tap **Save URL**.
3. Open any person → **🕵️ Research → ✨ Find info with AI**. It will now search
   the live web and show sources.

## Notes & safety

- **Lock down the origin.** In `worker.js`, change `ALLOWED_ORIGIN = '*'` to your
  Pages origin (e.g. `https://niallmacmillan.github.io`) so only your app can
  call it.
- **Costs.** Each lookup is one Anthropic request with web search — typically a
  fraction of a cent, but it's your key, so set usage limits in the Anthropic
  console.
- **Accuracy & privacy.** Results can still be wrong — always verify. Use only
  for public, professional context about people you've actually met, in line
  with privacy laws.
- **Model.** Defaults to `claude-sonnet-4-6`. Override by uncommenting the
  `MODEL` var in `wrangler.toml`.

## Local test

```bash
npx wrangler dev
# then in another terminal:
curl -X POST http://localhost:8787 \
  -H 'content-type: application/json' \
  -d '{"name":"Tim Cook","company":"Apple"}'
```
