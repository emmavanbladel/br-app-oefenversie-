# Ekonomika Drankjesapp — Cloudflare Workers-versie

Dit is een volledig herschreven versie van dezelfde app, specifiek gebouwd om
op Cloudflare te draaien:

| Node-versie (map hierboven)      | Cloudflare-versie (deze map)                |
|-----------------------------------|----------------------------------------------|
| Express (server.js)               | Cloudflare Worker (`worker/index.js`)        |
| In-memory array met bestellingen  | Durable Object (`worker/bestellingen-room.js`) |
| Socket.io                         | Native WebSockets                            |
| `npm start` / Render.com          | `wrangler deploy`                            |

De bestelpagina, het beheerscherm en de QR-codes zien er visueel identiek uit
aan de Node-versie — enkel de manier waarop de server werkt is anders.

`menu.js` en `standen.js` in de hoofdmap van het project zijn de **enige**
plek waar je het drankenaanbod en de deelnemende bedrijven aanpast; deze
Cloudflare-versie leest die bestanden rechtstreeks in, dus je hoeft niets te
dupliceren.

## Eenmalig instellen

Je hebt een gratis [Cloudflare-account](https://dash.cloudflare.com/sign-up)
nodig en [Node.js](https://nodejs.org) op je eigen computer (deze map bevat
geen `node_modules`, dat installeer je zelf).

```bash
cd cloudflare
npm install
npx wrangler login
```

Bij `wrangler login` opent je browser om in te loggen op je Cloudflare-account
en toestemming te geven.

## Lokaal uitproberen

```bash
npx wrangler dev
```

Dit start de app lokaal (inclusief een gesimuleerde Durable Object). Open in
twee tabbladen:
- `http://localhost:8787/` → plaats een testbestelling
- `http://localhost:8787/beheer.html` → zie ze live binnenkomen

## Live zetten

```bash
npx wrangler deploy
```

Je krijgt een link zoals `https://ekonomika-drankjes.<jouw-account>.workers.dev`.
Wil je een eigen domeinnaam (bv. via een domein dat je al bij Cloudflare hebt
lopen), voeg dan een `routes`-blok toe aan `wrangler.toml` — vraag me gerust
om dat samen in te stellen.

## Belangrijk om te weten

- **Bestellingen blijven bewaard**, ook bij een herdeploy — die zitten in de
  Durable Object, niet enkel in het geheugen van één server zoals bij de
  Node-versie. Ze verdwijnen pas als je de Durable Object expliciet leegmaakt.
- **QR-codes (`/qr.png`)** worden gegenereerd met dezelfde `qrcode`-package
  als de Node-versie. Cloudflare Workers zijn geen Node.js-omgeving, dus dit
  leunt op de `nodejs_compat`-instelling in `wrangler.toml` om dat pakket te
  laten werken. Mocht je na het deployen een kapotte QR-afbeelding zien: laat
  het me weten, dan schakelen we die ene functie om naar een SVG-QR-code
  (heeft geen Node-compatibiliteit nodig en is net zo betrouwbaar).
- **Gratis niveau**: Workers + Durable Objects (met de SQLite-opslag die hier
  gebruikt wordt) werken op het gratis Cloudflare-plan, met de gebruikelijke
  gratis-niveau-limieten (aantal requests/dag). Voor één jobbeurs is dat
  ruim voldoende.
