/**
 * Constantes para Etapa 2 (Segunda Ronda RFP 2026-2027)
 */

// Mismos países y orígenes que Etapa 1
export { PAISES, PAISES_MAP, ORIGENES, PUERTOS, RATE_FIELDS, REGION_POR_ORIGEN, TOTAL_RUTAS } from './constants'

/**
 * Pesos de evaluación Etapa 2
 * Total: 60 + 5 + 5 + 5 + 15 + 5 + 5 = 100
 */
export const PESOS_R2 = {
  tarifas: 60,
  dias_libres: 5,
  credito: 5,        // 2.5 por días + 2.5 por facturación al arribo
  gastos_destino: 5,
  allocation: 15,
  gastos_fob: 5,
  representacion: 5
}

/**
 * Puertos base de China para gastos FOB
 */
export const PUERTOS_BASE_CHINA = [
  'Ningbo',
  'Qingdao',
  'Shanghai',
  'Shekou',
  'Shenzhen',
  'Xiamen',
  'Yantian'
]

/**
 * Cargos FOB por puerto base (en CNY)
 */
export const CARGOS_FOB = [
  { key: 'booking_charge', label: 'Booking charge' },
  { key: 'carrier_doc_fee', label: 'Carrier doc fee' },
  { key: 'eir', label: 'EIR' },
  { key: 'handling_fee', label: 'Handling fee' },
  { key: 'seal_fee', label: 'Seal fee' },
  { key: 'thc', label: 'Terminal handling charge' },
  { key: 'vgm_fee', label: 'VGM administration fee' },
  { key: 'other_charges', label: 'Other charges (if occur)' }
]

/**
 * Contenedores para gastos FOB
 */
export const CONTENEDORES_FOB = ['20GP', '40GP', '40HQ']

/**
 * Regiones para allocation mensual (en TEUS)
 */
export const REGIONES_ALLOCATION = [
  { key: 'america', label: 'América' },
  { key: 'europa', label: 'Europa' },
  { key: 'asia_puertos_base', label: 'Asia, Puertos Base de China (Ningbo, Qingdao, Shanghai, Shekou, Shenzhen, Xiamen, Yantian)' },
  { key: 'asia_restante', label: 'Asia (restante)' }
]

/**
 * Opciones de facturación
 */
export const FACTURACION_OPCIONES = [
  { value: 'arribo', label: 'Arribo' },
  { value: 'salida', label: 'Salida' }
]

/**
 * Configuración Ranking Regional Etapa 2
 * Mismos pesos regionales y por país que Etapa 1
 */
export const RK2_CONFIG_R2 = {
  CA: {
    regionPesos: { America: 7, Europa: 3, 'Asia Puertos Base': 70, Asia: 20 },
    paisPesos: { CR: 52, SV: 27, GT: 21 }
  },
  VE: {
    regionPesos: { America: 13, Europa: 2, 'Asia Puertos Base': 65, Asia: 20 },
    paisPesos: { VNZ: 100 }
  }
}
