# Anfrage-Versand (Cloudflare Worker + Brevo)

`src/index.js` verschickt die Anfrage-Mails aus dem Konfigurator: eine an hallo@ledwall-360.de und eine Bestätigung an den Kunden.

- Läuft unter https://konfigurator-anfrage.shrill-math-bebd.workers.dev
- Cloudflare stellt den Worker bei jedem Merge auf `main` automatisch neu bereit (Workers Builds, Stammverzeichnis `worker`).
- Der Brevo-Schlüssel steht nur in Cloudflare (Secret `BREVO_API_KEY`), nie im Repo.
