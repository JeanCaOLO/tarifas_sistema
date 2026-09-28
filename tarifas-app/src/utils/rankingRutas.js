import { numOrNull } from './format'
import { indexarVolumen, volumenDe } from './volumen'

/**
 * RANKING POR RUTA con capacidad.
 *
 * Responde, ruta por ruta: «¿qué porcentaje de la demanda de esta ruta me cubre
 * cada oferente con los TEUs que declaró disponibles?».
 *
 *   demanda_mes(ruta) = volumen_anual_del_puerto / 12     [TEUs/mes]
 *                       (o el mes elegido, si no se usa "Anual")
 *   % de la demanda   = allocation_declarado_mes / demanda_mes(ruta)
 *
 * Ejemplo: un oferente declara 100 TEUs/mes y la ruta mueve 110 TEUs/mes →
 * cubre el 90.9% de esa ruta.
 *
 * El allocation se declara por REGIÓN (un total mensual en TEUs), así que la
 * misma cifra se contrasta contra cada ruta de esa región por separado. Es lo
 * correcto para responder «¿este oferente puede con esta ruta?», pero implica
 * que los porcentajes de dos puertos de la misma región no se suman entre sí:
 * comparten la misma capacidad.
 *
 * Unidades: volumen y allocation están ambos en TEUs. El equivalente en
 * contenedores de 40' HC es `TEUs / divisor` (2 TEUs = 1 x 40' HC).
 *
 * El allocation solo existe en Etapa 2. Al ver Etapa 1 se reutiliza el
 * allocation declarado en Etapa 2 por el mismo oferente.
 */

/** Región de origen → campo de allocation en rfp_respuestas_r2 */
export const ALLOC_FIELD_POR_REGION = {
  America: 'allocation_america',
  Europa: 'allocation_europa',
  'Asia Puertos Base': 'allocation_asia_pb',
  Asia: 'allocation_asia_restante'
}

export const REGIONES_ALLOC = Object.keys(ALLOC_FIELD_POR_REGION)

const oferKey = (n) => (n || '').trim().toLowerCase()
const r2 = (n) => Math.round((n || 0) * 100) / 100
const r1 = (n) => Math.round((n || 0) * 10) / 10

/**
 * Construye el mapa de allocation mensual declarado (TEUs/mes) por oferente y
 * región. Si un oferente tiene varias submissions, toma el MAYOR valor por
 * región (mismo criterio que usa el ranking de Etapa 2).
 *
 * @param {Array} respuestasR2 - filas de v_rfp_respuestas_r2
 * @returns {Map} oferKey -> { America, Europa, 'Asia Puertos Base', Asia, declarado }
 */
export function construirAllocation(respuestasR2) {
  const map = new Map()
  for (const r of respuestasR2 || []) {
    const k = oferKey(r.oferente)
    if (!k) continue
    if (!map.has(k)) {
      map.set(k, { oferente: r.oferente, America: 0, Europa: 0, 'Asia Puertos Base': 0, Asia: 0, declarado: false })
    }
    const acc = map.get(k)
    for (const reg of REGIONES_ALLOC) {
      const v = numOrNull(r[ALLOC_FIELD_POR_REGION[reg]])
      if (v !== null && v > acc[reg]) {
        acc[reg] = v
        acc.declarado = true
      }
    }
  }
  return map
}

/**
 * Ranking por ruta con capacidad.
 *
 * @param {Array}  porRuta      - salida .porRuta de calcularRanking / calcularRankingR2
 * @param {Array}  volumenes    - filas de v_rfp_volumen_puerto
 * @param {Array}  respuestasR2 - respuestas de Etapa 2 (fuente del allocation)
 * @param {object} opts
 *   @param {string} opts.periodo     - 'anual' (promedio mensual) o clave de mes
 *   @param {string} opts.paisFiltro  - código de país destino o '' (todos)
 *   @param {Array}  opts.regiones    - regiones de origen incluidas (vacío = todas)
 *   @param {number} opts.divisor     - TEUs por contenedor 40' (por defecto 2)
 *   @param {string} opts.ordenarPor  - 'puntaje' (default) o 'costo'
 * @returns {{ rutas: Array, resumen: object }}
 */
