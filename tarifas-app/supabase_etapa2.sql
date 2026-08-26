-- ============================================================
-- ETAPA 2 (Ronda 2) — Script SQL para Supabase
-- Ejecutar en el SQL Editor de Supabase Dashboard
-- ============================================================
-- Este script crea:
--   1. Tabla rfp_submissions_r2 (respuestas de ronda 2)
--   2. Tabla rfp_tarifas_r2 (tarifas individuales por ruta)
--   3. Vista v_rfp_respuestas_r2 (lectura enriquecida)
--   4. Vista v_rfp_tarifas_r2 (lectura plana con join)
--   5. Función RPC submit_rfp_r2 (inserción atómica)
--   6. Políticas RLS
-- ============================================================

-- ============================================================
-- 1. TABLA: rfp_submissions_r2
-- ============================================================
CREATE TABLE IF NOT EXISTS rfp_submissions_r2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Datos generales
  pais TEXT NOT NULL,
  oferente TEXT NOT NULL,
  email_contacto TEXT,
  region JSONB, -- ["CA"], ["VE"], o ["CA","VE"]
  
  -- Condiciones comerciales
  vigencia_del DATE,
  vigencia_al DATE,
  tarifas_incluyen TEXT,
  tarifas_no_incluyen TEXT,
  observaciones TEXT,
  
  -- Crédito y facturación
  credito_dias NUMERIC,
  facturacion_aplica TEXT, -- 'arribo' o 'salida'
  
  -- Gastos en destino (USD)
  gasto_impresion_bl NUMERIC,
  gasto_retiro_vacio NUMERIC,
  gasto_demora_contenedor_dia NUMERIC,
  gasto_demora_chasis_dia NUMERIC,
  gasto_chasis_3_ejes NUMERIC,
  
  -- Allocation mensual por región (TEUS)
  allocation_america NUMERIC,
  allocation_europa NUMERIC,
  allocation_asia_pb NUMERIC,
  allocation_asia_restante NUMERIC,
  
  -- Condiciones operativas
  herramienta_seguimiento TEXT,
  herramienta_descripcion TEXT,
  integracion_api TEXT,
  recursos_operativos TEXT,
  
  -- Gastos FOB puertos base China (JSON)
  -- Estructura: { "Ningbo": { "booking_charge": {"20GP":"100","40GP":"150","40HQ":"150"}, ... }, ... }
  gastos_fob JSONB,
  
  -- Representación / Oficinas propias (JSON)
  -- Estructura: { "china_ningbo": true, "china_shanghai": false, "destino": true, ... }
  representacion JSONB,
  
  -- Observaciones FOB
  obs_fob TEXT
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_rfp_sub_r2_pais ON rfp_submissions_r2(pais);
CREATE INDEX IF NOT EXISTS idx_rfp_sub_r2_oferente ON rfp_submissions_r2(oferente);
CREATE INDEX IF NOT EXISTS idx_rfp_sub_r2_created ON rfp_submissions_r2(created_at DESC);

