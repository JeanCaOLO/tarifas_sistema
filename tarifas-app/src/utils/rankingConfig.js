/**
 * Configuración dinámica de pesos y reglas de los rankings.
 *
 * Centraliza los pesos de cada rubro, los umbrales de las reglas y los pesos
 * regionales (por región de origen y por país destino) para las cuatro vistas:
 *   - Etapa 1: ranking por ruta/global  (E1)
 *   - Etapa 1: ranking regional         (E1_REG)
 *   - Etapa 2: ranking por ruta/global  (E2)
 *   - Etapa 2: ranking regional         (E2_REG)
 *
 * Persistencia: localStorage (config del navegador del admin). Los valores por
 * defecto reproducen exactamente el comportamiento previo hardcodeado.
 */

import { supabase } from '../supabase'

const STORAGE_KEY = 'rfp_ranking_config_v1'

/**
 * DEFAULTS
 * ----------------------------------------------------------------------------
 */

// Etapa 1 — pesos de rubros (deben sumar 100).
// Gastos ya no puntúa (0); su 5% se sumó a Tarifa (85). Total: 85+5+5+5 = 100.
export const DEFAULT_E1 = {
  pesos: {
    tarifas: 85,
    dias_libres: 5,
    credito: 5,
    gastos_destino: 0,
    herramienta: 5
  },
  reglas: {
    // Días libres en destino → puntos (sobre 5)
    dias: { alto: { min: 21, pts: 5 }, medio: { min: 15, pts: 1 }, bajo: 0 },
    // Crédito en días → puntos (sobre 5)
    credito: { alto: { min: 60, pts: 5 }, medio: { min: 45, pts: 1 }, bajo: 0 },
    // Gastos destino: interpolación menor(5)→mayor(1)
    gastos: { mejorPts: 5, peorPts: 1 },
    // Herramienta de seguimiento: sí=5, no=0
    herramienta: { si: 5, no: 0 }
  }
}

// Etapa 2 — pesos de rubros (deben sumar 100).
// Gastos y FOB ya no puntúan (0); su 10% se sumó a Tarifa (70).
// Total: 70+5+5+15+5 = 100.
export const DEFAULT_E2 = {
  pesos: {
    tarifas: 80,
    dias_libres: 0,
    credito: 5,       // se divide en días + facturación al arribo
    gastos_destino: 0,
    allocation: 15,
    gastos_fob: 0,
    representacion: 0
  },
  reglas: {
    dias: { alto: { min: 21, pts: 5 }, medio: { min: 15, pts: 1 }, bajo: 0 },
    // Crédito E2 = puntos por días (máx creditoDiasMax) + puntos por facturación al arribo
    credito: {
      creditoDiasMax: 2.5,
      dias: { alto: { min: 60, pts: 2.5 }, medio: { min: 45, pts: 0.5 } },
      facturacionArriboPts: 2.5
    },
    gastos: { mejorPts: 5, peorPts: 1 }
  }
}

// Pesos regionales por PAÍS destino, según la distribución real de volumen.
// regionPesos = fallback por bloque; regionPesosPorPais = específico por país
// (tiene prioridad en el cálculo del ranking regional). paisPesos = peso del
// país dentro de la región (CA/VE) para la Nota Final.
const REGION_PESOS_POR_PAIS = {
  CR: { America: 2, Europa: 6, 'Asia Puertos Base': 82, Asia: 10 },
  SV: { America: 0, Europa: 2, 'Asia Puertos Base': 68, Asia: 30 },
  GT: { America: 1, Europa: 4, 'Asia Puertos Base': 84, Asia: 11 },
  VNZ: { America: 17, Europa: 2, 'Asia Puertos Base': 64, Asia: 17 }
}

export const DEFAULT_E1_REG = {
  CA: {
    regionPesos: { America: 7, Europa: 3, 'Asia Puertos Base': 70, Asia: 20 },
    regionPesosPorPais: { CR: { ...REGION_PESOS_POR_PAIS.CR }, SV: { ...REGION_PESOS_POR_PAIS.SV }, GT: { ...REGION_PESOS_POR_PAIS.GT } },
    paisPesos: { CR: 52, SV: 27, GT: 21 }
  },
  VE: {
    regionPesos: { America: 13, Europa: 2, 'Asia Puertos Base': 65, Asia: 20 },
    regionPesosPorPais: { VNZ: { ...REGION_PESOS_POR_PAIS.VNZ } },
    paisPesos: { VNZ: 100 }
  }
}

export const DEFAULT_E2_REG = {
  CA: {
    regionPesos: { America: 7, Europa: 3, 'Asia Puertos Base': 70, Asia: 20 },
    regionPesosPorPais: { CR: { ...REGION_PESOS_POR_PAIS.CR }, SV: { ...REGION_PESOS_POR_PAIS.SV }, GT: { ...REGION_PESOS_POR_PAIS.GT } },
    paisPesos: { CR: 52, SV: 27, GT: 21 }
  },
  VE: {
    regionPesos: { America: 13, Europa: 2, 'Asia Puertos Base': 65, Asia: 20 },
    regionPesosPorPais: { VNZ: { ...REGION_PESOS_POR_PAIS.VNZ } },
    paisPesos: { VNZ: 100 }
  }
}

// Configuración del Comparativo Volumen × Precio.
// costo = (volumen / divisor) × tarifa. divisor = 2 (1 cont. 40' = 2 TEUs).
export const DEFAULT_VOLUMEN = {
  divisor: 2
}

