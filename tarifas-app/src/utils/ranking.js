import { REGION_POR_ORIGEN, RK2_CONFIG, PAISES_MAP } from '../constants'
import { numOrNull } from './format'
import { getPesosE1, getReglasE1, getRegionalE1, getVolumenConfig } from './rankingConfig'
import { indexarVolumen, volumenDe } from './volumen'

/**
 * Aplica una regla de tramos {alto:{min,pts}, medio:{min,pts}, bajo} a un valor.
 */
function puntosPorTramo(valor, regla) {
  if (regla.alto && valor >= regla.alto.min) return regla.alto.pts
  if (regla.medio && valor >= regla.medio.min) return regla.medio.pts
  return regla.bajo ?? 0
}

/**
 * Re-normaliza los pesos de región a 100% tomando solo las regiones incluidas.
 * Si `incluidas` es null/undefined o vacío, devuelve los pesos originales.
 * Ejemplo: pesos {A:70,E:3,Am:7,As:20}, incluidas [A, As] (suman 90)
 *   → {A: 70/90*100 = 77.8, As: 20/90*100 = 22.2}
 */
function renormalizarRegionPesos(regionPesos, incluidas) {
  if (!incluidas || !incluidas.length) return regionPesos
  const set = new Set(incluidas)
  const activos = Object.entries(regionPesos).filter(([reg]) => set.has(reg))
  const suma = activos.reduce((a, [, p]) => a + (Number(p) || 0), 0)
  if (suma <= 0) return regionPesos
  const out = {}
  for (const [reg, p] of activos) {
    out[reg] = Math.round((Number(p) / suma) * 100 * 100) / 100
  }
  return out
}

/**
 * Ranking 1: Calcula puntaje por oferente/ruta
 * Pesos y reglas configurables (ver rankingConfig). Por defecto:
 * 80% tarifa + 5% días libres + 5% crédito + 5% gastos + 5% herramienta
 */
