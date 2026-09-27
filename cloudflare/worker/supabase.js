// Kleine, afhankelijkheidsvrije helper om met de Supabase REST-API (PostgREST)
// te praten. Gebruikt de service_role-sleutel, die enkel hier in de Worker
// leeft (nooit naar de browser gestuurd) en Row Level Security omzeilt.

async function supabaseFetch(env, path, init = {}) {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    const tekst = await res.text().catch(() => "");
    throw new Error(`Supabase-fout (${res.status}) op ${path}: ${tekst}`);
  }
  // Een POST/PATCH/DELETE zonder "Prefer: return=representation" komt terug
  // met een lege body — niets om te parsen dan.
  const tekst = await res.text();
  return tekst ? JSON.parse(tekst) : null;
}

// ---- Actieve beurs ----

// Welke beurs is er op dit moment actief? Bepaalt welk menu/welke standen/
// bestellingen de app toont wanneer een link geen expliciete ?evenement=
// meegeeft (bv. de algemene QR-code).
export async function getActiefEvenementId(env) {
  const rijen = await supabaseFetch(env, "instellingen?select=actief_evenement_id&limit=1");
  const id = rijen?.[0]?.actief_evenement_id;
  if (!id) {
    throw new Error("Geen actieve beurs ingesteld in de tabel 'instellingen'.");
  }
  return id;
}

export async function zetActiefEvenement(env, evenementId) {
  await supabaseFetch(env, "instellingen?id=eq.1", {
    method: "PATCH",
    body: JSON.stringify({ actief_evenement_id: evenementId }),
  });
}

// ---- Bestelpagina ----

export async function haalMenu(env, evenementId) {
  const rijen = await supabaseFetch(
    env,
    `menu_items?evenement_id=eq.${evenementId}&select=naam&order=id.asc`
  );
  return rijen.map((r) => r.naam);
}

export async function haalStanden(env, evenementId) {
  const rijen = await supabaseFetch(
    env,
    `standen?evenement_id=eq.${evenementId}&select=naam&order=id.asc`
  );
  return rijen.map((r) => r.naam);
}

function mapBestelling(row) {
  return {
    id: row.id,
    bedrijf: row.bedrijf_naam,
    dranken: (row.bestelling_items || []).map((d) => ({ naam: d.naam, aantal: d.aantal })),
    status: row.status,
    tijdstip: row.tijdstip,
  };
}

export async function haalBestellingen(env, evenementId) {
  const rijen = await supabaseFetch(
    env,
    `bestellingen?evenement_id=eq.${evenementId}&select=id,bedrijf_naam,status,tijdstip,bestelling_items(naam,aantal)&order=tijdstip.desc`
  );
  return rijen.map(mapBestelling);
}

export async function maakBestelling(env, evenementId, bedrijf, dranken) {
  let standId = null;
  const standenMatch = await supabaseFetch(
    env,
    `standen?evenement_id=eq.${evenementId}&naam=eq.${encodeURIComponent(bedrijf)}&select=id&limit=1`
  );
  if (standenMatch?.[0]) standId = standenMatch[0].id;

  const [nieuw] = await supabaseFetch(env, "bestellingen", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      evenement_id: evenementId,
      stand_id: standId,
      bedrijf_naam: bedrijf,
      status: "nieuw",
    }),
  });

  await supabaseFetch(env, "bestelling_items", {
    method: "POST",
    body: JSON.stringify(
      dranken.map((d) => ({ bestelling_id: nieuw.id, naam: d.naam, aantal: d.aantal }))
    ),
  });

  return mapBestelling({ ...nieuw, bestelling_items: dranken });
}

export async function markeerGeleverd(env, evenementId, id) {
  const rijen = await supabaseFetch(
    env,
    `bestellingen?id=eq.${id}&evenement_id=eq.${evenementId}&select=id,bedrijf_naam,status,tijdstip`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "geleverd" }),
    }
  );
  if (!rijen?.[0]) return null;

  const items = await supabaseFetch(env, `bestelling_items?bestelling_id=eq.${id}&select=naam,aantal`);
  return mapBestelling({ ...rijen[0], bestelling_items: items });
}

// ---- Admin: beurzen ----

export async function haalEvenementen(env) {
  const [evenementen, instellingen] = await Promise.all([
    supabaseFetch(env, "evenementen?select=id,naam,aangemaakt_op&order=id.asc"),
    supabaseFetch(env, "instellingen?select=actief_evenement_id&limit=1"),
  ]);
  const actiefId = instellingen?.[0]?.actief_evenement_id ?? null;
  return evenementen.map((e) => ({ ...e, actief: e.id === actiefId }));
}

export async function maakEvenement(env, naam) {
  const [nieuw] = await supabaseFetch(env, "evenementen", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ naam }),
  });
  return nieuw;
}

// ---- Admin: standen (partners) ----

export async function haalStandenBeheer(env, evenementId) {
  return supabaseFetch(
    env,
    `standen?evenement_id=eq.${evenementId}&select=id,naam,stand_nummer&order=naam.asc`
  );
}

export async function voegStandToe(env, evenementId, naam, standNummer) {
  const [nieuw] = await supabaseFetch(env, "standen", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      evenement_id: evenementId,
      naam,
      stand_nummer: standNummer || null,
    }),
  });
  return nieuw;
}

export async function voegStandenBulkToe(env, evenementId, rijen) {
  const body = rijen.map((r) => ({
    evenement_id: evenementId,
    naam: r.naam,
    stand_nummer: r.standNummer || null,
  }));
  return supabaseFetch(env, "standen", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
}

export async function verwijderStand(env, id) {
  await supabaseFetch(env, `standen?id=eq.${id}`, { method: "DELETE" });
}

// ---- Admin: menu ----

export async function haalMenuBeheer(env, evenementId) {
  return supabaseFetch(env, `menu_items?evenement_id=eq.${evenementId}&select=id,naam&order=naam.asc`);
}

export async function voegMenuItemToe(env, evenementId, naam) {
  const [nieuw] = await supabaseFetch(env, "menu_items", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ evenement_id: evenementId, naam }),
  });
  return nieuw;
}

export async function verwijderMenuItem(env, id) {
  await supabaseFetch(env, `menu_items?id=eq.${id}`, { method: "DELETE" });
}
