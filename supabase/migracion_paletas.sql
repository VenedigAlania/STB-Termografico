-- Ejecutar en Supabase > SQL Editor si el esquema ya estaba instalado.
alter table public."tbTermoInspecciones" alter column "Temperatura" drop not null;

create table if not exists public."tbTermoPaletas" (
  "Paleta" text primary key,
  "TemperaturaMinima" numeric not null,
  "TemperaturaMaxima" numeric not null,
  "Emisividad" numeric not null default 0.95,
  "Distancia" numeric not null default 1,
  "Activo" boolean not null default true,
  "updated_at" timestamptz not null default now()
);
alter table public."tbTermoPaletas" enable row level security;
insert into public."tbTermoPaletas" ("Paleta","TemperaturaMinima","TemperaturaMaxima","Emisividad","Distancia") values
('Hierro',20,120,0.95,1),('Arcoíris',20,150,0.95,1),('Blanco caliente',15,100,0.95,1),
('Negro caliente',15,100,0.95,1),('Escala de grises',20,120,0.95,1),('Otra',20,100,0.95,1)
on conflict ("Paleta") do nothing;
notify pgrst, 'reload schema';
