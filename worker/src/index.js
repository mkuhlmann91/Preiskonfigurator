// LEDWALL 360 – Anfrage-Versand für den Konfigurator (Cloudflare Worker + Brevo)
// Schickt zwei Mails: eine an euch (hallo@) und eine Bestätigung an den Kunden.
// Der Brevo-Schlüssel steht NICHT hier, sondern als Secret "BREVO_API_KEY" in Cloudflare.

const RECIPIENT = 'hallo@ledwall-360.de';            // hier kommen die Anfragen an
const SENDER = { name: 'LEDWALL 360', email: 'hallo@ledwall-360.de' }; // muss in Brevo bestätigt sein
const ALLOWED_ORIGINS = ['https://konfigurator.ledwall-360.de'];
const PINK = '#e7007f';
const FONT = "Inter,'Helvetica Neue',Helvetica,Arial,sans-serif";   // wie im Konfigurator
const HEAD_FONT = "'Space Grotesk',Inter,'Helvetica Neue',Helvetica,Arial,sans-serif";

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    };
    const reply = (status, data) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return reply(405, { success: false, message: 'Nur POST' });
    if (!ALLOWED_ORIGINS.includes(origin)) return reply(403, { success: false, message: 'Herkunft nicht erlaubt' });

    let d;
    try { d = await request.json(); } catch { return reply(400, { success: false, message: 'Ungültige Daten' }); }
    if (d.honey) return reply(200, { success: true });           // Spam-Bot: still ignorieren

    const s = (v, max = 2000) => String(v ?? '').trim().slice(0, max);
    const f = {
      name: s(d.name, 120), company: s(d.company, 160), email: s(d.email, 200), phone: s(d.phone, 60),
      message: s(d.message, 4000), size: s(d.size, 60), area: s(d.area, 120), lang: d.lang === 'en' ? 'en' : 'de',
      link: s(d.link, 1500), config: s(d.config, 4000)
    };
    if (!f.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return reply(400, { success: false, message: 'Name oder E-Mail fehlt' });
    if (f.link && !f.link.startsWith(ALLOWED_ORIGINS[0])) f.link = '';
    if (!env.BREVO_API_KEY) return reply(500, { success: false, message: 'BREVO_API_KEY fehlt' });

    // "Label: Wert"-Zeilen aus dem Konfigurator
    // Deutsche Seite: Dezimalkomma statt Punkt (Pixel Pitch bleibt "P2.5")
    const dec = (k, v) => (f.lang === 'de' && !/pitch/i.test(k) ? v.replace(/(\d)\.(\d)/g, '$1,$2') : v);
    const rows = f.config.split('\n').map((l) => { const i = l.indexOf(': '); return i > 0 ? [l.slice(0, i), dec(l.slice(0, i), l.slice(i + 2))] : null; }).filter(Boolean);

    const en = f.lang === 'en';
    const internal = {
      sender: SENDER,
      to: [{ email: RECIPIENT }],
      replyTo: { email: f.email, name: f.name },
      subject: `Anfrage - Konfigurator - ${f.size || 'ohne Größe'}${en ? ' (EN)' : ''}`,
      htmlContent: internalHtml(f, rows),
      textContent: `Neue Anfrage\n\nName: ${f.name}\nFirma: ${f.company || '–'}\nE-Mail: ${f.email}\nTelefon: ${f.phone || '–'}\nNachricht: ${f.message || '–'}\n\n${f.config}\n\nLink zur Wand: ${f.link}`
    };
    const customer = {
      sender: SENDER,
      to: [{ email: f.email, name: f.name }],
      replyTo: { email: RECIPIENT, name: 'LEDWALL 360' },
      subject: en ? 'Your request at LEDWALL 360' : 'Deine Anfrage bei LEDWALL 360',
      htmlContent: customerHtml(f, rows),
      textContent: en
        ? `Thanks for your request, ${f.name}!\n\nWe received your configuration and will get back to you with an offer within 24 hours.\n\nYour LED wall: ${f.link}\n\nLEDWALL 360`
        : `Danke für deine Anfrage, ${f.name}!\n\nWir haben deine Konfiguration erhalten und melden uns innerhalb von 24 Stunden mit einem Angebot bei dir.\n\nDeine LED-Wand: ${f.link}\n\nDein LEDWALL 360 Team`
    };

    const send = (mail) => fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(mail)
    });

    const res = await send(internal);
    if (!res.ok) return reply(502, { success: false, message: 'Brevo: ' + (await res.text()).slice(0, 300) });
    await send(customer).catch(() => {});   // Bestätigung ist "nice to have", Anfrage ist schon bei euch
    return reply(200, { success: true });
  }
};

/* ----------------------------- Mail-Vorlagen ----------------------------- */

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl = (v) => esc(v).replace(/\n/g, '<br>');

