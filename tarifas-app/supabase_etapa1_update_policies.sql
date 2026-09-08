-- ============================================================
-- ETAPA 1 — Políticas de ACTUALIZACIÓN (UPDATE)
-- Necesarias para poder EDITAR respuestas desde el panel admin.
-- Ejecutar en el SQL Editor de Supabase.
--
-- Nombres reales de tablas (ronda 1):
--   Respuestas: rfp_submissions
--   Tarifas:    rfp_rates   (la vista v_rfp_tarifas lee de aquí)
-- ============================================================

DROP POLICY IF EXISTS "Actualización autenticada R1" ON rfp_submissions;
CREATE POLICY "Actualización autenticada R1" ON rfp_submissions
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Actualización autenticada rates R1" ON rfp_rates;
CREATE POLICY "Actualización autenticada rates R1" ON rfp_rates
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
