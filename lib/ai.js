// AI connection. Works with Google Gemini (free tier available) or Anthropic Claude.
// The API key stays on the server (read from .env) and is never sent to the browser.
// If no key is set, ai.enabled is false and the app uses the quick-match rules instead.

const env = process.env;
const provider = env.GEMINI_API_KEY ? "gemini" : env.ANTHROPIC_API_KEY ? "anthropic" : null;
const GEMINI_MODEL = env.GEMINI_MODEL || "gemini-flash-latest";
const ANTHROPIC_MODEL = env.ANTHROPIC_MODEL || "claude-haiku-5-5";
const GEMINI_BASE = (env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
const ANTHROPIC_BASE = (env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
const TIMEOUT_MS = 45000;

function parseJSON(text) {
  const s = String(text || "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("AI did not return JSON");
  return JSON.parse(s.slice(a, b + 1));
}

// images: [{ mime: "image/jpeg", base64: "..." }]
async function askJSON(prompt, images = []) {
  if (!provider) { const e = new Error("AI is not configured"); e.code = "no_ai"; throw e; }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let res, body;
    if (provider === "gemini") {
      res = await fetch(`${GEMINI_BASE}/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
        method: "POST", signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [
            ...images.map(i => ({ inline_data: { mime_type: i.mime, data: i.base64 } })),
            { text: prompt }
          ] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
        })
      });
      body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error((body.error && body.error.message) || "Gemini error " + res.status), { status: res.status });
      const text = (((body.candidates || [])[0] || {}).content || {}).parts?.map(p => p.text || "").join("") || "";
      return parseJSON(text);
    } else {
      res = await fetch(`${ANTHROPIC_BASE}/v1/messages`, {
        method: "POST", signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL, max_tokens: 1500, temperature: 0.2,
          messages: [{ role: "user", content: [
            ...images.map(i => ({ type: "image", source: { type: "base64", media_type: i.mime, data: i.base64 } })),
            { type: "text", text: prompt }
          ] }]
        })
      });
      body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error((body.error && body.error.message) || "Claude error " + res.status), { status: res.status });
      const text = (body.content || []).filter(c => c.type === "text").map(c => c.text).join("");
      return parseJSON(text);
    }
  } finally {
    clearTimeout(t);
  }
}

module.exports = { enabled: !!provider, provider, model: provider === "gemini" ? GEMINI_MODEL : ANTHROPIC_MODEL, askJSON };
