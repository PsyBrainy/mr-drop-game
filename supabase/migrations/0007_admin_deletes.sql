-- =============================================================================
-- Mister Drop · el admin puede borrar pedidos
--
-- Cancelar ya entraba por la policy de update. Borrar combos ya lo cubre
-- "admin administra combos" (for all); los items de pedidos viejos quedan
-- con product_id en null y su nombre/precio copiados, asi que el historial
-- no se rompe.
-- =============================================================================

drop policy if exists "admin borra pedidos" on public.orders;
create policy "admin borra pedidos"
  on public.orders for delete using (public.is_admin());

notify pgrst, 'reload schema';
