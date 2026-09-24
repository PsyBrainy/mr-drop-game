-- =============================================================================
-- Mister Drop · reparto (1 de 2): valores nuevos de los enums
--
-- Va sola y ANTES de 0013 a proposito. Postgres no deja usar un valor de enum
-- recien agregado dentro de la misma transaccion que lo agrega ("unsafe use of
-- new value"), y el SQL Editor corre todo el script como una sola transaccion.
-- 0013 usa estos valores en checks, indices y funciones SQL: si fueran en el
-- mismo archivo, la migracion falla a la mitad.
--
-- Correr esta, y recien despues 0013.
-- =============================================================================

-- El repartidor: ve los pedidos que le tocan y mueve su estado. Se asigna a
-- mano desde el dashboard, como el admin:
--   update public.profiles set role = 'courier' where id = '...';
alter type public.app_role add value if not exists 'courier';

-- El recorrido de un pedido despues de que se cierra la camada. El contrato
-- completo (quien puede mover que a que) esta en 0013 y en
-- src/domain/order/orderFlow.contract.json.
alter type public.order_status add value if not exists 'assigned'   after 'pending';
alter type public.order_status add value if not exists 'on_the_way' after 'assigned';
alter type public.order_status add value if not exists 'failed'     after 'delivered';
