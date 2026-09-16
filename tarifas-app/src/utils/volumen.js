import * as XLSX from 'xlsx'
import { ORIGENES, REGION_POR_ORIGEN } from '../constants'
import { numOrNull } from './format'

/**
 * Volumen propio por puerto de origen (TEUs que movemos), por país destino
 * y por mes. Se usa para el comparativo costo = (volumen / 2) × tarifa.
 */

export const MESES = [
  { key: 'ene', label: 'Enero' }, { key: 'feb', label: 'Febrero' },
  { key: 'mar', label: 'Marzo' }, { key: 'abr', label: 'Abril' },
  { key: 'may', label: 'Mayo' }, { key: 'jun', label: 'Junio' },
  { key: 'jul', label: 'Julio' }, { key: 'ago', label: 'Agosto' },
  { key: 'sep', label: 'Septiembre' }, { key: 'oct', label: 'Octubre' },
  { key: 'nov', label: 'Noviembre' }, { key: 'dic', label: 'Diciembre' }
]
export const MES_KEYS = MESES.map((m) => m.key)

/**
 * Normaliza un nombre de puerto para comparar de forma robusta:
 * minúsculas, sin acentos, sin espacios extra, sin puntuación.
 */
export function normPuerto(nombre) {
  return String(nombre || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Clave "ciudad" del puerto: la parte antes de la primera coma, normalizada,
 * resolviendo alias conocidos (ej. "Tianjin Xingang" -> "Xingang").
 * Permite matchear "Shanghai" con "Shanghai, China".
 */
export function claveCiudad(nombre) {
  const base = String(nombre || '').split(',')[0]
  const cc = normPuerto(base)
  return ALIAS_CIUDAD_LOOKUP.get(cc) || cc
}

// Se define aquí para que claveCiudad pueda usarlo (ALIAS_CIUDAD se declara más abajo).
const ALIAS_CIUDAD_LOOKUP = new Map([
  ['tianjinxingang', 'xingang'],
  ['mawei fuzhou', 'fuzhou'],
  ['mawei- fujian', 'fuzhou'],
  ['mawei-fujian', 'fuzhou'],
  ['xiolan', 'xiaolan'],
  ['shandon', 'shandong'],
  ['jabel ali', 'jebel ali']
])

// Índice del catálogo oficial de orígenes: ciudad -> nombre canónico
const CATALOGO_POR_CIUDAD = new Map(ORIGENES.map(([puerto]) => [claveCiudad(puerto), puerto]))
// Índice del catálogo por nombre completo normalizado
const CATALOGO_POR_NOMBRE = new Map(ORIGENES.map(([puerto]) => [normPuerto(puerto), puerto]))

/**
 * Resuelve un nombre de puerto (posiblemente parcial o con variantes) al
 * nombre CANÓNICO del catálogo de orígenes. Si no encuentra, devuelve el
 * nombre original tal cual (para no perder datos).
 * claveCiudad ya aplica los alias conocidos.
 */
export function resolverPuertoCanonico(nombre) {
  const nn = normPuerto(nombre)
  if (CATALOGO_POR_NOMBRE.has(nn)) return CATALOGO_POR_NOMBRE.get(nn)
  const cc = claveCiudad(nombre)
  if (CATALOGO_POR_CIUDAD.has(cc)) return CATALOGO_POR_CIUDAD.get(cc)
  return String(nombre || '').trim()
}

/**
 * Clave de matching flexible para un puerto: usa la ciudad (antes de la coma).
 * Así "Shanghai" y "Shanghai, China" caen en la misma clave.
 */
export function claveMatch(nombre) {
  return claveCiudad(nombre)
}

/**
 * Construye un índice de volumen. Indexa cada fila por DOS claves para hacer
 * el match más tolerante: por nombre completo normalizado y por ciudad.
 * Map "pais|clave" -> fila de volumen.
 */
export function indexarVolumen(filas) {
  const idx = new Map()
  for (const f of filas || []) {
    idx.set(f.pais + '|' + normPuerto(f.puerto_origen), f)
    // clave por ciudad (no sobreescribe si ya existe una exacta)
    const ck = f.pais + '|c|' + claveCiudad(f.puerto_origen)
    if (!idx.has(ck)) idx.set(ck, f)
  }
  return idx
}

/**
 * Devuelve el volumen (TEUs) para un puerto/país según el periodo elegido.
 * @param {Map} idx - índice de indexarVolumen
 * @param {string} pais - país destino (CR, SV, GT, VNZ)
 * @param {string} puerto - nombre del puerto de origen (de la ruta)
 * @param {string} periodo - 'anual' o una clave de mes (ene..dic)
 * @returns {number} TEUs (0 si no hay dato)
 */
export function volumenDe(idx, pais, puerto, periodo = 'anual') {
  // 1) match exacto por nombre normalizado; 2) match por ciudad
  const fila = idx.get(pais + '|' + normPuerto(puerto)) || idx.get(pais + '|c|' + claveCiudad(puerto))
  if (!fila) return 0
  if (periodo === 'anual') {
    // Usar total_general si viene; si no, sumar los 12 meses
    const tot = numOrNull(fila.total_general)
    if (tot !== null && tot > 0) return tot
    return MES_KEYS.reduce((a, k) => a + (numOrNull(fila[k]) || 0), 0)
  }
  return numOrNull(fila[periodo]) || 0
}

/**
 * Suma total del volumen de un país (para mostrar resumen).
 */
export function totalPais(filas, pais, periodo = 'anual') {
  const idx = indexarVolumen(filas.filter((f) => f.pais === pais))
  let total = 0
  for (const [, f] of idx) {
    if (periodo === 'anual') {
      const tot = numOrNull(f.total_general)
      total += (tot !== null && tot > 0) ? tot : MES_KEYS.reduce((a, k) => a + (numOrNull(f[k]) || 0), 0)
    } else {
      total += numOrNull(f[periodo]) || 0
    }
  }
  return total
}

/**
 * Genera las filas base (todos los puertos de ORIGENES) para editar el volumen
 * de un país cuando aún no hay datos guardados. Mezcla con lo ya guardado.
 */
export function filasEditables(filasGuardadas, pais) {
  const guardadasIdx = indexarVolumen((filasGuardadas || []).filter((f) => f.pais === pais))
  return ORIGENES.map(([puerto, region]) => {
    const existente = guardadasIdx.get(pais + '|' + normPuerto(puerto))
    const base = { puerto_origen: puerto, region }
    for (const k of MES_KEYS) base[k] = existente ? (numOrNull(existente[k]) || 0) : 0
    base.total_general = existente
      ? (numOrNull(existente.total_general) || MES_KEYS.reduce((a, k) => a + base[k], 0))
      : 0
    return base
  })
}

/**
 * Recalcula el total_general de una fila a partir de sus 12 meses.
 */
export function recalcularTotal(fila) {
  return MES_KEYS.reduce((a, k) => a + (numOrNull(fila[k]) || 0), 0)
}

/**
 * Lee un archivo Excel de volumen. Formato esperado por hoja:
 *   Puerto Origen | Región - Origen | ene | feb | ... | dic | Total general
 * Devuelve un arreglo de filas { puerto_origen, region, ene..dic, total_general }.
 * Toma la primera hoja del archivo.
 */
export function leerExcelVolumen(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        if (rows.length < 2) { reject(new Error('La hoja no contiene datos.')); return }

        const hdr = rows[0].map((h) => normPuerto(h))
        const findMes = (mes) => hdr.findIndex((h) => h === mes || h.startsWith(mes))
        const col = {
          puerto: hdr.findIndex((h) => h.includes('puerto')),
          region: hdr.findIndex((h) => h.includes('region')),
          total: hdr.findIndex((h) => h.includes('total'))
        }
        const colMes = {}
        for (const k of MES_KEYS) colMes[k] = findMes(k)

        const out = []
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r]
          const puertoRaw = col.puerto >= 0 ? String(row[col.puerto] || '').trim() : ''
          if (!puertoRaw || normPuerto(puertoRaw).includes('total general')) continue
          // Resolver al nombre canónico del catálogo para evitar problemas de match
          const puerto = resolverPuertoCanonico(puertoRaw)
          // Región: la del Excel, o la del catálogo (por nombre canónico o por ciudad)
          let region = col.region >= 0 ? String(row[col.region] || '').trim() : ''
          if (!region) region = REGION_POR_ORIGEN.get(puerto) || ''

          const fila = { puerto_origen: puerto, region }
          for (const k of MES_KEYS) {
            const c = colMes[k]
            fila[k] = c >= 0 ? (numOrNull(row[c]) || 0) : 0
          }
          fila.total_general = col.total >= 0 && numOrNull(row[col.total]) !== null
            ? numOrNull(row[col.total])
            : recalcularTotal(fila)
          out.push(fila)
        }
        if (!out.length) { reject(new Error('No se encontraron filas de volumen válidas.')); return }
        resolve(out)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Descarga una plantilla Excel de volumen para un país (todos los puertos).
 */
export function descargarPlantillaVolumen(paisCode, paisNombre) {
  const headers = ['Puerto Origen', 'Región - Origen', ...MESES.map((m) => m.label.slice(0, 3).toLowerCase()), 'Total general']
  const data = [headers]
  for (const [puerto, region] of ORIGENES) {
    data.push([puerto, region, ...MES_KEYS.map(() => ''), ''])
  }
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{ wch: 28 }, { wch: 18 }, ...MES_KEYS.map(() => ({ wch: 7 })), { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws, `Volumen ${paisNombre || paisCode}`)
  XLSX.writeFile(wb, `Plantilla_Volumen_${paisCode}.xlsx`)
}
