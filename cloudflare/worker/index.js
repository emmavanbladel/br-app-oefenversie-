import QRCode from "qrcode";
import { BestellingenRoom } from "./bestellingen-room.js";
import {
  maakClient,
  haalActiefEvenementId,
  haalMenu,
  haalStanden,
  haalStand,
  maakBestelling,
  markeerGeleverd,
  haalBestellingen,
  importeerStanden,
  importeerMenu,
  verwijderStand,
  verwijderMenuItem,
  haalEvenementen,
  maakNieuwEvenement,
  activeerEvenement,
} from "./supabase.js";

export { BestellingenRoom };

// Eén Durable Object-instantie zendt live updates uit naar alle verbonden
// beheerschermen (zie bestellingen-room.js) - de bestellingen zelf leven in
// Supabase, niet meer in deze room.
function getKamer(env) {
  const id = env.BESTELLINGEN_ROOM.idFromName("evenement");
  return env.BESTELLINGEN_ROOM.get(id);
}

async function zendUit(env, type, data) {
  await getKamer(env).fetch("https://intern/uitzenden", {
    method: "POST",
    body: JSON.stringify({ type, data }),
  });
}

function foutRespons(err, status = 500) {
  return Response.json({ error: err.message || "Er ging iets mis." }, { status });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const supabase = maakClient(env);

    try {
      if (url.pathname === "/api/menu" && request.method === "GET") {
        const evenementId = await haalActiefEvenementId(supabase);
        const items = await haalMenu(supabase, evenementId);
        return Response.json(items.map((i) => i.naam));
      }

      if (url.pathname === "/api/standen" && request.method === "GET") {
        const evenementId = await haalActiefEvenementId(supabase);
        const standen = await haalStanden(supabase, evenementId);
        return Response.json(standen);
      }

      const standMatch = url.pathname.match(/^\/api\/standen\/(\d+)$/);
      if (standMatch && request.method === "GET") {
        const evenementId = await haalActiefEvenementId(supabase);
        const resultaat = await haalStand(supabase, Number(standMatch[1]), evenementId);
        if (resultaat.status === "niet_gevonden") {
          return Response.json({ error: "niet_gevonden" }, { status: 404 });
        }
        if (resultaat.status === "verlopen") {
          return Response.json({ error: "verlopen" }, { status: 410 });
        }
        return Response.json(resultaat.stand);
      }

      if (url.pathname === "/qr.png") {
        const standId = url.searchParams.get("stand_id");
        const basisUrl = `${url.origin}/`;
        const bestelUrl = standId ? `${basisUrl}?stand=${encodeURIComponent(standId)}` : basisUrl;
        const buffer = await QRCode.toBuffer(bestelUrl, { width: 500, margin: 2 });
        return new Response(buffer, { headers: { "Content-Type": "image/png" } });
      }

      if (url.pathname === "/ws") {
        return getKamer(env).fetch(request);
      }

      if (url.pathname === "/api/bestellingen" && request.method === "GET") {
        const evenementId = await haalActiefEvenementId(supabase);
        const bestellingen = await haalBestellingen(supabase, evenementId);
        return Response.json(bestellingen);
      }

      if (url.pathname === "/api/bestellingen" && request.method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Ongeldige aanvraag." }, { status: 400 });
        }
        const { stand_id, bedrijf, dranken } = body;

        if (!stand_id && (!bedrijf || typeof bedrijf !== "string" || !bedrijf.trim())) {
          return Response.json({ error: "Bedrijfs-/standnaam is verplicht." }, { status: 400 });
        }
        if (!Array.isArray(dranken) || dranken.length === 0) {
          return Response.json({ error: "Kies minstens één drankje." }, { status: 400 });
        }

        const evenementId = await haalActiefEvenementId(supabase);
        let nieuweBestelling;
        try {
          nieuweBestelling = await maakBestelling(supabase, evenementId, { standId: stand_id, bedrijf, dranken });
        } catch (err) {
          return Response.json({ error: err.message }, { status: 400 });
        }

        await zendUit(env, "nieuwe-bestelling", nieuweBestelling);
        return Response.json(nieuweBestelling, { status: 201 });
      }

      const geleverdMatch = url.pathname.match(/^\/api\/bestellingen\/(\d+)\/geleverd$/);
      if (geleverdMatch && request.method === "POST") {
        const bestelling = await markeerGeleverd(supabase, Number(geleverdMatch[1]));
        if (!bestelling) {
          return Response.json({ error: "Bestelling niet gevonden." }, { status: 404 });
        }
        await zendUit(env, "bestelling-bijgewerkt", bestelling);
        return Response.json(bestelling);
      }

      // ---- Beheer: standen ----

      if (url.pathname === "/api/admin/standen/importeer" && request.method === "POST") {
        const { tekst } = await request.json();
        const evenementId = await haalActiefEvenementId(supabase);
        const nieuw = await importeerStanden(supabase, evenementId, tekst || "");
        return Response.json({ toegevoegd: nieuw });
      }

      const verwijderStandMatch = url.pathname.match(/^\/api\/admin\/standen\/(\d+)$/);
      if (verwijderStandMatch && request.method === "DELETE") {
        await verwijderStand(supabase, Number(verwijderStandMatch[1]));
        return new Response(null, { status: 204 });
      }

      // ---- Beheer: menu ----

      if (url.pathname === "/api/admin/menu" && request.method === "GET") {
        const evenementId = await haalActiefEvenementId(supabase);
        const items = await haalMenu(supabase, evenementId);
        return Response.json(items);
      }

      if (url.pathname === "/api/admin/menu/importeer" && request.method === "POST") {
        const { tekst } = await request.json();
        const evenementId = await haalActiefEvenementId(supabase);
        const nieuw = await importeerMenu(supabase, evenementId, tekst || "");
        return Response.json({ toegevoegd: nieuw });
      }

      const verwijderMenuMatch = url.pathname.match(/^\/api\/admin\/menu\/(\d+)$/);
      if (verwijderMenuMatch && request.method === "DELETE") {
        await verwijderMenuItem(supabase, Number(verwijderMenuMatch[1]));
        return new Response(null, { status: 204 });
      }

      // ---- Beheer: evenementen ----

      if (url.pathname === "/api/admin/evenementen" && request.method === "GET") {
        const evenementen = await haalEvenementen(supabase);
        return Response.json(evenementen);
      }

      if (url.pathname === "/api/admin/evenementen" && request.method === "POST") {
        const { naam } = await request.json();
        if (!naam || !naam.trim()) {
          return Response.json({ error: "Naam van het evenement is verplicht." }, { status: 400 });
        }
        const id = await maakNieuwEvenement(supabase, naam);
        return Response.json({ id }, { status: 201 });
      }

      const activeerMatch = url.pathname.match(/^\/api\/admin\/evenementen\/(\d+)\/activeren$/);
      if (activeerMatch && request.method === "POST") {
        await activeerEvenement(supabase, Number(activeerMatch[1]));
        return new Response(null, { status: 204 });
      }

      return env.ASSETS.fetch(request);
    } catch (err) {
      return foutRespons(err);
    }
  },
};
