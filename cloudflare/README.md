# Ekonomika Drankjesapp — Cloudflare Workers-versie

Dit is een volledig herschreven versie van dezelfde app, specifiek gebouwd om
op Cloudflare te draaien:

| Node-versie (map hierboven)      | Cloudflare-versie (deze map)                |
|-----------------------------------|----------------------------------------------|
| Express (server.js)               | Cloudflare Worker (`worker/index.js`)        |
| In-memory array met bestellingen  | Supabase-database (`bestellingen`, `bestelling_items`) |
| menu.js / standen.js              | Supabase-tabellen (`menu_items`, `standen`)  |
| Socket.io                         | Native WebSockets, via een Durable Object (`worker/bestellingen-room.js`) die enkel nog de live verbinding beheert |
| `npm start` / Render.com          | `wrangler deploy`                            |

De bestelpagina, het beheerscherm en de QR-codes zien er visueel identiek uit
aan de Node-versie — enkel de manier waarop de server werkt is anders.

Menu, standen en bestellingen staan in Supabase (project `ekonomika-drankjes`),
gestructureerd per **beurs** (tabel `evenementen`). Welke beurs actief is,
bepaalt de rij in `instellingen.actief_evenement_id`. Wijzigingen in
`menu_items`/`standen` via Supabase's Table Editor zijn direct zichtbaar in de
app, zonder her-deployen.

## Supabase koppelen (eenmalig)

De Worker praat met Supabase via twee omgevingsvariabelen:

- `SUPABASE_URL` — staat al in `wrangler.toml` (niet geheim, gewoon het
  project-adres).
- `SUPABASE_SERVICE_ROLE_KEY` — **wél geheim**, moet je zelf toevoegen, nooit
  in een bestand committen.

Zo voeg je die laatste toe:
1. Ga in Supabase naar **Project Settings → API**.
2. Kopieer de **`service_role`**-sleutel (niet de `anon`-sleutel).
3. Ga in Cloudflare naar je Worker → **Settings → Variables and Secrets**.
4. Klik **Add** → type **Secret** → naam `SUPABASE_SERVICE_ROLE_KEY` → plak de
   sleutel → **Save**.

Voor lokaal testen met `wrangler dev`: maak een bestand `.dev.vars` in deze map
(staat al in `.gitignore`, komt dus nooit op GitHub terecht) met:
```
SUPABASE_SERVICE_ROLE_KEY=plak-hier-je-service-role-sleutel
```

## Admin-scherm (`/admin.html`)

Op `/admin.html` kan je:
- **beurzen aanmaken** en kiezen welke er "actief" is (bepaalt wat de
  algemene QR-code/link toont);
- **partners per beurs toevoegen** — één voor één, of in bulk via een
  CSV-invoerveld (formaat: `bedrijfsnaam,tafelnummer` per lijn, tafelnummer
  optioneel);
- meteen de **QR-code en link per partner** bekijken — die verwijst
  rechtstreeks naar de bestelpagina met bedrijf én beurs al ingevuld;
- het **menu (drankjes) per beurs** beheren.

Dit scherm is beveiligd met een gedeeld wachtwoord (geen individuele
accounts — voldoende voor intern gebruik door Ekonomika-vrijwilligers). Dat
wachtwoord stel je zelf in als een **geheime** omgevingsvariabele:

1. Ga in Cloudflare naar je Worker → **Settings → Variables and Secrets**.
2. Klik **Add** → type **Secret** → naam `ADMIN_PASSWORD` → kies zelf een
   wachtwoord → **Save**.
3. Deel dat wachtwoord enkel met wie het admin-scherm mag gebruiken.

Zonder deze variabele blijft `/admin.html` volledig op slot (elke poging om
in te loggen wordt geweigerd).

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

- **Bestellingen staan in Supabase**, dus die overleven een herdeploy of een
  herstart probleemloos — en je kan ze ook rechtstreeks bekijken/aanpassen via
  Supabase's Table Editor.
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
