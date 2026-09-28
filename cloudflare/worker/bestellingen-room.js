import { getActiefEvenementId, haalBestellingen, maakBestelling, zetBestellingStatus } from "./supabase.js";

// Deze Durable Object bewaart zelf geen bestellingen meer (dat gebeurt in
// Supabase) — ze is enkel nog de live verbinding: houdt de WebSockets van de
// beheerschermen bij en zendt uit zodra er iets wijzigt in de database.
// Eén instantie per beurs (zie getKamer() in index.js), zodat een
// beheerscherm enkel de bestellingen van de gekozen beurs live binnenkrijgt.
export class BestellingenRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async evenementId(url) {
    const opgegeven = url.searchParams.get("evenement");
    if (opgegeven) return parseInt(opgegeven, 10);
    return getActiefEvenementId(this.env);
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Verwacht een WebSocket-upgrade", { status: 426 });
      }
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    try {
      if (url.pathname === "/api/bestellingen" && request.method === "GET") {
        const evenementId = await this.evenementId(url);
        return Response.json(await haalBestellingen(this.env, evenementId));
      }

      if (url.pathname === "/api/bestellingen" && request.method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Ongeldige aanvraag." }, { status: 400 });
        }
        const { bedrijf, dranken } = body;

        if (!bedrijf || typeof bedrijf !== "string" || !bedrijf.trim()) {
          return Response.json({ error: "Bedrijfs-/standnaam is verplicht." }, { status: 400 });
        }
        if (!Array.isArray(dranken) || dranken.length === 0) {
          return Response.json({ error: "Kies minstens één drankje." }, { status: 400 });
        }

        const evenementId = await this.evenementId(url);
        const nieuweBestelling = await maakBestelling(this.env, evenementId, bedrijf.trim(), dranken);
        this.uitzenden("nieuwe-bestelling", nieuweBestelling);
        return Response.json(nieuweBestelling, { status: 201 });
      }

      const match = url.pathname.match(/^\/api\/bestellingen\/(\d+)\/(nieuw|bezig|klaar|geleverd)$/);
      if (match && request.method === "POST") {
        const id = parseInt(match[1], 10);
        const status = match[2];
        const evenementId = await this.evenementId(url);
        const bestelling = await zetBestellingStatus(this.env, evenementId, id, status);
        if (!bestelling) {
          return Response.json({ error: "Bestelling niet gevonden." }, { status: 404 });
        }
        this.uitzenden("bestelling-bijgewerkt", bestelling);
        return Response.json(bestelling);
      }
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500 });
    }

    return new Response("Not found", { status: 404 });
  }

  uitzenden(type, data) {
    const bericht = JSON.stringify({ type, data });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(bericht);
      } catch {
        // verbinding is intussen weg; niets aan te doen
      }
    }
  }

  // Vereist door de Hibernation API, ook al verwachten we zelf geen
  // berichten van het beheerscherm.
  async webSocketMessage() {}
  async webSocketClose(ws) {
    try {
      ws.close();
    } catch {
      // al gesloten
    }
  }
  async webSocketError() {}
}
