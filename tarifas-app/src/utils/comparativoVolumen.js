import * as XLSX from 'xlsx'
import { indexarVolumen, volumenDe, claveCiudad, MESES, MES_KEYS } from './volumen'
import { PAISES_MAP } from '../constants'
import { numOrNull } from './format'

/**
 * Comparativo Volumen × Precio.
 *
 * Para cada evaluación oferente/ruta se calcula el COSTO que nos representa:
 *     costo = (volumen_del_puerto / 2) × tarifa
 * donde el volumen sale de NUESTRO volumen por puerto de origen (según país
 * destino y periodo: mensual o anual). Menor costo = mejor oferente.
 *
 * Se agrega por oferente a nivel:
 *   - global (todo)
 *   - por región de origen (America, Europa, Asia, Asia Puertos Base)
 *   - por país destino (CR, SV, GT, VNZ)
 *
 * Además compara el mejor por COSTO contra el mejor por PUNTAJE del ranking
 * actual (para ver si coinciden o difieren).
 */

const oferKey = (nombre) => (nombre || '').trim().toLowerCase()

/**
 * @param {Array} porRuta - salida de calcularRanking / calcularRankingR2 (.porRuta)
 * @param {Array} volumenes - filas de v_rfp_volumen_puerto
 * @param {string} periodo - 'anual' o clave de mes (ene..dic)
 * @param {object} opts - { paisFiltro } opcional
 */
export function calcularComparativoVolumen(porRuta, volumenes, periodo = 'anual', opts = {}) {
  const idx = indexarVolumen(volumenes || [])
  const paisFiltro = opts.paisFiltro || ''
  // Divisor de la fórmula costo = (volumen / divisor) × tarifa. Por defecto 2
  // (1 contenedor de 40' = 2 TEUs). Configurable desde la vista.
  const divisor = Number(opts.divisor) > 0 ? Number(opts.divisor) : 2

  // Detalle por evaluación con costo
  const detalle = []
  for (const r of porRuta) {
    if (paisFiltro && r.pais !== paisFiltro) continue
    const vol = volumenDe(idx, r.pais, r.origen, periodo)
    const costo = (vol / divisor) * Number(r.tarifa || 0)
    detalle.push({
      oferente: r.oferente,
      pais: r.pais,
      pais_nombre: r.pais_nombre,
      region: r.region,
      origen: r.origen,
      tarifa: Number(r.tarifa || 0),
      volumen: vol,
      costo,
      puntaje: r.puntaje,
      tieneVolumen: vol > 0
    })
  }

  // Puertos con volumen que NO tienen cotización (no aparecen en ninguna ruta
  // del ranking para ese país). Se muestran aparte, no entran al comparativo.
  const sinCotizacion = puertosSinCotizacion(porRuta, volumenes, periodo, paisFiltro)

  return {
    global: agregarPorOferente(detalle),
    porRegion: agruparPor(detalle, 'region'),
    porPais: agruparPor(detalle, 'pais'),
    detalle,
    sinCotizacion
  }
}

/**
 * Devuelve las filas de volumen cuyo puerto NO tiene ninguna ruta cotizada en
 * el ranking (mismo país). Sirve para evidenciar volumen que no se compara.
 * @returns {Array} [{ pais, pais_nombre, puerto, region, volumen }]
 */
function puertosSinCotizacion(porRuta, volumenes, periodo, paisFiltro) {
  // Conjunto de "pais|ciudad" que SÍ tienen ruta cotizada
  const conRuta = new Set()
  for (const r of porRuta) conRuta.add(r.pais + '|' + claveCiudad(r.origen))

  const out = []
  for (const f of volumenes || []) {
    if (paisFiltro && f.pais !== paisFiltro) continue
    const clave = f.pais + '|' + claveCiudad(f.puerto_origen)
    if (conRuta.has(clave)) continue // sí se compara
    const vol = periodo === 'anual'
      ? (numOrNull(f.total_general) || MES_KEYS.reduce((a, k) => a + (numOrNull(f[k]) || 0), 0))
      : (numOrNull(f[periodo]) || 0)
    if (vol > 0) {
      out.push({
        pais: f.pais,
        pais_nombre: PAISES_MAP[f.pais] || f.pais,
        puerto: f.puerto_origen,
        region: f.region || '',
        volumen: vol
      })
    }
  }
  out.sort((a, b) => b.volumen - a.volumen)
  return out
}

