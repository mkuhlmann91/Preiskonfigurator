// LEDWALL 360 – Anfrage-Versand für den Konfigurator (Cloudflare Worker + Brevo)
// Schickt zwei Mails: eine an euch (hallo@) und eine Bestätigung an den Kunden.
// Der Brevo-Schlüssel steht NICHT hier, sondern als Secret "BREVO_API_KEY" in Cloudflare.

const RECIPIENT = 'hallo@ledwall-360.de';            // Antwortadresse für Kunden
// VORÜBERGEHEND: Zustellung von Brevo an den Mailserver von ledwall-360.de (hostingplus) hakt seit 29.10.
// Konfigurator-Anfragen gehen deshalb zusätzlich als Kopie an web.de. Nach Behebung INQUIRY_CC entfernen.
const INQUIRY_CC = 'marvink.golds@web.de';
const SENDER = { name: 'LEDWALL 360', email: 'hallo@ledwall-360.de' }; // muss in Brevo bestätigt sein
const ALLOWED_ORIGINS = ['https://konfigurator.ledwall-360.de'];
// Kontaktformular auf ledwall-360.de/kontakt: Bestätigung an den Kunden über Brevo-Vorlage 13
const KONTAKT_ORIGINS = ['https://www.ledwall-360.de', 'https://ledwall-360.de'];
const KONTAKT_TEMPLATE = 13;
const KONTAKT_THEMEN = ['Kauf / Beratung', 'Miete', 'Frage zu deiner Bestellung', 'Sonstiges'];
// Produktanfrage auf den Produktseiten (ledwall-360.de/product/...): Bestätigung über Brevo-Vorlage 3
const PRODUKT_TEMPLATE = 3;
const PINK = '#d10070';
const PHONE = '+49 431 88864540';
const PHONE_LINK = 'tel:+4943188864540';
const WHATSAPP_LINK = 'https://wa.me/4943188864540';
const INSTAGRAM_LINK = 'https://www.instagram.com/ledwall360/';
// Buchungsseite für das kostenlose Erstgespräch. Leer = kein Termin-Button, die Mail sieht dann aus wie vorher.
const BOOKING_LINK = 'https://meet.brevo.com/ledwall-360';
const LOGO_WHITE = 'https://konfigurator.ledwall-360.de/assets/ledwall360-logo-weiss.png';
const NIKKI = 'https://konfigurator.ledwall-360.de/assets/nikki-breuer.png';
const ICON = (n) => `https://konfigurator.ledwall-360.de/assets/icon-${n}.png`;
const FONT = "Inter,'Helvetica Neue',Helvetica,Arial,sans-serif";   // wie im Konfigurator
const HEAD_FONT = FONT;   // Überschriften in derselben Schrift wie der Text (Marvin-Wunsch)

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    const isKontakt = path === '/kontakt' || path === '/produktanfrage';
    const origins = isKontakt ? KONTAKT_ORIGINS : ALLOWED_ORIGINS;
    const cors = {
      'Access-Control-Allow-Origin': origins.includes(origin) ? origin : origins[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    };
    const reply = (status, data) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return reply(405, { success: false, message: 'Nur POST' });
    if (!origins.includes(origin)) return reply(403, { success: false, message: 'Herkunft nicht erlaubt' });
    if (path === '/kontakt') return kontakt(request, env, reply);
    if (path === '/produktanfrage') return produktanfrage(request, env, reply);

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
    if ((f.phone.match(/\d/g) || []).length < 6) return reply(400, { success: false, message: 'Telefonnummer fehlt' });
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
      cc: [{ email: INQUIRY_CC }],
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
        ? `Thanks for your request, ${f.name}!\n\nYou will receive your offer within 72 hours.${BOOKING_LINK ? `\n\nFaster and more precise with a short call: in 15 minutes we look at what you need the wall for and fine-tune your LEDWALL to match. That way you get the best solution at the best price.\n\nBook a call now (15 minutes, free & no obligation): ${BOOKING_LINK}\n\nWith a call: offer right after the call, tailored to you.\nWithout a call: offer within 72 hours based on your configuration.` : ''}\n\nView your configuration: ${f.link}\n\nRather talk right away? Hi, I'm Nikki. Just call me at ${PHONE} or drop me a quick WhatsApp: ${WHATSAPP_LINK}\n\nIn the meantime, check out real projects and great offers on our Instagram: ${INSTAGRAM_LINK}\n\nBest regards\nNikki Breuer\nLEDWALL360`
        : `Danke für deine Anfrage, ${f.name}!\n\nDein Angebot bekommst du innerhalb von 72 Stunden.${BOOKING_LINK ? `\n\nSchneller und genauer geht's mit einem kurzen Termin: In 15 Minuten schauen wir auf deinen Einsatzzweck und stimmen deine LEDWALL perfekt darauf ab. So erhältst du garantiert die beste Lösung zum besten Preis.\n\nJetzt Termin buchen (15 Minuten, kostenlos & unverbindlich): ${BOOKING_LINK}\n\nMit Termin: Angebot direkt nach dem Gespräch, genau auf dich abgestimmt.\nOhne Termin: Angebot innerhalb von 72 Std. auf Basis deiner Konfiguration.` : ''}\n\nDeine Konfiguration ansehen: ${f.link}\n\nDu willst lieber direkt sprechen? Hi, ich bin Nikki. Ruf mich einfach an unter ${PHONE} oder schreib mir kurz per WhatsApp: ${WHATSAPP_LINK}\n\nIn der Zwischenzeit findest du echte Projekte und starke Angebote bei uns auf Instagram: ${INSTAGRAM_LINK}\n\nBeste Grüße\nNikki Breuer\nLEDWALL360`
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

// Kontaktformular: nur die Bestätigung an den Kunden. Die Anfrage selbst kommt wie bisher über Webflow bei euch an.
async function kontakt(request, env, reply) {
  let d;
  try { d = await request.json(); } catch { return reply(400, { success: false, message: 'Ungültige Daten' }); }
  if (d.honey) return reply(200, { success: true });
  const s = (v, max) => String(v ?? '').trim().slice(0, max);
  const name = s(d.name, 120), email = s(d.email, 200), thema = s(d.thema, 60);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, { success: false, message: 'Name oder E-Mail fehlt' });
  if (!KONTAKT_THEMEN.includes(thema)) return reply(400, { success: false, message: 'Thema fehlt' });
  if (!env.BREVO_API_KEY) return reply(500, { success: false, message: 'BREVO_API_KEY fehlt' });
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      templateId: KONTAKT_TEMPLATE,
      to: [{ email, name }],
      replyTo: { email: RECIPIENT, name: 'LEDWALL 360' },
      params: { NAME: name.split(' ')[0], THEMA: thema, COMPANY: s(d.company, 160), MESSAGE: s(d.message, 1500) }
    })
  });
  if (!res.ok) return reply(502, { success: false, message: 'Brevo: ' + (await res.text()).slice(0, 300) });
  return reply(200, { success: true });
}

