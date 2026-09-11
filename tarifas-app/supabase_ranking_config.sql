-- ============================================================
-- CONFIGURACIÓN DE RANKINGS — Persistencia compartida en Supabase
-- Guarda los pesos por rubro y las reglas de puntaje de los 4 rankings
-- (Etapa 1 / Etapa 2, normal y regional) en una sola fila global.
-- Ejecutar en el SQL Editor de Supabase Dashboard.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLA: rfp_ranking_config  (una sola fila, id = 1)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rfp_ranking_config (
  id INT PRIMARY KEY DEFAULT 1,
  config JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT,
  -- Garantiza que solo exista una fila (singleton)
  CONSTRAINT single_row CHECK (id = 1)
);

-- ------------------------------------------------------------
-- 2. VISTA: v_rfp_ranking_config
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_rfp_ranking_config AS
SELECT id, config, updated_at, updated_by FROM rfp_ranking_config;

-- ------------------------------------------------------------
-- 3. FUNCIÓN RPC: guardar_ranking_config
--    Solo administradores pueden guardar (usa is_rfp_admin()).
--    Hace upsert de la fila única id=1.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION guardar_ranking_config(p_config JSONB)
RETURNS rfp_ranking_config
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row rfp_ranking_config;
BEGIN
  -- Verificar que el usuario sea administrador
  IF NOT is_rfp_admin() THEN
    RAISE EXCEPTION 'No autorizado: solo administradores pueden guardar la configuración.';
  END IF;

  INSERT INTO rfp_ranking_config (id, config, updated_at, updated_by)
  VALUES (1, p_config, now(), auth.jwt() ->> 'email')
  ON CONFLICT (id) DO UPDATE
    SET config = EXCLUDED.config,
        updated_at = now(),
        updated_by = EXCLUDED.updated_by
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ------------------------------------------------------------
ALTER TABLE rfp_ranking_config ENABLE ROW LEVEL SECURITY;

-- Lectura para cualquier usuario autenticado (los rankings la necesitan)
DROP POLICY IF EXISTS "Lectura autenticada ranking config" ON rfp_ranking_config;
CREATE POLICY "Lectura autenticada ranking config" ON rfp_ranking_config
  FOR SELECT TO authenticated
  USING (true);

-- La escritura se hace exclusivamente vía la función RPC (SECURITY DEFINER),
-- por eso NO se crean políticas de INSERT/UPDATE directas.

-- ------------------------------------------------------------
-- 5. PERMISOS
-- ------------------------------------------------------------
GRANT SELECT ON v_rfp_ranking_config TO authenticated;
GRANT SELECT ON rfp_ranking_config TO authenticated;
GRANT EXECUTE ON FUNCTION guardar_ranking_config(JSONB) TO authenticated;

-- ============================================================
-- LISTO. Verificar ejecutando:
--   SELECT * FROM v_rfp_ranking_config;
-- ============================================================
