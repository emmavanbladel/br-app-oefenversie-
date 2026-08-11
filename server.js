const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const QRCode = require("qrcode");
const menu = require("./menu");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// In-memory opslag van bestellingen (voor een oefenversie/prototype volstaat dit;
// bij een herstart van de server gaat de lijst verloren).
let bestellingen = [];
let volgendId = 1;

// ---- API ----

// Menu ophalen (gebruikt door bestelpagina)
app.get("/api/menu", (req, res) => {
  res.json(menu);
});

// Alle bestellingen ophalen (gebruikt door beheerpagina bij het laden)
app.get("/api/bestellingen", (req, res) => {
  res.json(bestellingen);
});

// Nieuwe bestelling plaatsen
app.post("/api/bestellingen", (req, res) => {
  const { bedrijf, dranken } = req.body;

  if (!bedrijf || typeof bedrijf !== "string" || !bedrijf.trim()) {
    return res.status(400).json({ error: "Bedrijfs-/standnaam is verplicht." });
  }
  if (!Array.isArray(dranken) || dranken.length === 0) {
    return res.status(400).json({ error: "Kies minstens één drankje." });
  }

  const nieuweBestelling = {
    id: volgendId++,
    bedrijf: bedrijf.trim(),
    dranken, // bv. [{ naam: "Cola", aantal: 2 }, ...]
    status: "nieuw",
    tijdstip: new Date().toISOString(),
  };

  bestellingen.unshift(nieuweBestelling);
  io.emit("nieuwe-bestelling", nieuweBestelling);

  res.status(201).json(nieuweBestelling);
});

// Bestelling markeren als geleverd
app.post("/api/bestellingen/:id/geleverd", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const bestelling = bestellingen.find((b) => b.id === id);

  if (!bestelling) {
    return res.status(404).json({ error: "Bestelling niet gevonden." });
  }

  bestelling.status = "geleverd";
  io.emit("bestelling-bijgewerkt", bestelling);

  res.json(bestelling);
});

// QR-code die naar de bestelpagina verwijst, dynamisch gegenereerd op basis van
// het huidige adres (werkt dus zowel lokaal als na deployen, zonder aanpassing).
app.get("/qr.png", async (req, res) => {
  const bestelUrl = `${req.protocol}://${req.get("host")}/`;
  try {
    const buffer = await QRCode.toBuffer(bestelUrl, { width: 500, margin: 2 });
    res.type("png").send(buffer);
  } catch (err) {
    res.status(500).send("Kon QR-code niet genereren.");
  }
});

io.on("connection", (socket) => {
  // Geen extra logica nodig; server pusht events naar alle verbonden beheerschermen.
});

server.listen(PORT, () => {
  console.log(`Ekonomika drankjesapp draait op http://localhost:${PORT}`);
  console.log(`Bestelpagina:  http://localhost:${PORT}/`);
  console.log(`Beheerpagina:  http://localhost:${PORT}/beheer.html`);
  console.log(`QR-code:       http://localhost:${PORT}/qr-code.html`);
});