// Produktanfrage: ebenfalls nur die Bestätigung an den Kunden, die Anfrage selbst läuft weiter über Webflow.
async function produktanfrage(request, env, reply) {
  let d;
  try { d = await request.json(); } catch { return reply(400, { success: false, message: 'Ungültige Daten' }); }
  if (d.honey) return reply(200, { success: true });
  const s = (v, max) => String(v ?? '').trim().slice(0, max);
  const name = s(d.name, 120), email = s(d.email, 200), produkt = s(d.produkt, 120);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, { success: false, message: 'Name oder E-Mail fehlt' });
  if (!produkt) return reply(400, { success: false, message: 'Produkt fehlt' });
  if (!env.BREVO_API_KEY) return reply(500, { success: false, message: 'BREVO_API_KEY fehlt' });
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      templateId: PRODUKT_TEMPLATE,
      to: [{ email, name }],
      replyTo: { email: RECIPIENT, name: 'LEDWALL 360' },
      tags: ['produktanfrage'],
      params: { NAME: name.split(' ')[0], PRODUCT_NAME: produkt, PHONE: s(d.phone, 60), MESSAGE: s(d.message, 1500) }
    })
  });
  if (!res.ok) return reply(502, { success: false, message: 'Brevo: ' + (await res.text()).slice(0, 300) });
  return reply(200, { success: true });
}

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
const frame = (inner) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet"><style>@media only screen and (max-width:520px){.dk{display:none!important;}.mb{display:table-row!important;}.cb{padding-left:10px!important;padding-right:10px!important;}.cbi{padding:14px 12px!important;}.ph{width:86px!important;}.ph img{width:76px!important;height:101px!important;}}</style></head>
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
  const t = (de, enText) => (en ? enText : de);
  const keep = en ? ['Wall size', 'Category', 'Location', 'Pixel pitch', 'Mounting'] : ['Wandgröße', 'Bereich', 'Einsatzort', 'Pixel Pitch', 'Montage', 'Aufbauart'];
  const first = f.name.split(' ')[0];
  const nb = (v) => `<span style="white-space:nowrap;">${esc(v)}</span>`;
  const p = (html, extra = '') => `<p style="font-family:${FONT};font-size:14px;line-height:1.6;margin:0;${extra}">${html}</p>`;
  const ghost = (href, label, icon) => `<a href="${esc(href)}" style="display:inline-block;border:1.5px solid ${PINK};color:${PINK};text-decoration:none;font-family:${FONT};font-weight:600;font-size:13px;line-height:16px;padding:9px 16px 9px 13px;border-radius:8px;margin:4px 6px 0 0;"><img src="${ICON(icon)}" alt="" width="16" height="16" style="display:inline-block;width:16px;height:16px;border:0;vertical-align:-3px;margin-right:7px;">${esc(label)}</a>`;
  // Ohne Buchungslink fällt der ganze Termin-Block weg
  const booking = BOOKING_LINK ? `
  <tr><td style="padding:22px 24px 4px;">
    ${p(`<b style="font-weight:600;">${t("Schneller und genauer geht's mit einem kurzen Termin:", 'Faster and more precise with a short call:')}</b> ${t('In 15&nbsp;Minuten schauen wir auf deinen Einsatzzweck und stimmen deine LEDWALL perfekt darauf ab. So erhältst du garantiert die beste Lösung zum besten Preis.', 'In 15&nbsp;minutes we look at what you need the wall for and fine-tune your LEDWALL to match. That way you get the best solution at the best price.')}`)}
  </td></tr>
  <tr><td align="center" style="padding:18px 24px 0;"><a href="${esc(BOOKING_LINK)}" style="display:inline-block;background:${PINK};color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:8px;font-family:${FONT};"><span style="font-size:17px;vertical-align:-1px;margin-right:8px;">📅</span>${t('Jetzt Termin buchen', 'Book a call now')}</a></td></tr>
  <tr><td align="center" style="padding:6px 24px 4px;">${p(t('15 Minuten · kostenlos &amp; unverbindlich', '15 minutes · free &amp; no obligation'), 'font-size:12px;line-height:1.5;color:#8d8d94;')}</td></tr>
  <tr><td style="padding:18px 24px 4px;">${heading(t("So geht's weiter", 'What happens next'))}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${FONT};font-size:14px;line-height:1.5;">
      <tr><td style="width:28px;padding:6px 0 5px;vertical-align:top;"><img src="${ICON('blitz')}" alt="" width="20" height="20" style="display:block;width:20px;height:20px;border:0;"></td><td style="padding:5px 0;"><b style="font-weight:600;">${t('Mit Termin:', 'With a call:')}</b> ${t('Angebot direkt nach dem Gespräch, genau auf dich abgestimmt', 'offer right after the call, tailored to you')}</td></tr>
      <tr><td style="width:28px;padding:7px 0 5px;vertical-align:top;border-top:1px solid #eee;"><img src="${ICON('uhr')}" alt="" width="18" height="18" style="display:block;width:18px;height:18px;border:0;margin-left:1px;"></td><td style="padding:5px 0;border-top:1px solid #eee;color:#6b6b75;"><b style="font-weight:600;">${t('Ohne Termin:', 'Without a call:')}</b> ${t('Angebot innerhalb von 72&nbsp;Std. auf Basis deiner Konfiguration', 'offer within 72&nbsp;hours based on your configuration')}</td></tr>
    </table></td></tr>` : '';
  return frame(`
  <tr><td style="background:${PINK};padding:22px 24px;"><img src="${LOGO_WHITE}" alt="LEDWALL360" width="200" style="display:block;width:200px;max-width:60%;height:auto;border:0;"></td></tr>
  <tr><td style="padding:26px 24px 4px;">
    <div style="font-family:${HEAD_FONT};font-size:22px;font-weight:700;">${t(`Danke für deine Anfrage, ${esc(first)}!`, `Thanks for your request, ${esc(first)}!`)}</div>
    ${p(t('Dein Angebot bekommst du innerhalb von 72&nbsp;Stunden.', 'You will receive your offer within 72&nbsp;hours.'), 'margin-top:10px;')}
  </td></tr>${booking}
  <tr><td style="padding:16px 24px 4px;">${heading(t('Deine LEDWALL', 'Your LEDWALL'))}${table(rows.filter(([k]) => keep.includes(k)).map(([k, v]) => [k, esc(v)]))}</td></tr>${f.link ? `
  <tr><td style="padding:14px 24px 4px;"><a href="${esc(f.link)}" style="display:inline-block;background:#fbf0f6;border:1.5px solid #f3cfe2;border-radius:8px;padding:10px 16px;font-family:${FONT};font-size:14px;line-height:18px;font-weight:600;color:${PINK};text-decoration:none;"><img src="${ICON('auge')}" alt="" width="16" height="16" style="display:inline-block;width:16px;height:16px;border:0;vertical-align:-3px;margin-right:8px;">${t('Deine Konfiguration ansehen', 'View your configuration')}</a></td></tr>` : ''}
  <tr><td class="cb" style="padding:22px 24px 4px;">
    <div class="cbi" style="background:#fbf0f6;border-radius:10px;padding:16px 18px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td class="ph" width="120" style="width:120px;vertical-align:top;"><img src="${NIKKI}" alt="Nikki Breuer" width="105" height="140" style="display:block;width:105px;height:140px;border-radius:12px;border:0;"></td>
        <td style="vertical-align:top;">
          ${p(`<b style="font-weight:600;">${t('Du willst lieber direkt sprechen?', 'Rather talk right away?')}</b><br>${t('Hi, ich bin Nikki. Ruf&nbsp;mich einfach an oder schreib mir kurz per&nbsp;WhatsApp.', "Hi, I'm Nikki. Just call me or drop me a quick WhatsApp.")}`)}
          ${p(nb(PHONE), 'margin-top:4px;font-size:12px;color:#8d8d94;')}
          <div class="dk" style="margin-top:6px;">${ghost(PHONE_LINK, t('Anrufen', 'Call'), 'phone')}${ghost(WHATSAPP_LINK, 'WhatsApp', 'whatsapp')}</div>
        </td>
      </tr>
      <!-- Handy: Buttons unter Foto und Text -->
      <tr class="mb" style="display:none;mso-hide:all;">
        <td colspan="2" style="padding-top:8px;">${ghost(PHONE_LINK, t('Anrufen', 'Call'), 'phone')}${ghost(WHATSAPP_LINK, 'WhatsApp', 'whatsapp')}</td>
      </tr></table>
    </div>
  </td></tr>
  <tr><td style="padding:22px 24px 4px;">${heading('Instagram')}
    <a href="${INSTAGRAM_LINK}" style="display:block;text-decoration:none;color:#1b1b1e;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="56" style="width:56px;vertical-align:middle;"><img src="${ICON('instagram-farbe')}" alt="Instagram" width="44" height="44" style="display:block;width:44px;height:44px;border:0;border-radius:12px;"></td>
      <td style="vertical-align:middle;font-family:${FONT};">
        <div style="font-size:14px;line-height:1.5;color:#1b1b1e;">${t('In der Zwischenzeit findest du echte Projekte und starke Angebote bei uns auf Instagram.', 'In the meantime, check out real projects and great offers on our Instagram.')}</div>
        <div style="font-size:13px;line-height:1.4;font-weight:600;color:${PINK};margin-top:4px;">${t('@ledwall360 ansehen →', 'View @ledwall360 →')}</div>
      </td>
    </tr></table></a>
  </td></tr>
  <tr><td style="padding:20px 24px 24px;">${p(t('Beste Grüße<br>Nikki Breuer<br>LEDWALL360', 'Best regards<br>Nikki Breuer<br>LEDWALL360'))}</td></tr>
  <tr><td style="background:#f7f7f8;padding:12px 24px;font-family:${FONT};font-size:11px;color:#8d8d94;">LEDWALL360 GmbH · ${PHONE} · hallo@ledwall-360.de · ledwall-360.de</td></tr>`);
}
