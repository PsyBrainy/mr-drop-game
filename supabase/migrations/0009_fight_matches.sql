-- =============================================================================
-- Mister Drop · partidas de pelea
--
-- Las escribe psy-ws (el servidor de la pelea online) cuando un match termina.
-- Guarda el log de inputs completo: con la semilla y esa cadena, la simulacion
-- reconstruye la partida entera, que es de donde sale la validacion del
-- resultado y la posibilidad de reproducir un bug exacto.
--
-- Dos banderas mandan sobre si una fila puede contar para algo:
--
--   verified_players  los dos jugadores tenian identidad verificada contra
--                     Supabase. Con el servidor en modo invitados queda en
--                     false: no se sabe quienes eran.
--   validated         el resultado ya fue confirmado re-simulando el replay.
--                     Nace en false SIEMPRE: el servidor guarda lo que dijeron
--                     los clientes, no lo que verifico.
--
-- Cualquier ranking de peleas tiene que filtrar por las dos. Estan como dato de
-- la fila y no como permiso del servidor a proposito: asi no hay forma de que
-- se le pase a quien consulte.
-- =============================================================================

create table if not exists public.fight_matches (
  id uuid primary key,
  seed integer not null,
  -- El id de usuario de Supabase, o "invitado-xxxx" si nadie los verifico. Es
  -- texto y no una fk a auth.users justamente porque puede no ser un usuario.
  player_one text not null,
  player_two text not null,
  -- 0, 1 o null. Null es empate, desync o desacuerdo entre los clientes.
  winner smallint check (winner in (0, 1)),
  ending text not null check (ending in ('decided', 'forfeit', 'desync', 'disagreement', 'abandoned')),
  frames integer not null check (frames >= 0),
  -- El log de inputs: cuatro digitos hexadecimales por frame (un byte por
  -- jugador). Tres minutos de partida son unos 43 KB.
  replay text not null,
  verified_players boolean not null default false,
  validated boolean not null default false,
  finished_at timestamptz not null default now()
);

-- Para buscar las partidas de una persona, que es lo que va a pedir el ranking.
create index if not exists fight_matches_player_one_idx on public.fight_matches (player_one);
create index if not exists fight_matches_player_two_idx on public.fight_matches (player_two);
-- Para la cola de validacion: las que terminaron bien y nadie re-simulo todavia.
create index if not exists fight_matches_pending_idx
  on public.fight_matches (finished_at)
  where validated = false and ending = 'decided';

alter table public.fight_matches enable row level security;

-- Nadie escribe desde el navegador: la unica escritura es la de psy-ws con la
-- clave de servicio, que saltea RLS. Un cliente que pudiera insertar filas aca
-- seria un cliente que escribe su propio resultado.
create policy "un jugador ve sus propias peleas"
  on public.fight_matches
  for select
  to authenticated
  using (auth.uid()::text in (player_one, player_two));

notify pgrst, 'reload schema';