function table(pairs) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;font-family:${FONT};">${pairs.map(([k, v], i) => {
    const b = i ? 'border-top:1px solid #eee;' : '';
    return `<tr><td style="padding:5px 0;color:#8d8d94;width:150px;padding-right:12px;vertical-align:top;${b}">${esc(k)}</td><td style="padding:5px 0;${b}">${v}</td></tr>`;
  }).join('')}</table>`;
}
const heading = (t) => `<div style="font-family:${HEAD_FONT};font-size:13px;font-weight:700;color:${PINK};text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">${esc(t)}</div>`;
const button = (href, label) => href ? `<a href="${esc(href)}" style="display:inline-block;background:${PINK};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:8px;">${esc(label)}</a>` : '';
const frame = (inner) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;600&display=swap" rel="stylesheet"></head>
<body style="margin:0;background:#f2f2f4;font-family:${FONT};color:#1b1b1e;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f4;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;">${inner}</table></td></tr></table></body></html>`;

function internalHtml(f, rows) {
  const contact = [
    ['Name', esc(f.name)],
    ['Firma', esc(f.company || '–')],
    ['E-Mail', `<a href="mailto:${esc(f.email)}" style="color:${PINK};">${esc(f.email)}</a>`],
    ['Telefon', f.phone ? `<a href="tel:${esc(f.phone.replace(/[^\d+]/g, ''))}" style="color:${PINK};">${esc(f.phone)}</a>` : '–'],
    ['Nachricht', nl(f.message || '–')]
  ];
  return frame(`
  <tr><td style="background:${PINK};padding:18px 24px;color:#fff;">
    <div style="font-family:${HEAD_FONT};font-size:20px;font-weight:700;">Neue Anfrage aus dem Konfigurator</div>
    <div style="font-size:13px;opacity:.9;margin-top:2px;">${esc([f.area, f.size].filter(Boolean).join(' · '))}${f.lang === 'en' ? ' · englische Seite' : ''}</div>
  </td></tr>
  <tr><td style="padding:20px 24px 4px;">${heading('Kontakt')}${table(contact)}</td></tr>
  <tr><td style="padding:16px 24px 4px;">${heading('Konfiguration')}${table(rows.map(([k, v]) => [k, esc(v)]))}</td></tr>
  <tr><td align="center" style="padding:22px 24px 26px;">${button(f.link, 'LED-Wand des Kunden ansehen')}</td></tr>`);
}

function customerHtml(f, rows) {
  const en = f.lang === 'en';
  const keep = en ? ['Wall size', 'Category', 'Location', 'Pixel pitch', 'Mounting'] : ['Wandgröße', 'Bereich', 'Einsatzort', 'Pixel Pitch', 'Montage', 'Aufbauart'];
  const first = f.name.split(' ')[0];
  return frame(`
  <tr><td style="background:#0a0a0b;padding:18px 24px;"><img src="https://konfigurator.ledwall-360.de/assets/ledwall360-logo.jpg" alt="LEDWALL 360" height="44" style="display:block;height:44px;"></td></tr>
  <tr><td style="background:${PINK};height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>
  <tr><td style="padding:24px 24px 6px;">
    <div style="font-family:${HEAD_FONT};font-size:22px;font-weight:700;">${en ? `Thanks for your request, ${esc(first)}!` : `Danke für deine Anfrage, ${esc(first)}!`}</div>
    <p style="font-size:14px;line-height:1.6;margin:10px 0 0;">${en ? 'We received your configuration and will get back to you with an offer within 24 hours.' : 'Wir haben deine Konfiguration erhalten und melden uns innerhalb von 24 Stunden mit einem Angebot bei dir.'}</p>
  </td></tr>
  <tr><td style="padding:16px 24px 4px;">${heading(en ? 'Your LED wall' : 'Deine LED-Wand')}${table(rows.filter(([k]) => keep.includes(k)).map(([k, v]) => [k, esc(v)]))}</td></tr>
  <tr><td align="center" style="padding:22px 24px 8px;">${button(f.link, en ? 'View your LED wall' : 'Deine LED-Wand ansehen')}</td></tr>
  <tr><td style="padding:14px 24px 24px;font-size:14px;line-height:1.6;">${en ? 'Questions? Just reply to this email.<br><br>Best regards<br><b>Your LEDWALL 360 team</b>' : 'Fragen vorab? Antworte einfach auf diese Mail.<br><br>Viele Grüße<br><b>Dein LEDWALL 360 Team</b>'}</td></tr>
  <tr><td style="background:#f7f7f8;padding:12px 24px;font-size:11px;color:#8d8d94;">LEDWALL 360 GmbH · hallo@ledwall-360.de · ledwall-360.de</td></tr>`);
}
