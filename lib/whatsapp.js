// WhatsApp messages. Two ways to send automatically (set ONE in .env):
//   1) Twilio WhatsApp (easiest for a demo — sandbox works in minutes)
//   2) Meta WhatsApp Cloud API (free, needs a Meta developer app)
// If neither is set, messages are still saved and the Security Desk gets a one-tap
// "Send on WhatsApp" button (wa.me link) for each one. Nothing is faked as "sent".

const env = process.env;
const provider = env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM ? "twilio"
  : env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID ? "meta" : null;
const TWILIO_BASE = (env.TWILIO_BASE_URL || "https://api.twilio.com").replace(/\/$/, "");
const META_BASE = (env.WHATSAPP_BASE_URL || "https://graph.facebook.com").replace(/\/$/, "");
const META_VERSION = env.WHATSAPP_API_VERSION || "v23.0";
const CC = env.WHATSAPP_COUNTRY_CODE || "91";

const intl = phone => CC + String(phone || "").replace(/\D/g, "").slice(-10);
const waLink = (phone, text) => "https://wa.me/" + intl(phone) + "?text=" + encodeURIComponent(text);

async function send(phone, text) {
  if (!provider) return { status: "not_configured" };
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    let res, body;
    if (provider === "twilio") {
      const from = env.TWILIO_WHATSAPP_FROM.startsWith("whatsapp:") ? env.TWILIO_WHATSAPP_FROM : "whatsapp:" + env.TWILIO_WHATSAPP_FROM;
      res = await fetch(`${TWILIO_BASE}/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Messages.json`, {
        method: "POST", signal: ctrl.signal,
        headers: { "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + Buffer.from(env.TWILIO_ACCOUNT_SID + ":" + env.TWILIO_AUTH_TOKEN).toString("base64") },
        body: new URLSearchParams({ From: from, To: "whatsapp:+" + intl(phone), Body: text })
      });
      body = await res.json().catch(() => ({}));
      if (!res.ok) return { status: "failed", error: body.message || "Twilio error " + res.status };
      return { status: "sent", ref: body.sid };
    }
    // Meta Cloud API. Free-form text only reaches people who messaged your number in the last 24 h,
    // otherwise set WHATSAPP_TEMPLATE to an approved template with ONE body variable ({{1}}).
    const msg = env.WHATSAPP_TEMPLATE
      ? { type: "template", template: { name: env.WHATSAPP_TEMPLATE, language: { code: env.WHATSAPP_TEMPLATE_LANG || "en" },
          components: [{ type: "body", parameters: [{ type: "text", text: text.slice(0, 1000) }] }] } }
      : { type: "text", text: { body: text, preview_url: true } };
    res = await fetch(`${META_BASE}/${META_VERSION}/${encodeURIComponent(env.WHATSAPP_PHONE_NUMBER_ID)}/messages`, {
      method: "POST", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.WHATSAPP_TOKEN },
      body: JSON.stringify({ messaging_product: "whatsapp", to: intl(phone), ...msg })
    });
    body = await res.json().catch(() => ({}));
    if (!res.ok) return { status: "failed", error: (body.error && body.error.message) || "WhatsApp error " + res.status };
    return { status: "sent", ref: body.messages && body.messages[0] && body.messages[0].id };
  } catch (e) {
    return { status: "failed", error: e.name === "AbortError" ? "Timed out" : e.message };
  } finally { clearTimeout(t); }
}

module.exports = { enabled: !!provider, provider, send, waLink };
