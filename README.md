# Ekonomika Drankjesapp – oefenversie

Een werkend prototype waarmee partners op een jobbeurs drankjes kunnen
bestellen via één link/QR-code, zonder hun stand te verlaten. Vrijwilligers
van Ekonomika krijgen de bestelling live en met geluid binnen op een apart
beheerscherm.

## Wat zit erin?

- **`/` – Bestelpagina**: partner vult bedrijfs-/standnaam in en kiest
  drankjes met +/− knoppen. Werkt op elke smartphone.
- **`/beheer.html` – Beheerpagina**: voor vrijwilligers. Toont elke nieuwe
  bestelling meteen (geluid + browsermelding), met een knop "Markeer als
  geleverd".
- **`/qr-code.html` – QR-code**: genereert automatisch een QR-code die naar
  de bestelpagina wijst, op basis van waar de app op dat moment draait. Kan
  je afdrukken en op elke stand plaatsen.
- Alles gebruikt **één algemene link** — de bezoeker typt zelf zijn
  bedrijfsnaam/stand in, dus je hoeft geen aparte link per bedrijf te maken.

Het is bewust eenvoudig gehouden (in-memory opslag, geen login, geen
betaling) omdat dit een oefenversie/prototype is. Voor echt gebruik op een
jobbeurs is dit al volledig bruikbaar; als je het structureel wil inzetten
kunnen we later een echte database toevoegen zodat bestellingen niet
verloren gaan bij een herstart van de server.

## Lokaal uitproberen

Vereist: [Node.js](https://nodejs.org) (versie 18 of hoger).

```bash
npm install
npm start
```

De app draait dan op `http://localhost:3000`. Open in twee tabbladen:
- `http://localhost:3000/` → plaats een testbestelling
- `http://localhost:3000/beheer.html` → zie ze binnenkomen (zet geluid aan
  met de knop bovenaan)

## Het menu aanpassen

Open `menu.js` en pas de lijst met drankjes aan. Geen herstart van de code
nodig buiten een herstart van de server.

## Live zetten voor een jobbeurs (zodat iedereen erbij kan via hun eigen data/wifi)

Om dit met echte partners op een jobbeurs te gebruiken, moet de app online
staan (niet enkel op je eigen laptop). De makkelijkste gratis opties:

### Optie A: Render.com (aanbevolen, gratis, geen creditcard nodig)
1. Zet deze map in een GitHub-repository (of gebruik Render's "upload"
   optie).
2. Ga naar [render.com](https://render.com) → **New +** → **Web Service**.
3. Koppel je repository.
4. Build command: `npm install` — Start command: `npm start`.
5. Klik **Deploy**. Je krijgt een link zoals
   `https://ekonomika-drankjes.onrender.com`.
6. Ga naar `<jouw-link>/qr-code.html`, druk de QR-code af — die wijst nu
   automatisch naar de juiste, live link.

### Optie B: Railway.app
Zelfde principe: repository koppelen, Railway detecteert automatisch dat
het een Node-app is via `package.json`.

> Tip: test de live link altijd eerst zelf met je eigen telefoon (op 4G, niet
> op wifi van je kot) vóór de jobbeurs zelf, en laat één vrijwilliger de
> beheerpagina de hele dag open staan op een tablet/laptop met het geluid
> aangezet.

## Wat gebeurt er bij een herstart van de server?

Bestellingen worden in het geheugen bijgehouden (niet in een database). Als
de server herstart (bv. bij een crash of een nieuwe deploy), gaat de lijst
met bestellingen verloren. Voor één jobbeurs op één dag is dit geen
probleem; laat de server gewoon draaien tijdens het evenement.

## Mogelijke volgende stappen

- Bestellingen bewaren in een echte database (bv. SQLite of Firebase), zodat
  ze een herstart overleven en je achteraf statistieken hebt (hoeveel
  drankjes per bedrijf, drukste momenten, ...).
- Login voor vrijwilligers zodat je meerdere teams kan inzetten op een
  grotere beurs.
- Automatisch een schatting van de wachttijd tonen aan de partner.
