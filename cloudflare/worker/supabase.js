import { createClient } from "@supabase/supabase-js";

// Wordt per aanvraag aangemaakt: env-bindings/secrets zijn in een Worker enkel
// beschikbaar binnen fetch(request, env), niet op module-niveau.
export function maakClient(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });
}

export async function haalActiefEvenementId(supabase) {
  const { data, error } = await supabase
    .from("instellingen")
    .select("actief_evenement_id")
    .eq("id", 1)
    .single();
  if (error) throw new Error(`Kon actief evenement niet ophalen: ${error.message}`);
  return data.actief_evenement_id;
}

export async function haalMenu(supabase, evenementId) {
  const { data, error } = await supabase
    .from("menu_items")
    .select("id, naam")
    .eq("evenement_id", evenementId)
    .order("id", { ascending: true });
  if (error) throw new Error(`Kon menu niet ophalen: ${error.message}`);
  return data;
}

export async function haalStanden(supabase, evenementId) {
  const { data, error } = await supabase
    .from("standen")
    .select("id, naam")
    .eq("evenement_id", evenementId)
    .order("id", { ascending: true });
  if (error) throw new Error(`Kon standen niet ophalen: ${error.message}`);
  return data;
}

// Geeft { status: "ok", stand } | { status: "niet_gevonden" } | { status: "verlopen" } terug.
export async function haalStand(supabase, id, actiefEvenementId) {
  const { data, error } = await supabase
    .from("standen")
    .select("id, naam, evenement_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Kon stand niet ophalen: ${error.message}`);
  if (!data) return { status: "niet_gevonden" };
  if (data.evenement_id !== actiefEvenementId) return { status: "verlopen" };
  return { status: "ok", stand: { id: data.id, naam: data.naam } };
}

// bedrijf: gebruikt wanneer er geen stand_id is (manuele invoer) - zoekt een
// bestaande stand met die naam op (ongevoelig voor hoofdletters/spaties), of
// maakt er automatisch één aan zodat getypte namen ook standen worden.
async function vindOfMaakStand(supabase, evenementId, bedrijf) {
  const naam = bedrijf.trim();
  const { data: bestaande, error: zoekFout } = await supabase
    .from("standen")
    .select("id, naam")
    .eq("evenement_id", evenementId)
    .ilike("naam", naam)
    .maybeSingle();
  if (zoekFout) throw new Error(`Kon stand niet opzoeken: ${zoekFout.message}`);
  if (bestaande) return bestaande;

  const { data: nieuwe, error: maakFout } = await supabase
    .from("standen")
    .insert({ evenement_id: evenementId, naam })
    .select("id, naam")
    .single();
  if (maakFout) throw new Error(`Kon stand niet aanmaken: ${maakFout.message}`);
  return nieuwe;
}

// dranken: [{naam, aantal}]. Retourneert de bestelling in dezelfde vorm als
// vroeger ({id, bedrijf, dranken, status, tijdstip}), zodat beheer.html/index.html
// ongewijzigd blijven werken.
export async function maakBestelling(supabase, evenementId, { standId, bedrijf, dranken }) {
  let stand;
  if (standId) {
    const resultaat = await haalStand(supabase, standId, evenementId);
    if (resultaat.status !== "ok") throw new Error("Ongeldige of verlopen stand.");
    stand = resultaat.stand;
  } else {
    stand = await vindOfMaakStand(supabase, evenementId, bedrijf);
  }

  const { data: bestelling, error: bestelFout } = await supabase
    .from("bestellingen")
    .insert({
      evenement_id: evenementId,
      stand_id: stand.id,
      bedrijf_naam: stand.naam,
      status: "nieuw",
    })
    .select("id, bedrijf_naam, status, tijdstip")
    .single();
  if (bestelFout) throw new Error(`Kon bestelling niet aanmaken: ${bestelFout.message}`);

  const regels = dranken.map((d) => ({ bestelling_id: bestelling.id, naam: d.naam, aantal: d.aantal }));
  const { error: regelsFout } = await supabase.from("bestelling_items").insert(regels);
  if (regelsFout) throw new Error(`Kon bestelde drankjes niet opslaan: ${regelsFout.message}`);

  return {
    id: bestelling.id,
    bedrijf: bestelling.bedrijf_naam,
    dranken,
    status: bestelling.status,
    tijdstip: bestelling.tijdstip,
  };
}

export async function markeerGeleverd(supabase, id) {
  const { data, error } = await supabase
    .from("bestellingen")
    .update({ status: "geleverd" })
    .eq("id", id)
    .select("id, bedrijf_naam, status, tijdstip")
    .maybeSingle();
  if (error) throw new Error(`Kon bestelling niet bijwerken: ${error.message}`);
  if (!data) return null;

  const { data: items, error: itemsFout } = await supabase
    .from("bestelling_items")
    .select("naam, aantal")
    .eq("bestelling_id", id);
  if (itemsFout) throw new Error(`Kon bestelde drankjes niet ophalen: ${itemsFout.message}`);

  return {
    id: data.id,
    bedrijf: data.bedrijf_naam,
    dranken: items,
    status: data.status,
    tijdstip: data.tijdstip,
  };
}

export async function haalBestellingen(supabase, evenementId) {
  const { data, error } = await supabase
    .from("bestellingen")
    .select("id, bedrijf_naam, status, tijdstip, bestelling_items(naam, aantal)")
    .eq("evenement_id", evenementId)
    .order("tijdstip", { ascending: false });
  if (error) throw new Error(`Kon bestellingen niet ophalen: ${error.message}`);
  return data.map((b) => ({
    id: b.id,
    bedrijf: b.bedrijf_naam,
    dranken: b.bestelling_items,
    status: b.status,
    tijdstip: b.tijdstip,
  }));
}

// Plakt een lijst namen (één per lijn) bij een bestaande lijst, negeert lege
// regels en exacte duplicaten die al bestaan voor dit evenement.
async function importeerNamen(supabase, tabel, evenementId, tekst) {
  const gewenst = [...new Set(
    tekst.split("\n").map((r) => r.trim()).filter(Boolean)
  )];
  if (gewenst.length === 0) return [];

  const { data: bestaande, error: leesFout } = await supabase
    .from(tabel)
    .select("naam")
    .eq("evenement_id", evenementId);
  if (leesFout) throw new Error(`Kon bestaande lijst niet lezen: ${leesFout.message}`);
  const bestaandeNamen = new Set(bestaande.map((r) => r.naam.toLowerCase()));

  const nieuw = gewenst.filter((naam) => !bestaandeNamen.has(naam.toLowerCase()));
  if (nieuw.length > 0) {
    const { error: schrijfFout } = await supabase
      .from(tabel)
      .insert(nieuw.map((naam) => ({ evenement_id: evenementId, naam })));
    if (schrijfFout) throw new Error(`Kon lijst niet aanvullen: ${schrijfFout.message}`);
  }
  return nieuw;
}

export const importeerStanden = (supabase, evenementId, tekst) =>
  importeerNamen(supabase, "standen", evenementId, tekst);

export const importeerMenu = (supabase, evenementId, tekst) =>
  importeerNamen(supabase, "menu_items", evenementId, tekst);

export async function verwijderStand(supabase, id) {
  const { error } = await supabase.from("standen").delete().eq("id", id);
  if (error) throw new Error(`Kon stand niet verwijderen: ${error.message}`);
}

export async function verwijderMenuItem(supabase, id) {
  const { error } = await supabase.from("menu_items").delete().eq("id", id);
  if (error) throw new Error(`Kon drankje niet verwijderen: ${error.message}`);
}

export async function haalEvenementen(supabase) {
  const [{ data: evenementen, error: evFout }, actiefId] = await Promise.all([
    supabase.from("evenementen").select("id, naam, aangemaakt_op").order("aangemaakt_op", { ascending: false }),
    haalActiefEvenementId(supabase),
  ]);
  if (evFout) throw new Error(`Kon evenementen niet ophalen: ${evFout.message}`);
  return evenementen.map((e) => ({ ...e, actief: e.id === actiefId }));
}

export async function maakNieuwEvenement(supabase, naam) {
  const { data, error } = await supabase
    .from("evenementen")
    .insert({ naam: naam.trim() })
    .select("id")
    .single();
  if (error) throw new Error(`Kon evenement niet aanmaken: ${error.message}`);
  await activeerEvenement(supabase, data.id);
  return data.id;
}

export async function activeerEvenement(supabase, id) {
  const { error } = await supabase.from("instellingen").update({ actief_evenement_id: id }).eq("id", 1);
  if (error) throw new Error(`Kon evenement niet activeren: ${error.message}`);
}