export function getDefaults() {
  return {
    E1: clone(DEFAULT_E1),
    E2: clone(DEFAULT_E2),
    E1_REG: clone(DEFAULT_E1_REG),
    E2_REG: clone(DEFAULT_E2_REG),
    VOLUMEN: clone(DEFAULT_VOLUMEN)
  }
}

/**
 * Etiquetas legibles de cada rubro (para la UI y los reportes).
 */
export const RUBRO_LABELS = {
  tarifas: 'Tarifa',
  dias_libres: 'Días libres',
  credito: 'Crédito',
  gastos_destino: 'Gastos destino',
  herramienta: 'Herramienta de seguimiento',
  allocation: 'Allocation',
  gastos_fob: 'Gastos FOB',
  representacion: 'Representación / Oficinas'
}

/**
 * PERSISTENCIA
 * ----------------------------------------------------------------------------
 * Fuente de verdad: tabla rfp_ranking_config en Supabase (compartida entre
 * todos los administradores). Se mantiene una caché en memoria para que los
 * cálculos de ranking (síncronos) puedan leerla, y una copia en localStorage
 * como respaldo mientras carga o si Supabase no responde.
 */

let _cache = null

/**
 * Lectura SÍNCRONA de la config vigente (desde caché en memoria o localStorage).
 * La usan los cálculos de ranking. Si aún no se cargó desde Supabase, devuelve
 * el respaldo local o los defaults.
 */
export function loadConfig() {
  if (_cache) return _cache
  const base = getDefaults()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    _cache = raw ? deepMerge(base, JSON.parse(raw)) : base
  } catch {
    _cache = base
  }
  return _cache
}

/**
 * Carga ASÍNCRONA desde Supabase. Llamar al iniciar sesión / cargar datos.
 * Actualiza la caché y localStorage, y notifica a la app para recalcular.
 */
export async function fetchConfig() {
  try {
    const { data, error } = await supabase
      .from('v_rfp_ranking_config')
      .select('config')
      .eq('id', 1)
      .maybeSingle()
    if (error) throw error
    const base = getDefaults()
    if (data && data.config) {
      _cache = deepMerge(base, data.config)
    } else {
      _cache = base
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_cache)) } catch { /* noop */ }
    notifyChanged()
    return _cache
  } catch (e) {
    console.error('No se pudo cargar la configuración de rankings desde Supabase:', e)
    // Mantener respaldo local / defaults
    return loadConfig()
  }
}

/**
 * Guarda la config en Supabase (vía RPC, solo admins) y actualiza la caché.
 * Devuelve { ok, error }.
 */
export async function saveConfig(cfg) {
  _cache = cfg
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)) } catch { /* noop */ }
  notifyChanged()
  try {
    const { error } = await supabase.rpc('guardar_ranking_config', { p_config: cfg })
    if (error) throw error
    return { ok: true }
  } catch (e) {
    console.error('No se pudo guardar la configuración de rankings en Supabase:', e)
    return { ok: false, error: e?.message || 'Error al guardar en Supabase' }
  }
}

/**
 * Restaura los defaults y los persiste en Supabase.
 */
export async function resetConfig() {
  _cache = getDefaults()
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* noop */ }
  notifyChanged()
  try {
    const { error } = await supabase.rpc('guardar_ranking_config', { p_config: _cache })
    if (error) throw error
    return { ok: true, config: _cache }
  } catch (e) {
    console.error('No se pudo restaurar la configuración en Supabase:', e)
    return { ok: false, error: e?.message || 'Error al restaurar en Supabase', config: _cache }
  }
}

function notifyChanged() {
  try {
    window.dispatchEvent(new CustomEvent('rankingConfigChanged'))
  } catch { /* SSR / entorno sin window */ }
}

/**
 * Accesores por vista (siempre devuelven la config vigente).
 */
export function getPesosE1() { return loadConfig().E1.pesos }
export function getReglasE1() { return loadConfig().E1.reglas }
export function getPesosE2() { return loadConfig().E2.pesos }
export function getReglasE2() { return loadConfig().E2.reglas }
export function getRegionalE1() { return loadConfig().E1_REG }
export function getRegionalE2() { return loadConfig().E2_REG }
export function getVolumenConfig() { return loadConfig().VOLUMEN || { divisor: 2 } }

/**
 * Suma de pesos de un objeto {rubro: peso} (para validar =100 en la UI).
 */
export function sumaPesos(pesos) {
  return Object.values(pesos || {}).reduce((a, v) => a + (Number(v) || 0), 0)
}

/**
 * HELPERS
 * ----------------------------------------------------------------------------
 */

function clone(o) {
  return JSON.parse(JSON.stringify(o))
}

// Merge profundo: los valores guardados sobrescriben los defaults, pero se
// conservan claves nuevas que existan solo en los defaults (compatibilidad).
function deepMerge(base, override) {
  if (Array.isArray(base)) return override != null ? override : base
  if (typeof base === 'object' && base !== null) {
    const out = Array.isArray(base) ? [] : { ...base }
    for (const k of Object.keys(base)) {
      if (override && k in override) {
        out[k] = deepMerge(base[k], override[k])
      }
    }
    // claves extra que estén solo en override
    if (override && typeof override === 'object') {
      for (const k of Object.keys(override)) {
        if (!(k in base)) out[k] = override[k]
      }
    }
    return out
  }
  return override != null ? override : base
}
