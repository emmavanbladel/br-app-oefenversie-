// Eén Durable Object-instantie houdt alle bestellingen van het evenement bij
// (net als de in-memory lijst in de Node-versie) en stuurt updates live door
// naar elk verbonden beheerscherm via WebSockets.
export class BestellingenRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.bestellingen = [];
    this.volgendId = 1;
    this.klaar = ctx.blockConcurrencyWhile(async () => {
      const opgeslagen = await ctx.storage.get("bestellingen");
      const opgeslagenId = await ctx.storage.get("volgendId");
      if (opgeslagen) this.bestellingen = opgeslagen;
      if (opgeslagenId) this.volgendId = opgeslagenId;
    });
  }

  async fetch(request) {
    await this.klaar;
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Verwacht een WebSocket-upgrade", { status: 426 });
      }
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    if (url.pathname === "/api/bestellingen" && request.method === "GET") {
      return Response.json(this.bestellingen);
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

      const nieuweBestelling = {
        id: this.volgendId++,
        bedrijf: bedrijf.trim(),
        dranken,
        status: "nieuw",
        tijdstip: new Date().toISOString(),
      };

      this.bestellingen.unshift(nieuweBestelling);
      await this.bewaar();
      this.uitzenden("nieuwe-bestelling", nieuweBestelling);

      return Response.json(nieuweBestelling, { status: 201 });
    }

    const match = url.pathname.match(/^\/api\/bestellingen\/(\d+)\/geleverd$/);
    if (match && request.method === "POST") {
      const id = parseInt(match[1], 10);
      const bestelling = this.bestellingen.find((b) => b.id === id);
      if (!bestelling) {
        return Response.json({ error: "Bestelling niet gevonden." }, { status: 404 });
      }
      bestelling.status = "geleverd";
      await this.bewaar();
      this.uitzenden("bestelling-bijgewerkt", bestelling);
      return Response.json(bestelling);
    }

    return new Response("Not found", { status: 404 });
  }

  async bewaar() {
    await this.ctx.storage.put("bestellingen", this.bestellingen);
    await this.ctx.storage.put("volgendId", this.volgendId);
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
