-- Ekonomika Drankjesapp - Supabase schema
--
-- Al toegepast op het Supabase-project via migraties (zie project "ekonomika-drankjes").
-- Dit bestand is de referentie-kopie: als je ooit een nieuw Supabase-project opzet
-- (bv. voor een test-omgeving), plak je dit in de SQL Editor om dezelfde structuur
-- opnieuw aan te maken.

create table evenementen (
  id bigint generated always as identity primary key,
  naam text not null,
  aangemaakt_op timestamptz not null default now()
);

-- Eén rij (id = 1) die aanwijst welk evenement "vandaag" actief is.
-- Alles hieronder wordt overal gefilterd op dit ene actieve evenement.
create table instellingen (
  id smallint primary key check (id = 1),
  actief_evenement_id bigint references evenementen(id)
);

create table standen (
  id bigint generated always as identity primary key,
  evenement_id bigint not null references evenementen(id) on delete restrict,
  naam text not null,
  aangemaakt_op timestamptz not null default now()
);
create index standen_evenement_id_idx on standen(evenement_id);

create table menu_items (
  id bigint generated always as identity primary key,
  evenement_id bigint not null references evenementen(id) on delete restrict,
  naam text not null,
  aangemaakt_op timestamptz not null default now()
);
create index menu_items_evenement_id_idx on menu_items(evenement_id);

-- bedrijf_naam is een momentopname van de standnaam op bestelmoment, zodat een
-- latere wijziging/verwijdering van de stand de historiek van de bestelling niet
-- verandert. evenement_id staat er ook rechtstreeks op (niet enkel via stand_id),
-- zodat rapportage blijft werken zelfs als stand_id ooit null wordt.
create table bestellingen (
  id bigint generated always as identity primary key,
  evenement_id bigint not null references evenementen(id) on delete restrict,
  stand_id bigint references standen(id) on delete set null,
  bedrijf_naam text not null,
  status text not null default 'nieuw' check (status in ('nieuw','geleverd')),
  tijdstip timestamptz not null default now()
);
create index bestellingen_evenement_id_idx on bestellingen(evenement_id);
create index bestellingen_stand_id_idx on bestellingen(stand_id);

-- naam is ook hier een momentopname (van het drankje), om dezelfde reden.
create table bestelling_items (
  id bigint generated always as identity primary key,
  bestelling_id bigint not null references bestellingen(id) on delete cascade,
  naam text not null,
  aantal int not null check (aantal > 0)
);
create index bestelling_items_bestelling_id_idx on bestelling_items(bestelling_id);

-- Enkel de Worker praat met Supabase, en enkel via de service_role key (die RLS
-- omzeilt). RLS staat hier aan als extra veiligheidslaag, zonder policies dus
-- standaard alles dicht voor elke andere sleutel.
alter table evenementen enable row level security;
alter table instellingen enable row level security;
alter table standen enable row level security;
alter table menu_items enable row level security;
alter table bestellingen enable row level security;
alter table bestelling_items enable row level security;

-- Eerste evenement + actieve-evenement-rij bootstrappen (eenmalig - de
-- "nieuw evenement starten"-knop in instellingen.html kan dit niet doen
-- omdat instellingen dan nog geen rij heeft).
with nieuw_evenement as (
  insert into evenementen (naam) values ('Ekonomika Jobbeurs') returning id
)
insert into instellingen (id, actief_evenement_id)
select 1, id from nieuw_evenement;