-- ============================================================
-- 2. TABLA: rfp_tarifas_r2
-- ============================================================
CREATE TABLE IF NOT EXISTS rfp_tarifas_r2 (
  id BIGSERIAL PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES rfp_submissions_r2(id) ON DELETE CASCADE,
  
  -- Ruta
  origen TEXT NOT NULL,
  region TEXT,
  destino TEXT,
  
  -- Datos de la tarifa
  dias_libres_origen NUMERIC,
  dias_libres_destino NUMERIC,
  navieras TEXT,
  tiempo_transito TEXT,
  puerto_arribo TEXT,
  tarifa_20_std NUMERIC,
  tarifa_40_std NUMERIC,
  tarifa_40_hc NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_rfp_tar_r2_sub ON rfp_tarifas_r2(submission_id);
CREATE INDEX IF NOT EXISTS idx_rfp_tar_r2_origen ON rfp_tarifas_r2(origen);

-- ============================================================
-- 3. VISTA: v_rfp_respuestas_r2
-- ============================================================
CREATE OR REPLACE VIEW v_rfp_respuestas_r2 AS
SELECT
  s.id,
  s.created_at,
  s.pais,
  CASE s.pais
    WHEN 'CR' THEN 'Costa Rica'
    WHEN 'SV' THEN 'El Salvador'
    WHEN 'GT' THEN 'Guatemala'
    WHEN 'VNZ' THEN 'Venezuela'
    ELSE s.pais
  END AS pais_nombre,
  s.oferente,
  s.email_contacto,
  s.region,
  s.vigencia_del,
  s.vigencia_al,
  s.tarifas_incluyen,
  s.tarifas_no_incluyen,
  s.observaciones,
  s.credito_dias,
  s.facturacion_aplica,
  s.gasto_impresion_bl,
  s.gasto_retiro_vacio,
  s.gasto_demora_contenedor_dia,
  s.gasto_demora_chasis_dia,
  s.gasto_chasis_3_ejes,
  s.allocation_america,
  s.allocation_europa,
  s.allocation_asia_pb,
  s.allocation_asia_restante,
  s.herramienta_seguimiento,
  s.herramienta_descripcion,
  s.integracion_api,
  s.recursos_operativos,
  s.gastos_fob,
  s.representacion,
  s.obs_fob,
  (SELECT COUNT(*) FROM rfp_tarifas_r2 t 
   WHERE t.submission_id = s.id 
   AND (t.tarifa_20_std IS NOT NULL OR t.tarifa_40_std IS NOT NULL OR t.tarifa_40_hc IS NOT NULL)
  )::INT AS rutas_cotizadas
FROM rfp_submissions_r2 s;

-- ============================================================
-- 4. VISTA: v_rfp_tarifas_r2
-- ============================================================
CREATE OR REPLACE VIEW v_rfp_tarifas_r2 AS
SELECT
  t.id,
  t.submission_id,
  s.pais,
  CASE s.pais
    WHEN 'CR' THEN 'Costa Rica'
    WHEN 'SV' THEN 'El Salvador'
    WHEN 'GT' THEN 'Guatemala'
    WHEN 'VNZ' THEN 'Venezuela'
    ELSE s.pais
  END AS pais_nombre,
  s.oferente,
  s.region AS submission_region,
  t.origen,
  t.region,
  t.destino,
  t.dias_libres_origen,
  t.dias_libres_destino,
  t.navieras,
  t.tiempo_transito,
  t.puerto_arribo,
  t.tarifa_20_std,
  t.tarifa_40_std,
  t.tarifa_40_hc
FROM rfp_tarifas_r2 t
JOIN rfp_submissions_r2 s ON s.id = t.submission_id;

-- ============================================================
-- 5. FUNCIÓN RPC: submit_rfp_r2
-- ============================================================
CREATE OR REPLACE FUNCTION submit_rfp_r2(p JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sub_id UUID;
  v_tarifa JSONB;
BEGIN
  -- Insertar submission
  INSERT INTO rfp_submissions_r2 (
    pais, oferente, email_contacto, region,
    vigencia_del, vigencia_al,
    tarifas_incluyen, tarifas_no_incluyen, observaciones,
    credito_dias, facturacion_aplica,
    gasto_impresion_bl, gasto_retiro_vacio,
    gasto_demora_contenedor_dia, gasto_demora_chasis_dia,
    gasto_chasis_3_ejes,
    allocation_america, allocation_europa,
    allocation_asia_pb, allocation_asia_restante,
    herramienta_seguimiento, herramienta_descripcion,
    integracion_api, recursos_operativos,
    gastos_fob, representacion
  ) VALUES (
    p->>'pais',
    p->>'oferente',
    p->>'email_contacto',
    p->'region',
    (p->>'vigencia_del')::DATE,
    (p->>'vigencia_al')::DATE,
    p->>'tarifas_incluyen',
    p->>'tarifas_no_incluyen',
    p->>'observaciones',
    (p->>'credito_dias')::NUMERIC,
    p->>'facturacion_aplica',
    (p->>'gasto_impresion_bl')::NUMERIC,
    (p->>'gasto_retiro_vacio')::NUMERIC,
    (p->>'gasto_demora_contenedor_dia')::NUMERIC,
    (p->>'gasto_demora_chasis_dia')::NUMERIC,
    (p->>'gasto_chasis_3_ejes')::NUMERIC,
    (p->>'allocation_america')::NUMERIC,
    (p->>'allocation_europa')::NUMERIC,
    (p->>'allocation_asia_pb')::NUMERIC,
    (p->>'allocation_asia_restante')::NUMERIC,
    p->>'herramienta_seguimiento',
    p->>'herramienta_descripcion',
    p->>'integracion_api',
    p->>'recursos_operativos',
    p->'gastos_fob',
    p->'representacion'
  )
  RETURNING id INTO v_sub_id;

  -- Insertar tarifas
  FOR v_tarifa IN SELECT * FROM jsonb_array_elements(p->'tarifas')
  LOOP
    INSERT INTO rfp_tarifas_r2 (
      submission_id, origen, region, destino,
      dias_libres_origen, dias_libres_destino,
      navieras, tiempo_transito, puerto_arribo,
      tarifa_20_std, tarifa_40_std, tarifa_40_hc
    ) VALUES (
      v_sub_id,
      v_tarifa->>'origen',
      v_tarifa->>'region',
      v_tarifa->>'destino',
      (v_tarifa->>'dias_libres_origen')::NUMERIC,
      (v_tarifa->>'dias_libres_destino')::NUMERIC,
      v_tarifa->>'navieras',
      v_tarifa->>'tiempo_transito',
      v_tarifa->>'puerto_arribo',
      (v_tarifa->>'tarifa_20_std')::NUMERIC,
      (v_tarifa->>'tarifa_40_std')::NUMERIC,
      (v_tarifa->>'tarifa_40_hc')::NUMERIC
    );
  END LOOP;

  RETURN v_sub_id;
END;
$$;

-- ============================================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Habilitar RLS
ALTER TABLE rfp_submissions_r2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfp_tarifas_r2 ENABLE ROW LEVEL SECURITY;

-- Política: Cualquiera puede insertar (formulario público)
CREATE POLICY "Permitir inserción pública R2" ON rfp_submissions_r2
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Permitir inserción pública tarifas R2" ON rfp_tarifas_r2
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Política: Solo usuarios autenticados pueden leer
CREATE POLICY "Lectura autenticada R2" ON rfp_submissions_r2
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Lectura autenticada tarifas R2" ON rfp_tarifas_r2
  FOR SELECT TO authenticated
  USING (true);

-- Política: Solo usuarios autenticados pueden eliminar
CREATE POLICY "Eliminación autenticada R2" ON rfp_submissions_r2
  FOR DELETE TO authenticated
  USING (true);

CREATE POLICY "Eliminación cascada tarifas R2" ON rfp_tarifas_r2
  FOR DELETE TO authenticated
  USING (true);

-- ============================================================
-- PERMISOS para que la función RPC funcione con anon
-- ============================================================
GRANT EXECUTE ON FUNCTION submit_rfp_r2(JSONB) TO anon;
GRANT EXECUTE ON FUNCTION submit_rfp_r2(JSONB) TO authenticated;

-- Permisos de lectura en vistas
GRANT SELECT ON v_rfp_respuestas_r2 TO authenticated;
GRANT SELECT ON v_rfp_tarifas_r2 TO authenticated;

-- ============================================================
-- LISTO. Verificar ejecutando:
-- SELECT * FROM v_rfp_respuestas_r2 LIMIT 1;
-- SELECT * FROM v_rfp_tarifas_r2 LIMIT 1;
-- ============================================================


-- ============================================================
-- 7. TABLA: rfp_condiciones_operativas_r2
-- (Formulario aparte, se llena una vez por oferente)
-- ============================================================
CREATE TABLE IF NOT EXISTS rfp_condiciones_operativas_r2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Identificación del oferente
  oferente TEXT NOT NULL,
  email_contacto TEXT,
  region JSONB, -- ["CA"], ["VE"], o ["CA","VE"]

  -- Crédito y facturación
  credito_dias NUMERIC,
  facturacion_aplica TEXT, -- 'arribo' o 'salida'

  -- Condiciones operativas
  herramienta_seguimiento TEXT,
  herramienta_descripcion TEXT,
  integracion_api TEXT,
  recursos_operativos TEXT,
  observaciones TEXT,

  -- Gastos FOB puertos base China (JSONB)
  gastos_fob JSONB,

  -- Representación / Oficinas propias (JSONB)
  representacion JSONB,

  -- Observaciones FOB
  obs_fob TEXT
);

CREATE INDEX IF NOT EXISTS idx_rfp_condop_r2_oferente ON rfp_condiciones_operativas_r2(oferente);

-- ============================================================
-- 8. VISTA: v_rfp_condiciones_operativas_r2
-- ============================================================
CREATE OR REPLACE VIEW v_rfp_condiciones_operativas_r2 AS
SELECT * FROM rfp_condiciones_operativas_r2;

-- ============================================================
-- 9. FUNCIÓN RPC: submit_condiciones_operativas_r2
-- ============================================================
CREATE OR REPLACE FUNCTION submit_condiciones_operativas_r2(p JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO rfp_condiciones_operativas_r2 (
    oferente, email_contacto, region,
    credito_dias, facturacion_aplica,
    herramienta_seguimiento, herramienta_descripcion,
    integracion_api, recursos_operativos, observaciones,
    gastos_fob, representacion, obs_fob
  ) VALUES (
    p->>'oferente',
    p->>'email_contacto',
    p->'region',
    (p->>'credito_dias')::NUMERIC,
    p->>'facturacion_aplica',
    p->>'herramienta_seguimiento',
    p->>'herramienta_descripcion',
    p->>'integracion_api',
    p->>'recursos_operativos',
    p->>'observaciones',
    p->'gastos_fob',
    p->'representacion',
    p->>'obs_fob'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- RLS
ALTER TABLE rfp_condiciones_operativas_r2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inserción pública condop R2" ON rfp_condiciones_operativas_r2
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Lectura autenticada condop R2" ON rfp_condiciones_operativas_r2
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Eliminación autenticada condop R2" ON rfp_condiciones_operativas_r2
  FOR DELETE TO authenticated
  USING (true);

-- Permisos
GRANT EXECUTE ON FUNCTION submit_condiciones_operativas_r2(JSONB) TO anon;
GRANT EXECUTE ON FUNCTION submit_condiciones_operativas_r2(JSONB) TO authenticated;
GRANT SELECT ON v_rfp_condiciones_operativas_r2 TO authenticated;
