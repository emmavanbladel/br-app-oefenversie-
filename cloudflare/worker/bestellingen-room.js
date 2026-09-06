// Eén Durable Object-instantie houdt de live WebSocket-verbindingen van alle
// verbonden beheerschermen bij en zendt updates naar hen door. De bestellingen
// zelf leven niet meer hier, maar in Supabase (zie worker/supabase.js) - deze
// room is enkel nog een "omroepstation": worker/index.js roept /uitzenden aan
// nadat een schrijf naar Supabase is gelukt, en die boodschap gaat dan naar elk
// verbonden scherm.
export class BestellingenRoom {
  constructor(ctx) {
    this.ctx = ctx;
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

    if (url.pathname === "/uitzenden" && request.method === "POST") {
      const { type, data } = await request.json();
      this.uitzenden(type, data);
      return new Response(null, { status: 204 });
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
