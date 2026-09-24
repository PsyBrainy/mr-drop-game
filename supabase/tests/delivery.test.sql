-- =============================================================================
-- Escenarios del reparto (0012 / 0013): RLS, turnos, bolsa, transiciones.
--
-- Cada bloque "es" alguien (set request.jwt.claim.sub) y prueba lo que la base
-- le deja y no le deja hacer. Si algo de acá rompe, lo que se rompió es una
-- regla de la base, no de la UI: la app Android confía en estas mismas reglas.
-- =============================================================================
\set ON_ERROR_STOP 1

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000a','admin@x'),
 ('00000000-0000-0000-0000-0000000000c1','c1@x'),
 ('00000000-0000-0000-0000-0000000000c2','c2@x'),
 ('00000000-0000-0000-0000-0000000000a1','u1@x'),
 ('00000000-0000-0000-0000-0000000000a2','u2@x');
update profiles set role='admin' where id='00000000-0000-0000-0000-00000000000a';
update profiles set role='courier' where id in ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000c2');
insert into products (id,name,price) values ('11111111-1111-1111-1111-111111111111','Combo',100);
insert into user_addresses (user_id,lat,lng,label) values
 ('00000000-0000-0000-0000-0000000000a1',-34.92,-57.95,'casa 1'),
 ('00000000-0000-0000-0000-0000000000a2',-34.93,-57.96,'casa 2');

-- admin abre camada
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select round_id as rid, code from open_order_round('test') \gset
reset role;
-- usuarios piden
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select join_order_round(:'code');
select id as o1 from place_order('[{"product_id":"11111111-1111-1111-1111-111111111111","quantity":2}]') \gset
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select join_order_round(:'code');
select id as o2 from place_order('[{"product_id":"11111111-1111-1111-1111-111111111111","quantity":1}]') \gset

-- repartidor con camada abierta
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select test.eq((select count(*) from orders), 0::bigint, 'c1 no ve nada con camada abierta');
select test.err(format('select claim_order(%L)', :'o1'), 'NOT_ON_SHIFT');
select on_shift from start_shift();
select test.err(format('select claim_order(%L)', :'o1'), 'ROUND_STILL_OPEN');

-- admin cierra (como el front: update directo)
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update order_rounds set status='closed', closed_at=now() where id = :'rid';
select test.err(format('select assign_order(%L, %L)', :'o2', '00000000-0000-0000-0000-0000000000a1'), 'NOT_A_COURIER');

-- bolsa
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select test.eq((select count(*) from orders), 2::bigint, 'c1 ve la bolsa');
select test.eq((select count(*) from order_items), 2::bigint, 'c1 ve items de la bolsa');
select test.err(format('select courier_update_order(%L, %L)', :'o1', 'on_the_way'), 'ORDER_NOT_FOUND');
select status from claim_order(:'o1');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c2';
select test.err(format('select claim_order(%L)', :'o1'), 'NOT_ON_SHIFT');
select on_shift from start_shift();
select test.err(format('select claim_order(%L)', :'o1'), 'ORDER_TAKEN');
select test.eq((select count(*) from orders), 1::bigint, 'c2 ya no ve o1');
select test.err(format('select courier_update_order(%L, %L)', :'o1', 'on_the_way'), 'ORDER_NOT_FOUND');

-- c1 reparte
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select report_position(-34.91, -57.94, 5, 370, 3, now());
select test.eq((select heading_deg from courier_presence), 10::real, 'heading normalizado');
select report_position(-1, -1, 5, 0, 0, now() - interval '1 hour');
select test.eq((select lat from courier_presence), -34.91::float8, 'posicion vieja ignorada');
select test.err(format('select courier_update_order(%L, %L)', :'o1', 'delivered'), 'TRANSITION_INVALID');
select test.err(format('select courier_update_order(%L, %L)', :'o1', 'assigned'), 'TRANSITION_INVALID');
select status from courier_update_order(:'o1', 'on_the_way');
select status, delivered_at is not null as has_delivered_at from courier_update_order(:'o1', 'delivered');
select test.eq((select count(*) from order_events where order_id = :'o1'), 3::bigint, 'c1 ve 3 eventos (el alta no tenia courier)');
select test.eq((select count(*) from order_events where order_id = :'o1' and lat is not null), 2::bigint, 'eventos con posicion (el claim fue antes de reportar)');
update orders set status='pending' where id = :'o1';
select test.eq((select status::text from orders where id = :'o1'), 'delivered', 'c1 no puede update directo');
select on_shift, lat from end_shift();
select test.err('select report_position(-34.9, -57.9)', 'NOT_ON_SHIFT');
select test.err('select report_position(200, -57.9)', 'POSITION_INVALID');

-- usuario
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select test.eq((select status::text from orders where id = :'o1'), 'delivered', 'u1 ve entregado');
select test.eq((select count(*) from order_events), 0::bigint, 'u1 no ve historial');
select test.eq((select count(*) from courier_presence), 0::bigint, 'u1 no ve presencia');
select test.err('select start_shift()', 'COURIER_REQUIRED');
select test.err(format('select assign_order(%L, null)', :'o2'), 'AUTH_REQUIRED');

-- admin asigna, reasigna y devuelve
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select status, courier_id from assign_order(:'o2', '00000000-0000-0000-0000-0000000000c2');
select status, courier_id from assign_order(:'o2', null);
select test.err(format('update orders set status=%L where id=%L', 'assigned', :'o2'), 'orders_courier_required');
select test.eq((select count(*) from order_events where order_id = :'o1'), 4::bigint, 'admin ve 4 eventos de o1');
select test.eq((select count(*) from courier_presence), 2::bigint, 'admin ve presencia');
-- correccion del admin: delivered -> pending limpia delivered_at y courier
update orders set status='pending' where id = :'o1';
select test.eq((select delivered_at from orders where id = :'o1'), null::timestamptz, 'delivered_at limpio');
select test.eq((select courier_id from orders where id = :'o1'), null::uuid, 'courier limpio');

-- c2 toma y suelta
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c2';
select status from claim_order(:'o2');
select status, courier_id from courier_update_order(:'o2', 'pending');

-- anon
set role anon; set request.jwt.claim.sub = '';
select test.err(format('select claim_order(%L)', :'o2'), 'permission denied');
reset role;
-- Sin Supabase Realtime: el tiempo real va por NOTIFY + psy-ws.
select test.eq(
  (select count(*) from pg_publication_tables
   where pubname = 'supabase_realtime' and tablename in ('orders', 'courier_presence')),
  0::bigint, 'orders y courier_presence NO publicadas en Realtime');
