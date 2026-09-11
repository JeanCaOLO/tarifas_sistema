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

const STORAGE_KEY = 'rfp_ranking_config_v1'

/**
 * DEFAULTS
 * ----------------------------------------------------------------------------
 */

// Etapa 1 — pesos de rubros (deben sumar 100). Antes: 80/5/5/5/5.
export const DEFAULT_E1 = {
  pesos: {
    tarifas: 80,
    dias_libres: 5,
    credito: 5,
    gastos_destino: 5,
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

// Etapa 2 — pesos de rubros (deben sumar 100). Antes: 60/5/5/5/15/5/5.
export const DEFAULT_E2 = {
  pesos: {
    tarifas: 60,
    dias_libres: 5,
    credito: 5,       // se divide en días + facturación al arribo
    gastos_destino: 5,
    allocation: 15,
    gastos_fob: 5,
    representacion: 5
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

// Pesos regionales (por región de origen) y por país destino — Etapa 1 y 2.
export const DEFAULT_E1_REG = {
  CA: {
    regionPesos: { America: 7, Europa: 3, 'Asia Puertos Base': 70, Asia: 20 },
    paisPesos: { CR: 52, SV: 27, GT: 21 }
  },
  VE: {
    regionPesos: { America: 13, Europa: 2, 'Asia Puertos Base': 65, Asia: 20 },
    paisPesos: { VNZ: 100 }
  }
}

export const DEFAULT_E2_REG = {
  CA: {
    regionPesos: { America: 7, Europa: 3, 'Asia Puertos Base': 70, Asia: 20 },
    paisPesos: { CR: 52, SV: 27, GT: 21 }
  },
  VE: {
    regionPesos: { America: 13, Europa: 2, 'Asia Puertos Base': 65, Asia: 20 },
    paisPesos: { VNZ: 100 }
  }
}

export function getDefaults() {
  return {
    E1: clone(DEFAULT_E1),
    E2: clone(DEFAULT_E2),
    E1_REG: clone(DEFAULT_E1_REG),
    E2_REG: clone(DEFAULT_E2_REG)
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
 */

let _cache = null

export function loadConfig() {
  if (_cache) return _cache
  const base = getDefaults()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      _cache = deepMerge(base, saved)
    } else {
      _cache = base
    }
  } catch {
    _cache = base
  }
  return _cache
}

export function saveConfig(cfg) {
  _cache = cfg
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
  } catch (e) {
    console.error('No se pudo guardar la configuración de rankings:', e)
  }
  // Notificar a la app que la config cambió (para recalcular)
  try {
    window.dispatchEvent(new CustomEvent('rankingConfigChanged'))
  } catch { /* SSR / entorno sin window */ }
}

export function resetConfig() {
  _cache = getDefaults()
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch { /* noop */ }
  try {
    window.dispatchEvent(new CustomEvent('rankingConfigChanged'))
  } catch { /* noop */ }
  return _cache
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