export function calcularRanking(tarifas, respuestas, { pais, campo, regionFiltro, formRegion, volumenes, divisor }) {
  const pesos = getPesosE1()
  const reglas = getReglasE1()
  // Volumen para ponderar la tarifa: costo = tarifa × volumen ÷ divisor.
  // La "mejor tarifa" pasa a ser el "mejor costo" (menor). Si no hay volumen
  // en el puerto, el puntaje de tarifa de esa ruta es 0.
  const volIdx = indexarVolumen(volumenes || [])
  const usaVolumen = (volumenes || []).length > 0
  const divVol = Number(divisor) > 0 ? Number(divisor) : (Number(getVolumenConfig().divisor) > 0 ? Number(getVolumenConfig().divisor) : 2)
  let rates = (pais ? tarifas.filter((t) => t.pais === pais) : tarifas)
    .filter((t) => t[campo] !== null && Number(t[campo]) > 0)

  if (regionFiltro) {
    rates = rates.filter((t) => {
      const regionOrigen = REGION_POR_ORIGEN.get(t.origen) || t.region || ''
      if (regionFiltro === 'Asia') return regionOrigen.startsWith('Asia')
      return regionOrigen === regionFiltro
    })
  }

  if (formRegion) {
    const subMap = new Map()
    for (const r of respuestas) subMap.set(r.id, r)
    rates = rates.filter((t) => {
      const sub = subMap.get(t.submission_id)
      if (!sub || !sub.region) return false
      const reg = Array.isArray(sub.region) ? sub.region : [sub.region]
      return reg.includes(formRegion)
    })
  }

  if (!rates.length) return { porRuta: [], global: [] }

  const subMap = new Map()
  for (const r of respuestas) subMap.set(r.id, r)

  const grupos = new Map()
  for (const t of rates) {
    const clave = t.pais + '|' + t.origen
    if (!grupos.has(clave)) grupos.set(clave, [])
    grupos.get(clave).push(t)
  }

  const porRuta = []

  for (const [clave, arr] of grupos) {
    const tarifas_arr = arr.map((t) => Number(t[campo]))
    const mejorTarifa = Math.min(...tarifas_arr)

    // Volumen del puerto de esta ruta (según país destino, total anual).
    // Es el mismo para todos los oferentes de la ruta.
    const volumenRuta = usaVolumen ? volumenDe(volIdx, arr[0].pais, arr[0].origen, 'anual') : 0

    // Gasto de impresión de BL por oferente (rubro Gastos y parte del costo de tarifa)
    const gastosArr = arr.map((t) => {
      const sub = subMap.get(t.submission_id)
      if (!sub) return null
      const v = sub.gasto_impresion_bl
      return (v !== null && v !== undefined) ? Number(v) : 0
    })
    const gastosValidos = gastosArr.filter((v) => v !== null && v > 0)
    const menorGasto = gastosValidos.length ? Math.min(...gastosValidos) : 0
    const mayorGasto = gastosValidos.length ? Math.max(...gastosValidos) : 0

    // Costo ponderado por volumen de cada oferente y el mejor (menor).
    // costo = (tarifa × volumen ÷ divisor) + (impresión BL × volumen ÷ divisor)
    //       = (tarifa + impresión BL) × volumen ÷ divisor
    const costosArr = arr.map((t, i) => ((Number(t[campo]) + (gastosArr[i] || 0)) * volumenRuta) / divVol)
    const costosValidos = costosArr.filter((c) => c > 0)
    const mejorCosto = costosValidos.length ? Math.min(...costosValidos) : 0

    for (let idx = 0; idx < arr.length; idx++) {
      const t = arr[idx]
      const sub = subMap.get(t.submission_id)
      if (!sub) continue

      const tarifa = Number(t[campo])
      // Puntaje de tarifa ponderado por volumen: se usa el COSTO (tarifa×volumen÷divisor).
      // El menor costo de la ruta obtiene 100. Sin volumen en el puerto → 0.
      const costoOferente = costosArr[idx]
      let puntTarifa = 0
      if (usaVolumen) {
        puntTarifa = (mejorCosto > 0 && costoOferente > 0) ? (mejorCosto / costoOferente) * 100 : 0
      } else {
        // Sin volúmenes cargados, se mantiene el comportamiento por tarifa cruda.
        puntTarifa = mejorTarifa > 0 ? (mejorTarifa / tarifa) * 100 : 0
      }
      const contrib_tarifa = puntTarifa * (pesos.tarifas / 100)

      const diasLibres = t.dias_libres_destino !== null ? Number(t.dias_libres_destino) : 0
      const contrib_dias = puntosPorTramo(diasLibres, reglas.dias)

      const credito = sub.credito_dias !== null ? Number(sub.credito_dias) : 0
      const contrib_credito = puntosPorTramo(credito, reglas.credito)

      // La impresión de BL (gastoSum) ya se contempla dentro del costo de tarifa.
      // El rubro Gastos ya NO suma a la nota.
      const gastoSum = gastosArr[idx] || 0
      const contrib_gastos = 0

      const herramienta = sub.herramienta_seguimiento
      const contrib_herramienta = (herramienta && herramienta.trim().length > 0)
        ? (reglas.herramienta?.si ?? 5)
        : (reglas.herramienta?.no ?? 0)
      const puntajeTotal = contrib_tarifa + contrib_dias + contrib_credito + contrib_herramienta

      porRuta.push({
        origen: t.origen,
        region: REGION_POR_ORIGEN.get(t.origen) || t.region,
        pais_nombre: t.pais_nombre || clave.split('|')[0],
        pais: t.pais,
        oferente: t.oferente || sub.oferente,
        tarifa, mejorTarifa, diasLibres, credito,
        volumenRuta: Math.round(volumenRuta * 100) / 100,
        costoOferente: Math.round((costoOferente || 0) * 100) / 100,
        mejorCosto: Math.round(mejorCosto * 100) / 100,
        gastoSum: Math.round((gastosArr[idx] || 0) * 100) / 100,
        menorGasto: Math.round(menorGasto * 100) / 100,
        mayorGasto: Math.round(mayorGasto * 100) / 100,
        herramienta: herramienta || '',
        contrib_tarifa: Math.round(contrib_tarifa * 100) / 100,
        contrib_dias, contrib_credito,
        contrib_gastos: Math.round(contrib_gastos * 100) / 100,
        contrib_herramienta,
        puntaje: Math.round(puntajeTotal * 100) / 100,
        submission_id: t.submission_id
      })
    }
  }

  porRuta.sort((a, b) => b.puntaje - a.puntaje)

  const oferMap = new Map()
  for (const r of porRuta) {
    const clave = r.oferente.trim().toLowerCase() + '|' + r.pais
    if (!oferMap.has(clave)) oferMap.set(clave, {
      oferente: r.oferente, pais: r.pais, pais_nombre: r.pais_nombre, rutas: 0,
      sum_dias: 0, sum_credito: 0, sum_gastos: 0, sum_herramienta: 0,
      // Para la tarifa ponderada por volumen: costo total y mejor costo posible
      sum_costo: 0, sum_mejorCosto: 0,
      // valores originales del oferente
      val_tarifas: [], val_dias: [], val_credito: r.credito, val_gastos: [], val_herramienta: r.herramienta
    })
    const o = oferMap.get(clave)
    o.rutas++
    o.sum_dias += r.contrib_dias
    o.sum_credito += r.contrib_credito
    o.sum_gastos += r.contrib_gastos
    o.sum_herramienta += r.contrib_herramienta
    o.sum_costo += (r.costoOferente || 0)
    o.sum_mejorCosto += (r.mejorCosto || 0)
    o.val_tarifas.push(r.tarifa)
    o.val_dias.push(r.diasLibres)
    if (r.gastoSum > 0) o.val_gastos.push(r.gastoSum)
  }

  const rango = (arr) => {
    if (!arr.length) return null
    const min = Math.min(...arr), max = Math.max(...arr)
    return { min: Math.round(min * 100) / 100, max: Math.round(max * 100) / 100 }
  }

  const global = [...oferMap.values()].map((o) => {
    // TARIFA global ponderada por volumen (costo total):
    // puntaje = (mejor costo total ÷ costo total del oferente) × peso
    // El "mejor costo total" es la suma de los mejores costos de sus rutas.
    let avg_tarifa
    if (usaVolumen) {
      avg_tarifa = (o.sum_costo > 0)
        ? Math.round((o.sum_mejorCosto / o.sum_costo) * pesos.tarifas * 100) / 100
        : 0
    } else {
      // Sin volumen: promedio simple de la contribución por ruta (comportamiento previo)
      avg_tarifa = 0 // (no debería ocurrir aquí; se mantiene por seguridad)
    }
    const avg_dias = Math.round(o.sum_dias / o.rutas * 100) / 100
    const avg_credito = Math.round(o.sum_credito / o.rutas * 100) / 100
    const avg_gastos = Math.round(o.sum_gastos / o.rutas * 100) / 100
    const avg_herramienta = Math.round(o.sum_herramienta / o.rutas * 100) / 100
    const avg_total = Math.round((avg_tarifa + avg_dias + avg_credito + avg_gastos + avg_herramienta) * 100) / 100
    return {
      oferente: o.oferente, pais: o.pais, pais_nombre: o.pais_nombre, rutas: o.rutas,
      avg_tarifa, avg_dias, avg_credito, avg_gastos, avg_herramienta, avg_total,
      // costos para tooltip
      costoTotal: Math.round(o.sum_costo * 100) / 100,
      mejorCostoTotal: Math.round(o.sum_mejorCosto * 100) / 100,
      // valores originales para tooltips
      val_tarifa: rango(o.val_tarifas),
      val_dias: rango(o.val_dias),
      val_credito: o.val_credito,
      val_gastos: rango(o.val_gastos),
      val_herramienta: o.val_herramienta
    }
  }).sort((a, b) => b.avg_total - a.avg_total)

  return { porRuta, global }
}