export function calcularRankingRutas(porRuta, volumenes, respuestasR2, opts = {}) {
  const periodo = opts.periodo || 'anual'
  const paisFiltro = opts.paisFiltro || ''
  const regionesIncluidas = (opts.regiones && opts.regiones.length) ? new Set(opts.regiones) : null
  const divisor = Number(opts.divisor) > 0 ? Number(opts.divisor) : 2
  const ordenarPor = opts.ordenarPor === 'costo' ? 'costo' : 'puntaje'

  const idx = indexarVolumen(volumenes || [])
  const allocMap = construirAllocation(respuestasR2)

  // --- Agrupar por ruta, deduplicando oferente (si tiene 2 submissions en la
  //     misma ruta se conserva la de MENOR tarifa) ---
  const grupos = new Map()
  for (const r of porRuta || []) {
    if (paisFiltro && r.pais !== paisFiltro) continue
    if (regionesIncluidas && !regionesIncluidas.has(r.region)) continue
    const clave = r.pais + '|' + r.origen
    if (!grupos.has(clave)) grupos.set(clave, new Map())
    const porOfer = grupos.get(clave)
    const k = oferKey(r.oferente)
    const prev = porOfer.get(k)
    if (!prev || Number(r.tarifa) < Number(prev.tarifa)) porOfer.set(k, r)
  }

  const rutas = []
  for (const [clave, porOfer] of grupos) {
    const arr = [...porOfer.values()]
    const base = arr[0]

    // Demanda de la ruta. Con "Anual" se usa el PROMEDIO MENSUAL (anual ÷ 12),
    // porque el allocation es mensual.
    const teusAnual = volumenDe(idx, base.pais, base.origen, 'anual')
    const demandaTeusMes = periodo === 'anual'
      ? teusAnual / 12
      : volumenDe(idx, base.pais, base.origen, periodo)
    // Volumen usado para el COSTO (anual completo o el mes elegido)
    const volumenPeriodo = periodo === 'anual' ? teusAnual : demandaTeusMes
    const regionValida = !!ALLOC_FIELD_POR_REGION[base.region]

    const filas = arr.map((r) => {
      const tarifa = Number(r.tarifa) || 0
      const impresionBL = Number(r.gastoSum) || 0
      const costo = ((tarifa + impresionBL) * volumenPeriodo) / divisor

      const alloc = allocMap.get(oferKey(r.oferente))
      // TEUs/mes que declaró disponibles para la región de este puerto
      const allocTeusMes = (alloc && regionValida) ? (alloc[base.region] || 0) : 0
      // % de la demanda de ESTA ruta que cubre
      const pctCobertura = demandaTeusMes > 0 ? (allocTeusMes / demandaTeusMes) * 100 : 0

      return {
        oferente: r.oferente,
        tarifa,
        impresionBL,
        costo,
        puntaje: r.puntaje,
        diasLibres: r.diasLibres,
        credito: r.credito,
        allocTeusMes,
        allocContMes: allocTeusMes / divisor,
        pctCobertura,
        // TEUs de la ruta que efectivamente podría mover (topado en la demanda)
        cubreTeus: Math.min(allocTeusMes, demandaTeusMes),
        // ¿alcanza solo, sin necesitar a nadie más?
        cubreSolo: allocTeusMes > 0 && allocTeusMes >= demandaTeusMes,
        allocPresente: !!(alloc && alloc.declarado)
      }
    })

    // Orden: por puntaje (igual que el Ranking) o por costo (dinero puro).
    filas.sort((a, b) => ordenarPor === 'costo'
      ? (a.costo - b.costo) || (b.puntaje - a.puntaje)
      : (b.puntaje - a.puntaje) || (a.costo - b.costo))

    const costosValidos = filas.map((f) => f.costo).filter((c) => c > 0)
    const mejorCosto = costosValidos.length ? Math.min(...costosValidos) : 0

    filas.forEach((f, i) => {
      f.puesto = i + 1
      f.gapVs1 = (mejorCosto > 0 && f.costo > 0) ? r2(f.costo - mejorCosto) : 0
      f.costo = r2(f.costo)
      f.allocTeusMes = r2(f.allocTeusMes)
      f.allocContMes = r2(f.allocContMes)
      f.cubreTeus = r2(f.cubreTeus)
      f.pctCobertura = r1(f.pctCobertura)
    })

    rutas.push({
      clave,
      pais: base.pais,
      pais_nombre: base.pais_nombre,
      origen: base.origen,
      region: base.region,
      // demanda
      volumenAnual: r2(teusAnual),
      demandaTeusMes: r2(demandaTeusMes),
      demandaContMes: r2(demandaTeusMes / divisor),
      volumenPeriodo: r2(volumenPeriodo),
      // dinero
      mejorCosto: r2(mejorCosto),
      // capacidad
      cuantosCubren: filas.filter((f) => f.cubreSolo).length,
      mejorCobertura: filas.length ? Math.max(...filas.map((f) => f.pctCobertura)) : 0,
      primeroCubre: !!(filas[0] && filas[0].cubreSolo),
      sinVolumen: demandaTeusMes <= 0,
      sinAllocation: regionValida && filas.every((f) => f.allocTeusMes <= 0),
      regionDesconocida: !regionValida,
      oferentes: filas
    })
  }

  // Rutas ordenadas de la MÁS COSTOSA a la más barata. El costo de una ruta es
  // lo que pagaríamos en ella con su oferente más barato (`mejorCosto`), o sea
  // el dinero realmente en juego en ese lane. Así las rutas que más pesan en el
  // presupuesto quedan arriba.
  rutas.sort((a, b) =>
    b.mejorCosto - a.mejorCosto ||
    b.volumenAnual - a.volumenAnual ||
    (a.pais_nombre || '').localeCompare(b.pais_nombre || '', 'es') ||
    a.origen.localeCompare(b.origen, 'es'))

  const conVolumen = rutas.filter((r) => !r.sinVolumen)
  const evaluables = conVolumen.filter((r) => !r.regionDesconocida)
  const resumen = {
    rutas: rutas.length,
    rutasConVolumen: conVolumen.length,
    // al menos un oferente cubre la ruta completa por sí solo
    rutasConQuienCubra: evaluables.filter((r) => r.cuantosCubren > 0).length,
    // hay capacidad declarada pero nadie alcanza solo
    rutasSinQuienCubra: evaluables.filter((r) => r.cuantosCubren === 0 && !r.sinAllocation).length,
    // el mejor del ranking no alcanza solo (aunque otro sí pueda)
    rutasDondePrimeroNoAlcanza: evaluables.filter((r) => !r.primeroCubre && !r.sinAllocation).length,
    rutasSinAllocation: evaluables.filter((r) => r.sinAllocation).length,
    rutasSoloUnOferente: conVolumen.filter((r) => r.oferentes.length === 1).length,
    rutasRegionDesconocida: conVolumen.filter((r) => r.regionDesconocida).length
  }

  return { rutas, resumen }
}
