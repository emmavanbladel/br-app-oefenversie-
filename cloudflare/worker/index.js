import QRCode from "qrcode";
import { BestellingenRoom } from "./bestellingen-room.js";
import {
  getActiefEvenementId,
  haalMenu,
  haalStanden,
  haalEvenementen,
  maakEvenement,
  zetActiefEvenement,
  haalStandenBeheer,
  haalStandDoorToken,
  voegStandToe,
  voegStandenBulkToe,
  verwijderStand,
  haalMenuBeheer,
  voegMenuItemToe,
  verwijderMenuItem,
} from "./supabase.js";

export { BestellingenRoom };

// Alle bestellingen van één beurs leven in één Durable Object-instantie,
// zodat elk beheerscherm dat naar diezelfde beurs kijkt dezelfde live lijst
// ziet. Geen ?evenement= meegegeven (bv. de algemene QR-code) → de vaste
// "actief"-kamer, die zelf altijd de op dat moment actieve beurs opzoekt.
function getKamer(env, url) {
  const evenementParam = url.searchParams.get("evenement");
  const naam = evenementParam ? `evenement-${evenementParam}` : "actief";
  const id = env.BESTELLINGEN_ROOM.idFromName(naam);
  return env.BESTELLINGEN_ROOM.get(id);
}

function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  return request.headers.get("X-Admin-Password") === env.ADMIN_PASSWORD;
}

// Optioneel wachtwoord voor de algemene bestelpagina (zonder persoonlijke
// partnerlink). Is BESTEL_PASSWORD niet ingesteld, dan blijft die pagina open.
function bestelWachtwoordOk(request, env) {
  if (!env.BESTEL_PASSWORD) return true;
  return request.headers.get("X-Bestel-Password") === env.BESTEL_PASSWORD;
}

function foutRespons(err, status = 500) {
  return Response.json({ error: err.message || String(err) }, { status });
}

// Splitst één CSV-lijn. Excel in het Nederlands/Belgisch gebruikt ";" als
// scheiding, andere programma's "," of een tab; tussen aanhalingstekens mag
// de scheiding gewoon in een naam voorkomen.
function splitCsvLijn(lijn) {
  const buitenCitaat = lijn.replace(/"[^"]*"/g, "");
  const scheiding = buitenCitaat.includes(";") ? ";" : buitenCitaat.includes("\t") ? "\t" : ",";
  const velden = [];
  let huidig = "";
  let inCitaat = false;
  for (const teken of lijn) {
    if (teken === '"') inCitaat = !inCitaat;
    else if (teken === scheiding && !inCitaat) {
      velden.push(huidig);
      huidig = "";
    } else huidig += teken;
  }
  velden.push(huidig);
  return velden.map((v) => v.trim());
}

const CSV_KOPPEN = ["naam", "bedrijf", "bedrijfsnaam", "partner", "company"];

// Verwacht per lijn "bedrijfsnaam" + eventueel "tafelnummer". Een eerste lijn
// met kopteksten, een BOM van Excel en lege lijnen worden overgeslagen.
function parseStandenCsv(tekst) {
  return tekst
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((lijn) => lijn.trim())
    .filter((lijn) => lijn.length > 0)
    .map((lijn, index) => {
      const [naam = "", standNummer = ""] = splitCsvLijn(lijn);
      return { naam, standNummer, kop: index === 0 && CSV_KOPPEN.includes(naam.toLowerCase()) };
    })
    .filter((r) => r.naam && !r.kop)
    .map(({ naam, standNummer }) => ({ naam, standNummer }));
}

