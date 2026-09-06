# Ekonomika Drankjesapp — Cloudflare Workers-versie

Dit is een volledig herschreven versie van dezelfde app, specifiek gebouwd om
op Cloudflare te draaien:

| Node-versie (map hierboven)      | Cloudflare-versie (deze map)                |
|-----------------------------------|----------------------------------------------|
| Express (server.js)               | Cloudflare Worker (`worker/index.js`)        |
| In-memory array met bestellingen  | Supabase (Postgres) — zie hieronder          |
| Socket.io                         | Native WebSockets (enkel voor live-updates)  |
| `npm start` / Render.com          | `wrangler deploy`                            |

De bestelpagina, het beheerscherm en de QR-codes zien er visueel identiek uit
aan de Node-versie — enkel de manier waarop de server werkt is anders.

**Deze Cloudflare-versie gebruikt Supabase als database**, niet de
`menu.js`/`standen.js`-bestanden in de hoofdmap (die zijn enkel nog van
toepassing op de Node-versie). Drankenaanbod, deelnemende bedrijven én alle
bestellingen worden bewaard in Supabase, en zijn achteraf te bekijken/
exporteren via het Supabase-dashboard. Beheer ze via `/instellingen.html`
in de app zelf — plak een lijst, geen bestand aanpassen of herstarten nodig.

De app werkt met het concept van een "actief evenement": alles is gekoppeld
aan het evenement dat op dat moment actief staat (zie `/instellingen.html`).
Start je een nieuwe jobbeurs, klik dan op "Start nieuw evenement" en plak de
nieuwe lijst bedrijven (en eventueel menu) — oude gegevens blijven gewoon
bewaard en opvraagbaar, maar worden niet meer getoond in de lopende app.

## Eenmalig instellen

Je hebt een gratis [Cloudflare-account](https://dash.cloudflare.com/sign-up)
nodig, een gratis [Supabase-account](https://supabase.com) (het project
"ekonomika-drankjes" bestaat al in de Ekonomika-organisatie op Supabase —
vraag toegang aan een teamgenoot als je die nog niet hebt), en
[Node.js](https://nodejs.org) op je eigen computer (deze map bevat geen
`node_modules`, dat installeer je zelf).

```bash
cd cloudflare
npm install
npx wrangler login
```

Bij `wrangler login` opent je browser om in te loggen op je Cloudflare-account
en toestemming te geven.

Kopieer daarna `.dev.vars.example` naar `.dev.vars` en vul de twee Supabase-
waarden in (project-URL en **secret key** — `sb_secret_...`, soms ook
"service_role" genoemd — te vinden in het Supabase-dashboard onder
Settings → API → API Keys). `.dev.vars` staat in `.gitignore` en wordt dus
nooit gecommit.

**Tip:** plak de secret key nooit in een chatgesprek (ook niet met Claude) -
open `.dev.vars` rechtstreeks in Kladblok/Notepad en plak hem daar.

## Lokaal uitproberen

```bash
npx wrangler dev
```

**Let op:** dit praat rechtstreeks met de echte Supabase-database (er is geen
lokale nep-database) — een testbestelling die je hier plaatst, staat dus ook
echt in Supabase.

Open in twee tabbladen:
- `http://localhost:8787/` → plaats een testbestelling
- `http://localhost:8787/beheer.html` → zie ze live binnenkomen
- `http://localhost:8787/instellingen.html` → beheer standen, menu en het actieve evenement

## Live zetten

```bash
npx wrangler deploy
```

Je krijgt een link zoals `https://ekonomika-drankjes.<jouw-account>.workers.dev`.
Wil je een eigen domeinnaam (bv. via een domein dat je al bij Cloudflare hebt
lopen), voeg dan een `routes`-blok toe aan `wrangler.toml` — vraag me gerust
om dat samen in te stellen.

Vergeet niet de twee Supabase-secrets ook voor de live versie in te stellen
(dit is apart van `.dev.vars`, dat enkel lokaal geldt):

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SECRET_KEY
```

## Belangrijk om te weten

- **Bestellingen, standen en menu blijven bewaard** in Supabase, ook bij een
  herdeploy — een Postgres-database, geen in-memory lijst. Je kan ze achteraf
  bekijken, filteren en exporteren (CSV) via het Supabase-dashboard (Table
  Editor of SQL Editor), bv. om na de jobbeurs te analyseren welke stand het
  meest bestelde of welk drankje het populairst was.
- **QR-codes per stand** bevatten sinds de Supabase-integratie een intern
  ID-nummer in plaats van de bedrijfsnaam zelf (`?stand=123` i.p.v.
  `?bedrijf=Naam`). Dat voorkomt verwarring als dezelfde bedrijfsnaam ooit
  terugkomt bij een volgende jobbeurs.
- **QR-codes (`/qr.png`)** worden gegenereerd met dezelfde `qrcode`-package
  als de Node-versie. Cloudflare Workers zijn geen Node.js-omgeving, dus dit
  leunt op de `nodejs_compat`-instelling in `wrangler.toml` om dat pakket te
  laten werken. Mocht je na het deployen een kapotte QR-afbeelding zien: laat
  het me weten, dan schakelen we die ene functie om naar een SVG-QR-code
  (heeft geen Node-compatibiliteit nodig en is net zo betrouwbaar).
- **Gratis niveau**: Workers (met de gebruikelijke gratis-niveau-limieten) en
  een gratis Supabase-project zijn ruim voldoende voor één jobbeurs.
