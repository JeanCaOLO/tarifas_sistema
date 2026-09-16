-- ============================================================
-- VOLUMEN PROPIO POR PUERTO DE ORIGEN
-- Cuántos TEUs mueve NUESTRA empresa por puerto de origen, por país
-- destino y por mes. Se usa para el comparativo costo = (volumen/2) × tarifa.
-- Ejecutar en el SQL Editor de Supabase Dashboard.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLA: rfp_volumen_puerto
--    Una fila por (país destino, puerto de origen).
--    Los 12 meses en columnas + total general.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rfp_volumen_puerto (
  id BIGSERIAL PRIMARY KEY,
  pais TEXT NOT NULL,             -- país destino: CR, SV, GT, VNZ
  puerto_origen TEXT NOT NULL,    -- ej. "Shanghai, China"
  region TEXT,                    -- America | Europa | Asia | Asia Puertos Base
  ene NUMERIC DEFAULT 0,
  feb NUMERIC DEFAULT 0,
  mar NUMERIC DEFAULT 0,
  abr NUMERIC DEFAULT 0,
  may NUMERIC DEFAULT 0,
  jun NUMERIC DEFAULT 0,
  jul NUMERIC DEFAULT 0,
  ago NUMERIC DEFAULT 0,
  sep NUMERIC DEFAULT 0,
  oct NUMERIC DEFAULT 0,
  nov NUMERIC DEFAULT 0,
  dic NUMERIC DEFAULT 0,
  total_general NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- No se permite el mismo puerto duplicado dentro del mismo país destino
  CONSTRAINT uq_volumen_pais_puerto UNIQUE (pais, puerto_origen)
);

CREATE INDEX IF NOT EXISTS idx_rfp_volumen_pais ON rfp_volumen_puerto(pais);

-- ------------------------------------------------------------
-- 2. VISTA: v_rfp_volumen_puerto
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_rfp_volumen_puerto AS
SELECT * FROM rfp_volumen_puerto;

-- ------------------------------------------------------------
-- 3. FUNCIÓN RPC: guardar_volumen_puertos
--    Reemplaza TODO el volumen de un país destino con el arreglo enviado.
--    Solo administradores (usa is_rfp_admin()).
--    p espera: { "pais": "CR", "filas": [ { "puerto_origen": "...",
--       "region": "...", "ene": 10, ..., "dic": 5, "total_general": 120 }, ... ] }
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION guardar_volumen_puertos(p JSONB)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pais TEXT;
  v_fila JSONB;
  v_count INT := 0;
BEGIN
  IF NOT is_rfp_admin() THEN
    RAISE EXCEPTION 'No autorizado: solo administradores pueden guardar el volumen.';
  END IF;

  v_pais := p->>'pais';
  IF v_pais IS NULL THEN
    RAISE EXCEPTION 'Falta el país destino.';
  END IF;

  -- Reemplazo total del país
  DELETE FROM rfp_volumen_puerto WHERE pais = v_pais;

  FOR v_fila IN SELECT * FROM jsonb_array_elements(p->'filas')
  LOOP
    INSERT INTO rfp_volumen_puerto (
      pais, puerto_origen, region,
      ene, feb, mar, abr, may, jun, jul, ago, sep, oct, nov, dic, total_general, updated_at
    ) VALUES (
      v_pais,
      v_fila->>'puerto_origen',
      v_fila->>'region',
      COALESCE((v_fila->>'ene')::NUMERIC, 0),
      COALESCE((v_fila->>'feb')::NUMERIC, 0),
      COALESCE((v_fila->>'mar')::NUMERIC, 0),
      COALESCE((v_fila->>'abr')::NUMERIC, 0),
      COALESCE((v_fila->>'may')::NUMERIC, 0),
      COALESCE((v_fila->>'jun')::NUMERIC, 0),
      COALESCE((v_fila->>'jul')::NUMERIC, 0),
      COALESCE((v_fila->>'ago')::NUMERIC, 0),
      COALESCE((v_fila->>'sep')::NUMERIC, 0),
      COALESCE((v_fila->>'oct')::NUMERIC, 0),
      COALESCE((v_fila->>'nov')::NUMERIC, 0),
      COALESCE((v_fila->>'dic')::NUMERIC, 0),
      COALESCE((v_fila->>'total_general')::NUMERIC, 0),
      now()
    )
    ON CONFLICT (pais, puerto_origen) DO UPDATE SET
      region = EXCLUDED.region,
      ene = EXCLUDED.ene, feb = EXCLUDED.feb, mar = EXCLUDED.mar, abr = EXCLUDED.abr,
      may = EXCLUDED.may, jun = EXCLUDED.jun, jul = EXCLUDED.jul, ago = EXCLUDED.ago,
      sep = EXCLUDED.sep, oct = EXCLUDED.oct, nov = EXCLUDED.nov, dic = EXCLUDED.dic,
      total_general = EXCLUDED.total_general, updated_at = now();
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ------------------------------------------------------------
ALTER TABLE rfp_volumen_puerto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura autenticada volumen" ON rfp_volumen_puerto;
CREATE POLICY "Lectura autenticada volumen" ON rfp_volumen_puerto
  FOR SELECT TO authenticated
  USING (true);

-- La escritura se hace exclusivamente vía la RPC (SECURITY DEFINER).

-- ------------------------------------------------------------
-- 5. PERMISOS
-- ------------------------------------------------------------
GRANT SELECT ON rfp_volumen_puerto TO authenticated;
GRANT SELECT ON v_rfp_volumen_puerto TO authenticated;
GRANT EXECUTE ON FUNCTION guardar_volumen_puertos(JSONB) TO authenticated;

-- ============================================================
-- LISTO. Verificar con:
--   SELECT * FROM v_rfp_volumen_puerto;
-- ============================================================