async function handleAdmin(request, env, url) {
  if (!isAdmin(request, env)) {
    return Response.json({ error: "Niet ingelogd als admin." }, { status: 401 });
  }

  const pad = url.pathname;

  try {
    if (pad === "/api/admin/evenementen" && request.method === "GET") {
      return Response.json(await haalEvenementen(env));
    }

    if (pad === "/api/admin/evenementen" && request.method === "POST") {
      const { naam } = await request.json();
      if (!naam || !naam.trim()) {
        return Response.json({ error: "Naam van de beurs is verplicht." }, { status: 400 });
      }
      return Response.json(await maakEvenement(env, naam.trim()), { status: 201 });
    }

    let m = pad.match(/^\/api\/admin\/evenementen\/(\d+)\/actief$/);
    if (m && request.method === "POST") {
      await zetActiefEvenement(env, parseInt(m[1], 10));
      return Response.json({ ok: true });
    }

    m = pad.match(/^\/api\/admin\/evenementen\/(\d+)\/standen$/);
    if (m && request.method === "GET") {
      return Response.json(await haalStandenBeheer(env, parseInt(m[1], 10)));
    }
    if (m && request.method === "POST") {
      const { naam, standNummer } = await request.json();
      if (!naam || !naam.trim()) {
        return Response.json({ error: "Bedrijfsnaam is verplicht." }, { status: 400 });
      }
      return Response.json(
        await voegStandToe(env, parseInt(m[1], 10), naam.trim(), standNummer),
        { status: 201 }
      );
    }

    m = pad.match(/^\/api\/admin\/evenementen\/(\d+)\/standen\/import$/);
    if (m && request.method === "POST") {
      const { csv } = await request.json();
      const rijen = parseStandenCsv(csv || "");
      if (rijen.length === 0) {
        return Response.json({ error: "Geen geldige rijen gevonden in de CSV." }, { status: 400 });
      }
      const toegevoegd = await voegStandenBulkToe(env, parseInt(m[1], 10), rijen);
      return Response.json({ aantal: toegevoegd.length, standen: toegevoegd }, { status: 201 });
    }

    m = pad.match(/^\/api\/admin\/standen\/(\d+)$/);
    if (m && request.method === "DELETE") {
      await verwijderStand(env, parseInt(m[1], 10));
      return Response.json({ ok: true });
    }

    m = pad.match(/^\/api\/admin\/evenementen\/(\d+)\/menu$/);
    if (m && request.method === "GET") {
      return Response.json(await haalMenuBeheer(env, parseInt(m[1], 10)));
    }
    if (m && request.method === "POST") {
      const { naam } = await request.json();
      if (!naam || !naam.trim()) {
        return Response.json({ error: "Naam van het drankje is verplicht." }, { status: 400 });
      }
      return Response.json(await voegMenuItemToe(env, parseInt(m[1], 10), naam.trim()), {
        status: 201,
      });
    }

    m = pad.match(/^\/api\/admin\/menu\/(\d+)$/);
    if (m && request.method === "DELETE") {
      await verwijderMenuItem(env, parseInt(m[1], 10));
      return Response.json({ ok: true });
    }
  } catch (err) {
    return foutRespons(err);
  }

  return new Response("Not found", { status: 404 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Laat de bestelpagina weten of er een wachtwoord nodig is en of het
    // meegestuurde wachtwoord klopt.
    if (url.pathname === "/api/bestel-login") {
      return Response.json({ beveiligd: !!env.BESTEL_PASSWORD, ok: bestelWachtwoordOk(request, env) });
    }

    if (url.pathname === "/api/admin/login") {
      return Response.json({ ok: isAdmin(request, env) }, { status: isAdmin(request, env) ? 200 : 401 });
    }

    if (url.pathname.startsWith("/api/admin/")) {
      return handleAdmin(request, env, url);
    }

    if (url.pathname === "/api/evenementen") {
      try {
        return Response.json(await haalEvenementen(env));
      } catch (err) {
        return foutRespons(err);
      }
    }

    if (url.pathname === "/api/menu") {
      try {
        const evenementId = url.searchParams.get("evenement") || (await getActiefEvenementId(env));
        return Response.json(await haalMenu(env, evenementId));
      } catch (err) {
        return foutRespons(err);
      }
    }

    if (url.pathname === "/api/standen") {
      try {
        const evenementId = url.searchParams.get("evenement") || (await getActiefEvenementId(env));
        return Response.json(await haalStanden(env, evenementId));
      } catch (err) {
        return foutRespons(err);
      }
    }

    // Zoekt welk bedrijf achter een partner-link (?token=...) zit, zonder
    // dat de link zelf de naam verklapt.
    if (url.pathname === "/api/stand-info") {
      try {
        const evenementId = url.searchParams.get("evenement") || (await getActiefEvenementId(env));
        const token = url.searchParams.get("token") || "";
        if (!token) {
          return Response.json({ error: "Geen token meegegeven." }, { status: 400 });
        }
        const stand = await haalStandDoorToken(env, evenementId, token);
        if (!stand) {
          return Response.json({ error: "Onbekende of verlopen link." }, { status: 404 });
        }
        return Response.json(stand);
      } catch (err) {
        return foutRespons(err);
      }
    }

    if (url.pathname === "/qr.png") {
      const bedrijf = (url.searchParams.get("bedrijf") || "").trim();
      const token = (url.searchParams.get("token") || "").trim();
      const evenement = url.searchParams.get("evenement");
      const basisUrl = `${url.origin}/`;
      const params = new URLSearchParams();
      if (token) {
        params.set("token", token);
      } else if (bedrijf) {
        params.set("bedrijf", bedrijf);
      }
      if (evenement) params.set("evenement", evenement);
      const query = params.toString();
      const bestelUrl = query ? `${basisUrl}?${query}` : basisUrl;
      try {
        // toBuffer() (PNG) leunt op Node-specifieke API's die niet volledig
        // beschikbaar zijn in de Workers-omgeving. toString met type "svg"
        // is pure tekst/XML-opbouw en werkt daardoor overal betrouwbaar.
        const svg = await QRCode.toString(bestelUrl, { type: "svg", width: 500, margin: 2 });
        return new Response(svg, { headers: { "Content-Type": "image/svg+xml" } });
      } catch (err) {
        return new Response(`Kon QR-code niet genereren: ${err.message}`, { status: 500 });
      }
    }

    const isBestellingenRoute =
      url.pathname === "/ws" ||
      url.pathname === "/api/bestellingen" ||
      /^\/api\/bestellingen\/\d+\/(nieuw|bezig|klaar|geleverd)$/.test(url.pathname);

    // Bestellen mag met een geldige persoonlijke partnerlink (token), of met
    // het wachtwoord van de algemene bestelpagina als dat is ingesteld.
    if (url.pathname === "/api/bestellingen" && request.method === "POST" && !bestelWachtwoordOk(request, env)) {
      let toegestaan = false;
      const token = request.headers.get("X-Stand-Token") || "";
      if (token) {
        try {
          const evenementId = url.searchParams.get("evenement") || (await getActiefEvenementId(env));
          toegestaan = !!(await haalStandDoorToken(env, evenementId, token));
        } catch {
          toegestaan = false;
        }
      }
      if (!toegestaan) {
        return Response.json(
          { error: "Wachtwoord vereist om te bestellen zonder persoonlijke link." },
          { status: 401 }
        );
      }
    }

    if (isBestellingenRoute) {
      return getKamer(env, url).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
