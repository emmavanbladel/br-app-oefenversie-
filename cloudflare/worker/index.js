import QRCode from "qrcode";
import { BestellingenRoom } from "./bestellingen-room.js";
import menu from "../../menu.js";
import standen from "../../standen.js";

export { BestellingenRoom };

// Alle bestellingen van het evenement leven in één Durable Object-instantie,
// zodat elk beheerscherm dezelfde live lijst ziet (vergelijkbaar met de ene
// in-memory array in de Node-versie).
function getKamer(env) {
  const id = env.BESTELLINGEN_ROOM.idFromName("evenement");
  return env.BESTELLINGEN_ROOM.get(id);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/menu") {
      return Response.json(menu);
    }

    if (url.pathname === "/api/standen") {
      return Response.json(standen);
    }

    if (url.pathname === "/qr.png") {
      const bedrijf = (url.searchParams.get("bedrijf") || "").trim();
      const basisUrl = `${url.origin}/`;
      const bestelUrl = bedrijf ? `${basisUrl}?bedrijf=${encodeURIComponent(bedrijf)}` : basisUrl;
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
      /^\/api\/bestellingen\/\d+\/geleverd$/.test(url.pathname);

    if (isBestellingenRoute) {
      return getKamer(env).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