/**
 * Agrega el detalle por oferente: suma de costos, suma de volumen, promedio de
 * puntaje, y ordena por costo ascendente (mejor = menor costo).
 */
function agregarPorOferente(detalle) {
  const map = new Map()
  for (const d of detalle) {
    const k = oferKey(d.oferente) + '|' + d.pais
    if (!map.has(k)) map.set(k, {
      oferente: d.oferente, pais: d.pais, pais_nombre: d.pais_nombre,
      costo: 0, volumen: 0, rutas: 0, rutasConVolumen: 0, sumaPuntaje: 0, sumaTarifa: 0
    })
    const o = map.get(k)
    o.costo += d.costo
    o.volumen += d.volumen
    o.rutas++
    if (d.tieneVolumen) o.rutasConVolumen++
    o.sumaPuntaje += (d.puntaje || 0)
    o.sumaTarifa += d.tarifa
  }
  const arr = [...map.values()].map((o) => ({
    ...o,
    costo: Math.round(o.costo * 100) / 100,
    avgPuntaje: o.rutas ? Math.round(o.sumaPuntaje / o.rutas * 100) / 100 : 0,
    avgTarifa: o.rutas ? Math.round(o.sumaTarifa / o.rutas * 100) / 100 : 0
  }))
  // Mejor por costo: menor costo primero (ignora los que no tienen volumen/costo 0)
  arr.sort((a, b) => {
    if (a.costo === 0 && b.costo === 0) return 0
    if (a.costo === 0) return 1
    if (b.costo === 0) return -1
    return a.costo - b.costo
  })
  return arr
}

/**
 * Agrupa el detalle por una dimensión ('region' o 'pais') y dentro de cada
 * grupo agrega por oferente y ordena por costo. Devuelve un objeto
 * { grupo: { items:[...], mejorCosto, mejorPuntaje } }.
 */
function agruparPor(detalle, campo) {
  const grupos = new Map()
  for (const d of detalle) {
    const g = d[campo] || '—'
    if (!grupos.has(g)) grupos.set(g, [])
    grupos.get(g).push(d)
  }
  const out = {}
  for (const [g, items] of grupos) {
    const porOfer = agregarPorOferente(items)
    // Mejor por costo (ya ordenado). Mejor por puntaje = mayor avgPuntaje.
    const conCosto = porOfer.filter((o) => o.costo > 0)
    const mejorCosto = conCosto.length ? conCosto[0] : null
    const mejorPuntaje = [...porOfer].sort((a, b) => b.avgPuntaje - a.avgPuntaje)[0] || null
    out[g] = { items: porOfer, mejorCosto, mejorPuntaje }
  }
  return out
}

const REG_LABELS_X = { America: 'América', Europa: 'Europa', 'Asia Puertos Base': 'Asia PB', Asia: 'Asia' }
const REGIONES_X = ['America', 'Europa', 'Asia Puertos Base', 'Asia']
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/**
 * Exporta el comparativo a Excel: hoja de mejores por región y país (costo vs
 * ranking), y hoja del ranking global por costo.
 */