/**
 * Ranking 2: Regional (CA/VE)
 */
export function calcularRankingRegional(tarifas, respuestas, { formRegion, campo, regionesIncluidas }) {
  const config = getRegionalE1()[formRegion]
  if (!config) return { notaFinal: [], paisDetalles: {}, paisPesos: {} }

  // Pesos por región, re-normalizados a 100% según las regiones incluidas.
  // Así, al excluir Europa/América, su peso se reparte proporcionalmente entre
  // las regiones seleccionadas y la Nota País sigue siendo comparable a 100.
  const regionPesos = renormalizarRegionPesos(config.regionPesos, regionesIncluidas)
  const { paisPesos } = config
  const paisesDestino = Object.keys(paisPesos)
  // Pesos de región por país (según volumen real). Si no hay, usa el del bloque.
  const pesosDePais = (pais) => renormalizarRegionPesos(
    (config.regionPesosPorPais && config.regionPesosPorPais[pais]) || config.regionPesos,
    regionesIncluidas
  )
  // Pesos por país para exponer a la UI
  const regionPesosPorPais = {}
  for (const p of paisesDestino) regionPesosPorPais[p] = pesosDePais(p)

  const subMap = new Map()
  for (const r of respuestas) subMap.set(r.id, r)

  const ratesValidas = tarifas.filter((t) => {
    if (!paisesDestino.includes(t.pais)) return false
    if (t[campo] === null || Number(t[campo]) <= 0) return false
    const sub = subMap.get(t.submission_id)
    if (!sub) return false
    const reg = Array.isArray(sub.region) ? sub.region : (sub.region ? [sub.region] : [])
    return reg.includes(formRegion)
  })

  if (!ratesValidas.length) return { notaFinal: [], paisDetalles: {}, paisPesos }

  const oferentes = new Set()
  for (const t of ratesValidas) oferentes.add((t.oferente || subMap.get(t.submission_id)?.oferente || '').trim())

  const paisScores = {}
  const paisDetalles = {}

  for (const pais of paisesDestino) {
    const ratesPais = ratesValidas.filter((t) => t.pais === pais)
    paisScores[pais] = {}
    paisDetalles[pais] = []

    const pesosPais = regionPesosPorPais[pais]
    const regiones = Object.keys(pesosPais)
    const oferScoresPorRegion = {}

    for (const reg of regiones) {
      const ratesReg = ratesPais.filter((t) => {
        const regionOrigen = REGION_POR_ORIGEN.get(t.origen) || t.region || ''
        if (reg === 'Asia') return regionOrigen === 'Asia'
        if (reg === 'Asia Puertos Base') return regionOrigen === 'Asia Puertos Base'
        return regionOrigen === reg
      })

      const oferAvg = new Map()
      for (const t of ratesReg) {
        const ofer = (t.oferente || subMap.get(t.submission_id)?.oferente || '').trim()
        if (!oferAvg.has(ofer)) oferAvg.set(ofer, { sum: 0, count: 0 })
        const o = oferAvg.get(ofer)
        o.sum += Number(t[campo])
        o.count++
      }

      const avgs = [...oferAvg.entries()].map(([ofer, o]) => ({ ofer, avg: o.sum / o.count, count: o.count }))
      const mejorAvg = avgs.length ? Math.min(...avgs.map((a) => a.avg)) : 0

      for (const { ofer, avg, count } of avgs) {
        if (!oferScoresPorRegion[ofer]) oferScoresPorRegion[ofer] = {}
        oferScoresPorRegion[ofer][reg] = {
          score: mejorAvg > 0 ? (mejorAvg / avg) * 100 : 0,
          avg, mejorAvg, count,
        }
      }
    }

    for (const [ofer, regScores] of Object.entries(oferScoresPorRegion)) {
      let notaPais = 0
      const detalle = { oferente: ofer }
      for (const [reg, peso] of Object.entries(pesosPais)) {
        const info = regScores[reg] || { score: 0, avg: null, mejorAvg: null, count: 0 }
        const score = info.score || 0
        const contrib = score * (peso / 100)
        notaPais += contrib
        detalle[reg] = Math.round(score * 100) / 100
        detalle[reg + '_contrib'] = Math.round(contrib * 100) / 100
        detalle[reg + '_avg'] = info.avg != null ? Math.round(info.avg * 100) / 100 : null
        detalle[reg + '_best'] = info.mejorAvg != null && info.mejorAvg > 0 ? Math.round(info.mejorAvg * 100) / 100 : null
        detalle[reg + '_rutas'] = info.count || 0
      }
      detalle.notaPais = Math.round(notaPais * 100) / 100
      paisScores[pais][ofer] = detalle
      paisDetalles[pais].push(detalle)
    }
    paisDetalles[pais].sort((a, b) => b.notaPais - a.notaPais)
  }

  const notaFinal = []
  for (const ofer of oferentes) {
    let totalPonderado = 0
    const row = { oferente: ofer }
    for (const [pais, peso] of Object.entries(paisPesos)) {
      const score = paisScores[pais]?.[ofer]?.notaPais || 0
      row[pais] = Math.round(score * 100) / 100
      totalPonderado += score * (peso / 100)
    }
    row.notaFinal = Math.round(totalPonderado * 100) / 100
    notaFinal.push(row)
  }
  notaFinal.sort((a, b) => b.notaFinal - a.notaFinal)

  return { notaFinal, paisDetalles, paisPesos, regionPesos, regionPesosPorPais, paisesDestino }
}
