/* =====================================================================
 * WeveMet research backend — Cloudflare Worker.
 *
 * Does a LIVE web search + AI summary for a person and returns a small
 * JSON payload (with sources) that the WeveMet app understands. The
 * Anthropic API key lives here as a Worker secret, so it never touches
 * the user's browser.
 *
 * Deploy: see README.md in this folder (about 5 minutes, free tier).
 *
 * Request:  POST { "name": "...", "title": "...", "company": "..." }
 * Response: { confident, summary, suggestedTitle, suggestedCompany,
 *             notableFacts: [...], sources: ["https://..."] }
 * ===================================================================== */

const ALLOWED_ORIGIN = '*'; // Lock this to your Pages origin in production.

const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  });
}

const PROMPT = (p) => `Use web search to find PUBLIC professional information about this person, then summarise it.

Person:
- Name: ${p.name}
- Title: ${p.title || '(unknown)'}
- Company: ${p.company || '(unknown)'}

Rules:
- Only report information you can support from the search results.
- If you cannot confidently identify this specific real person, set "confident" to false and leave fields empty.
- Do not fabricate. Prefer recent, reputable sources.

After searching, reply with STRICT JSON ONLY (no prose, no markdown), exactly:
{
  "confident": boolean,
  "summary": "2-3 sentence public professional summary, or empty string",
  "suggestedTitle": "current role if known, else empty",
  "suggestedCompany": "current org if known, else empty",
  "notableFacts": ["short public fact", "..."],
  "sources": ["https://url-you-used", "..."]
}`;

function extractJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in model output');
  return JSON.parse(match[0]);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'Server missing ANTHROPIC_API_KEY' }, 500);

    let person;
    try {
      person = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    if (!person || !person.name) return json({ error: 'name is required' }, 400);

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.MODEL || 'claude-sonnet-4-6',
        max_tokens: 800,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }],
        messages: [{ role: 'user', content: PROMPT(person) }],
      }),
    });

    if (!apiRes.ok) {
      const detail = await apiRes.text().catch(() => '');
      return json({ error: 'Upstream error', status: apiRes.status, detail }, 502);
    }

    const data = await apiRes.json();

    // Concatenate text blocks; collect any citation URLs as a fallback.
    const blocks = data.content || [];
    const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    const citationURLs = [];
    blocks.forEach((b) => {
      (b.citations || []).forEach((c) => { if (c.url) citationURLs.push(c.url); });
    });

    let parsed;
    try {
      parsed = extractJSON(text);
    } catch {
      return json({ confident: false, summary: '', suggestedTitle: '', suggestedCompany: '', notableFacts: [], sources: citationURLs });
    }

    return json({
      confident: !!parsed.confident,
      summary: parsed.summary || '',
      suggestedTitle: parsed.suggestedTitle || '',
      suggestedCompany: parsed.suggestedCompany || '',
      notableFacts: Array.isArray(parsed.notableFacts) ? parsed.notableFacts : [],
      sources: Array.isArray(parsed.sources) && parsed.sources.length ? parsed.sources : citationURLs,
    });
  },
};