export function exportarComparativoVolumen(comp, { etapa, periodo, campo, paisFiltro, divisor = 2 }) {
  const wb = XLSX.utils.book_new()
  const periodoTxt = periodo === 'anual' ? 'Anual' : (MESES.find((m) => m.key === periodo)?.label || periodo)

  const filaGrupo = (etiqueta, grupo) => {
    const mc = grupo?.mejorCosto
    const mp = grupo?.mejorPuntaje
    const coincide = mc && mp && mc.oferente.trim().toLowerCase() === mp.oferente.trim().toLowerCase()
    return [
      etiqueta,
      mc ? mc.oferente : '—',
      mc ? r2(mc.costo) : '—',
      mc ? mc.volumen : '—',
      mp ? mp.oferente : '—',
      mp ? r2(mp.avgPuntaje) : '—',
      (!mc || !mp) ? '—' : (coincide ? 'Sí' : 'No')
    ]
  }

  const headerGrupo = ['Grupo', 'Mejor por Costo (vol/2×tarifa)', 'Costo total', 'Volumen (TEUs)', 'Mejor por Ranking', 'Puntaje', '¿Coinciden?']

  const aoa = [
    [`COMPARATIVO VOLUMEN × PRECIO — ETAPA ${etapa}`],
    [`Fórmula: costo = (volumen / ${divisor}) × tarifa  ·  menor costo = mejor`],
    [`Periodo: ${periodoTxt}`, `Tarifa base: ${campo}`, paisFiltro ? `País: ${PAISES_MAP[paisFiltro] || paisFiltro}` : 'País: Todos'],
    [],
    ['MEJOR OFERENTE POR REGIÓN DE ORIGEN'],
    headerGrupo,
    ...REGIONES_X.map((reg) => filaGrupo(REG_LABELS_X[reg] || reg, comp.porRegion[reg])),
    [],
    ['MEJOR OFERENTE POR PAÍS DESTINO'],
    headerGrupo,
    ...Object.keys(comp.porPais).map((p) => filaGrupo(PAISES_MAP[p] || p, comp.porPais[p]))
  ]
  const wsResumen = XLSX.utils.aoa_to_sheet(aoa)
  wsResumen['!cols'] = [{ wch: 22 }, { wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 30 }, { wch: 12 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Mejores')

  // Hoja: ranking global por costo (con gaps)
  const gHead = ['#', 'Oferente', 'País', 'Volumen (TEUs)', 'Tarifa prom.', `Costo total (vol/${divisor}×tarifa)`, 'Gap vs anterior', 'Gap vs #1', 'Puntaje ranking', 'Rutas', 'Rutas con volumen']
  const conCosto = comp.global.filter((o) => o.costo > 0)
  const lider = conCosto[0]
  const gRows = conCosto.map((o, i) => {
    const prev = i > 0 ? conCosto[i - 1] : null
    const gapPrev = prev ? r2(o.costo - prev.costo) : 0
    const gapLider = lider ? r2(o.costo - lider.costo) : 0
    return [
      i + 1, o.oferente, o.pais_nombre || o.pais, o.volumen, r2(o.avgTarifa), r2(o.costo),
      i === 0 ? 0 : gapPrev, i === 0 ? 0 : gapLider,
      r2(o.avgPuntaje), o.rutas, o.rutasConVolumen
    ]
  })
  const wsGlobal = XLSX.utils.aoa_to_sheet([gHead, ...gRows])
  wsGlobal['!cols'] = [{ wch: 5 }, { wch: 28 }, { wch: 14 }, { wch: 15 }, { wch: 14 }, { wch: 24 }, { wch: 16 }, { wch: 16 }, { wch: 15 }, { wch: 8 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, wsGlobal, 'Ranking por Costo')

  // Hoja: puertos con volumen SIN cotización (no se comparan)
  if (comp.sinCotizacion && comp.sinCotizacion.length) {
    const sHead = ['País', 'Puerto Origen', 'Región', 'Volumen (TEUs)', 'Nota']
    const sRows = comp.sinCotizacion.map((s) => [
      s.pais_nombre, s.puerto, s.region, s.volumen, 'Sin cotización de oferentes — no se compara'
    ])
    const wsSin = XLSX.utils.aoa_to_sheet([sHead, ...sRows])
    wsSin['!cols'] = [{ wch: 14 }, { wch: 26 }, { wch: 18 }, { wch: 15 }, { wch: 40 }]
    XLSX.utils.book_append_sheet(wb, wsSin, 'Volumen sin cotización')
  }

  const fecha = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `Comparativo_Volumen_E${etapa}_${periodoTxt}_${fecha}.xlsx`)
}
