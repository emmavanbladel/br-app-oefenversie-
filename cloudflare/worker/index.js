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

function foutRespons(err, status = 500) {
  return Response.json({ error: err.message || String(err) }, { status });
}

// Verwacht platte tekst: per lijn "bedrijfsnaam,tafelnummer" (tafelnummer
// optioneel). Lege lijnen worden overgeslagen.
function parseStandenCsv(tekst) {
  return tekst
    .split(/\r?\n/)
    .map((lijn) => lijn.trim())
    .filter((lijn) => lijn.length > 0)
    .map((lijn) => {
      const [naam, standNummer] = lijn.split(",").map((v) => (v || "").trim());
      return { naam, standNummer };
    })
    .filter((r) => r.naam);
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

    if (url.pathname === "/qr.png") {
      const bedrijf = (url.searchParams.get("bedrijf") || "").trim();
      const evenement = url.searchParams.get("evenement");
      const basisUrl = `${url.origin}/`;
      const params = new URLSearchParams();
      if (bedrijf) params.set("bedrijf", bedrijf);
      if (evenement) params.set("evenement", evenement);
      const query = params.toString();
      const bestelUrl = query ? `${basisUrl}?${query}` : basisUrl;
      try {
        const buffer = await QRCode.toBuffer(bestelUrl, { width: 500, margin: 2 });
        return new Response(buffer, { headers: { "Content-Type": "image/png" } });
      } catch (err) {
        return new Response("Kon QR-code niet genereren.", { status: 500 });
      }
    }

    const isBestellingenRoute =
      url.pathname === "/ws" ||
      url.pathname === "/api/bestellingen" ||
      /^\/api\/bestellingen\/\d+\/(nieuw|bezig|klaar|geleverd)$/.test(url.pathname);

    if (isBestellingenRoute) {
      return getKamer(env, url).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
