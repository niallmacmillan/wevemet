/* =====================================================================
 * Research helpers for an attendee.
 *
 * Two layers, both opt-in and privacy-conscious:
 *
 *  1. researchLinks() — one-tap deep links to public searches (Google,
 *     LinkedIn, etc.). No data leaves the device until the user taps a
 *     link. Always available, no setup.
 *
 *  2. enrichWithAI() — if the user has pasted their own AI API key in
 *     Settings, ask the model for a short, *confident-only* summary of
 *     publicly known professional information. The model is instructed
 *     to return confident:false (and we show nothing) whenever it isn't
 *     sure it's the right real person — per the "don't show unless
 *     certain" requirement. This is an aid, can be wrong, and is meant
 *     only for public professional context about people you've met.
 *
 * A static web app cannot itself crawl the web (browser CORS blocks it),
 * so "AI" here means the model's own knowledge, not a live scrape.
 * ===================================================================== */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

/** Build helpful public-search deep links for a person. */
export function researchLinks(person) {
  const q = [person.name, person.company, person.title].filter(Boolean).join(' ');
  const enc = encodeURIComponent;
  const links = [
    { label: 'Google', icon: '🔎', url: `https://www.google.com/search?q=${enc(q)}` },
    { label: 'LinkedIn', icon: '💼', url: `https://www.linkedin.com/search/results/people/?keywords=${enc([person.name, person.company].filter(Boolean).join(' '))}` },
    { label: 'News', icon: '📰', url: `https://news.google.com/search?q=${enc(q)}` },
  ];
  if (person.company) {
    links.push({ label: 'Company', icon: '🏢', url: `https://www.google.com/search?q=${enc(person.company)}` });
  }
  return links;
}

const ENRICH_PROMPT = (p) => `You help someone remember professional context about people they have met at events.

Given the partial details below, return ONLY widely/publicly known professional information you are confident about (e.g. a well-known public figure, executive, author or speaker). Do NOT guess, infer, or fabricate. If you are not confident this refers to a specific real person whose public professional details you actually know, set "confident" to false.

Person:
- Name: ${p.name}
- Title: ${p.title || '(unknown)'}
- Company: ${p.company || '(unknown)'}

Respond with STRICT JSON only, no prose, in this shape:
{
  "confident": boolean,
  "summary": "2-3 sentence public professional summary, or empty string",
  "suggestedTitle": "their role if publicly known, else empty",
  "suggestedCompany": "their org if publicly known, else empty",
  "notableFacts": ["short public fact", "..."]
}`;

function parseModelJSON(text) {
  // Strip code fences / surrounding prose, then parse the JSON object.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in model response');
  return JSON.parse(match[0]);
}

/**
 * Ask the configured AI provider for a confident-only summary.
 * @throws {{code:'NO_KEY'}} when no API key is configured.
 */
export async function enrichWithAI(person, settings = {}) {
  const key = (settings.aiKey || '').trim();
  if (!key) throw { code: 'NO_KEY' };

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      // Required to allow calling the API directly from a browser.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: settings.aiModel || DEFAULT_MODEL,
      max_tokens: 500,
      messages: [{ role: 'user', content: ENRICH_PROMPT(person) }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    if (res.status === 401) throw { code: 'BAD_KEY', detail };
    throw { code: 'HTTP', status: res.status, detail };
  }

  const data = await res.json();
  const text = (data.content || []).map((c) => c.text || '').join('');
  const parsed = parseModelJSON(text);

  return normalize(parsed);
}

function normalize(parsed) {
  return {
    confident: !!parsed.confident,
    summary: parsed.summary || '',
    suggestedTitle: parsed.suggestedTitle || '',
    suggestedCompany: parsed.suggestedCompany || '',
    notableFacts: Array.isArray(parsed.notableFacts) ? parsed.notableFacts : [],
    sources: Array.isArray(parsed.sources) ? parsed.sources : [],
  };
}

/**
 * Call the user's own deployed backend (e.g. the Cloudflare Worker in
 * backend/) which performs a LIVE web search + AI summary with sources.
 * The backend holds the API key, so nothing secret lives in the browser.
 * @throws {{code:'HTTP'|'PARSE'}} on failure.
 */
export async function enrichViaBackend(person, endpoint) {
  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: person.name, title: person.title, company: person.company }),
    });
  } catch (e) {
    throw { code: 'NETWORK', detail: String(e) };
  }
  if (!res.ok) throw { code: 'HTTP', status: res.status, detail: await res.text().catch(() => '') };
  try {
    return normalize(await res.json());
  } catch (e) {
    throw { code: 'PARSE', detail: String(e) };
  }
}

/**
 * Unified entry point used by the UI. Prefers the live-web backend when a
 * research endpoint is configured, otherwise falls back to the direct
 * (model-knowledge-only) call. Throws { code: 'NO_KEY' } when neither is
 * configured.
 */
export async function research(person, settings = {}) {
  if (settings.researchEndpoint) {
    const r = await enrichViaBackend(person, settings.researchEndpoint.trim());
    return { ...r, live: true };
  }
  if ((settings.aiKey || '').trim()) {
    const r = await enrichWithAI(person, settings);
    return { ...r, live: false };
  }
  throw { code: 'NO_KEY' };
}
