import { REGION_POR_ORIGEN, PESOS_R2, RK2_CONFIG_R2, PAISES_MAP, PUERTOS_BASE_CHINA } from '../constantsR2'
import { numOrNull } from './format'

/**
 * Ranking Etapa 2: Calcula puntaje por oferente/ruta
 * 
 * Pesos:
 *   60% Tarifas (mejor tarifa / tarifa actual * 100 * 0.60)
 *    5% Días libres (misma escala que E1)
 *    5% Crédito (2.5 días + 2.5 facturación arribo)
 *    5% Gastos destino (mejor gasto vs peor, interpolado)
 *   15% Allocation (mayor allocation total = 15, resto proporcional)
 *    5% Gastos FOB promedio puertos base China (menor = 5, resto proporcional)
 *    5% Representación/Oficinas (mayor # de "Sí" = 5, resto proporcional)
 */
export function calcularRankingR2(tarifas, respuestas, { pais, campo, regionFiltro, formRegion }) {
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

  // --- Pre-calcular métricas globales para allocation, FOB, representación ---
  // Allocation total por oferente (suma de las 4 regiones)
  const allocationPorOferente = new Map()
  for (const r of respuestas) {
    const ofer = (r.oferente || '').trim().toLowerCase()
    const alloc = (numOrNull(r.allocation_america) || 0) +
      (numOrNull(r.allocation_europa) || 0) +
      (numOrNull(r.allocation_asia_pb) || 0) +
      (numOrNull(r.allocation_asia_restante) || 0)
    if (!allocationPorOferente.has(ofer) || alloc > allocationPorOferente.get(ofer)) {
      allocationPorOferente.set(ofer, alloc)
    }
  }
  const maxAllocation = Math.max(...[...allocationPorOferente.values()].filter((v) => v > 0), 0)

  // Gastos FOB promedio por oferente (promedio de todos los puertos base)
  const fobPorOferente = new Map()
  for (const r of respuestas) {
    const ofer = (r.oferente || '').trim().toLowerCase()
    const fobTotal = calcularFobPromedio(r)
    if (fobTotal !== null) {
      fobPorOferente.set(ofer, fobTotal)
    }
  }
  const fobValues = [...fobPorOferente.values()].filter((v) => v > 0)
  const minFob = fobValues.length ? Math.min(...fobValues) : 0
  const maxFob = fobValues.length ? Math.max(...fobValues) : 0

  // Representación (# de "Sí") por oferente
  const reprePorOferente = new Map()
  for (const r of respuestas) {
    const ofer = (r.oferente || '').trim().toLowerCase()
    const count = contarRepresentacion(r)
    if (!reprePorOferente.has(ofer) || count > reprePorOferente.get(ofer)) {
      reprePorOferente.set(ofer, count)
    }
  }
  const maxRepre = Math.max(...[...reprePorOferente.values()], 0)

  // --- Agrupar por ruta ---
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

    // Gastos destino (misma lógica que E1)
    const gastosArr = arr.map((t) => {
      const sub = subMap.get(t.submission_id)
      if (!sub) return null
      return [sub.gasto_impresion_bl, sub.gasto_retiro_vacio,
        sub.gasto_demora_contenedor_dia, sub.gasto_demora_chasis_dia,
        sub.gasto_chasis_3_ejes]
        .reduce((acc, v) => acc + (v !== null && v !== undefined ? Number(v) : 0), 0)
    })
    const gastosValidos = gastosArr.filter((v) => v !== null && v > 0)
    const menorGasto = gastosValidos.length ? Math.min(...gastosValidos) : 0
    const mayorGasto = gastosValidos.length ? Math.max(...gastosValidos) : 0

    for (let idx = 0; idx < arr.length; idx++) {
      const t = arr[idx]
      const sub = subMap.get(t.submission_id)
      if (!sub) continue

      const oferKey = (t.oferente || sub.oferente || '').trim().toLowerCase()

      // 1. Tarifa (60%)
      const tarifa = Number(t[campo])
      const puntTarifa = mejorTarifa > 0 ? (mejorTarifa / tarifa) * 100 : 0
      const contrib_tarifa = puntTarifa * (PESOS_R2.tarifas / 100)

      // 2. Días libres destino (5%) — misma escala que E1
      const diasLibres = t.dias_libres_destino !== null ? Number(t.dias_libres_destino) : 0
      let contrib_dias = 0
      if (diasLibres >= 21) contrib_dias = 5
      else if (diasLibres >= 15) contrib_dias = 1

      // 3. Crédito (5%) — 2.5 por días + 2.5 por facturación arribo
      const credito = sub.credito_dias !== null ? Number(sub.credito_dias) : 0
      let contrib_credito_dias = 0
      if (credito >= 60) contrib_credito_dias = 2.5
      else if (credito >= 45) contrib_credito_dias = 0.5
      else if (credito > 0) {
        contrib_credito_dias = (credito / 60) * 2.5
      }

      const facturacion = sub.facturacion_aplica || ''
      const contrib_credito_arribo = facturacion === 'arribo' ? 2.5 : 0
      const contrib_credito = contrib_credito_dias + contrib_credito_arribo

      // 4. Gastos destino (5%)
      const gastoSum = gastosArr[idx] || 0
      let contrib_gastos = 0
      if (gastosValidos.length > 0 && gastoSum > 0) {
        if (gastoSum <= menorGasto) contrib_gastos = 5
        else if (gastoSum >= mayorGasto && mayorGasto > menorGasto) contrib_gastos = 1
        else if (mayorGasto > menorGasto) {
          const ratio = (gastoSum - menorGasto) / (mayorGasto - menorGasto)
          contrib_gastos = 5 - ratio * 4
        } else contrib_gastos = 5
      }

      // 5. Allocation (15%) — proporcional al mayor
      const allocOferente = allocationPorOferente.get(oferKey) || 0
      let contrib_allocation = 0
      if (maxAllocation > 0 && allocOferente > 0) {
        contrib_allocation = (allocOferente / maxAllocation) * 15
      }

      // 6. Gastos FOB promedio (5%) — menor = 5, proporcional
      const fobOferente = fobPorOferente.get(oferKey) || 0
      let contrib_fob = 0
      if (minFob > 0 && fobOferente > 0) {
        contrib_fob = (minFob / fobOferente) * 5
      }

      // 7. Representación/Oficinas (5%) — mayor # Sí = 5, proporcional
      const repreOferente = reprePorOferente.get(oferKey) || 0
      let contrib_repre = 0
      if (maxRepre > 0 && repreOferente > 0) {
        contrib_repre = (repreOferente / maxRepre) * 5
      }

      const puntajeTotal = contrib_tarifa + contrib_dias + contrib_credito +
        contrib_gastos + contrib_allocation + contrib_fob + contrib_repre

      porRuta.push({
        origen: t.origen,
        region: REGION_POR_ORIGEN.get(t.origen) || t.region,
        pais_nombre: t.pais_nombre || clave.split('|')[0],
        pais: t.pais,
        oferente: t.oferente || sub.oferente,
        tarifa, mejorTarifa, diasLibres, credito,
        facturacion: facturacion || '',
        gastoSum: Math.round((gastosArr[idx] || 0) * 100) / 100,
        menorGasto: Math.round(menorGasto * 100) / 100,
        mayorGasto: Math.round(mayorGasto * 100) / 100,
        allocOferente: Math.round(allocOferente * 100) / 100,
        maxAllocation,
        fobOferente: Math.round(fobOferente * 100) / 100,
        minFob: Math.round(minFob * 100) / 100,
        repreOferente,
        maxRepre,
        contrib_tarifa: Math.round(contrib_tarifa * 100) / 100,
        contrib_dias: Math.round(contrib_dias * 100) / 100,
        contrib_credito: Math.round(contrib_credito * 100) / 100,
        contrib_gastos: Math.round(contrib_gastos * 100) / 100,
        contrib_allocation: Math.round(contrib_allocation * 100) / 100,
        contrib_fob: Math.round(contrib_fob * 100) / 100,
        contrib_repre: Math.round(contrib_repre * 100) / 100,
        puntaje: Math.round(puntajeTotal * 100) / 100,
        submission_id: t.submission_id
      })
    }
  }

  porRuta.sort((a, b) => b.puntaje - a.puntaje)

  // Agregación global por oferente
  const oferMap = new Map()
  for (const r of porRuta) {
    const clave = r.oferente.trim().toLowerCase() + '|' + r.pais
    if (!oferMap.has(clave)) oferMap.set(clave, {
      oferente: r.oferente, pais: r.pais, pais_nombre: r.pais_nombre,
      rutas: 0, sum_tarifa: 0, sum_dias: 0, sum_credito: 0,
      sum_gastos: 0, sum_allocation: 0, sum_fob: 0, sum_repre: 0, sum_total: 0
    })
    const o = oferMap.get(clave)
    o.rutas++
    o.sum_tarifa += r.contrib_tarifa
    o.sum_dias += r.contrib_dias
    o.sum_credito += r.contrib_credito
    o.sum_gastos += r.contrib_gastos
    o.sum_allocation += r.contrib_allocation
    o.sum_fob += r.contrib_fob
    o.sum_repre += r.contrib_repre
    o.sum_total += r.puntaje
  }

  const global = [...oferMap.values()].map((o) => ({
    oferente: o.oferente, pais: o.pais, pais_nombre: o.pais_nombre, rutas: o.rutas,
    avg_tarifa: Math.round(o.sum_tarifa / o.rutas * 100) / 100,
    avg_dias: Math.round(o.sum_dias / o.rutas * 100) / 100,
    avg_credito: Math.round(o.sum_credito / o.rutas * 100) / 100,
    avg_gastos: Math.round(o.sum_gastos / o.rutas * 100) / 100,
    avg_allocation: Math.round(o.sum_allocation / o.rutas * 100) / 100,
    avg_fob: Math.round(o.sum_fob / o.rutas * 100) / 100,
    avg_repre: Math.round(o.sum_repre / o.rutas * 100) / 100,
    avg_total: Math.round(o.sum_total / o.rutas * 100) / 100
  })).sort((a, b) => b.avg_total - a.avg_total)

  return { porRuta, global }
}

/**
 * Ranking Regional Etapa 2 (CA/VE)
 * Misma lógica que E1 pero sobre datos de ronda 2
 */
export function calcularRankingRegionalR2(tarifas, respuestas, { formRegion, campo }) {
  const config = RK2_CONFIG_R2[formRegion]
  if (!config) return { notaFinal: [], paisDetalles: {}, paisPesos: {}, regionPesos: {}, paisesDestino: [] }

  const { regionPesos, paisPesos } = config
  const paisesDestino = Object.keys(paisPesos)

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

  if (!ratesValidas.length) return { notaFinal: [], paisDetalles: {}, paisPesos, regionPesos, paisesDestino }

  const oferentes = new Set()
  for (const t of ratesValidas) oferentes.add((t.oferente || subMap.get(t.submission_id)?.oferente || '').trim())

  const paisScores = {}
  const paisDetalles = {}

  for (const pais of paisesDestino) {
    const ratesPais = ratesValidas.filter((t) => t.pais === pais)
    paisScores[pais] = {}
    paisDetalles[pais] = []

    const regiones = Object.keys(regionPesos)
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

      const avgs = [...oferAvg.entries()].map(([ofer, o]) => ({ ofer, avg: o.sum / o.count }))
      const mejorAvg = avgs.length ? Math.min(...avgs.map((a) => a.avg)) : 0

      for (const { ofer, avg } of avgs) {
        if (!oferScoresPorRegion[ofer]) oferScoresPorRegion[ofer] = {}
        oferScoresPorRegion[ofer][reg] = mejorAvg > 0 ? (mejorAvg / avg) * 100 : 0
      }
    }

    for (const [ofer, regScores] of Object.entries(oferScoresPorRegion)) {
      let notaPais = 0
      const detalle = { oferente: ofer }
      for (const [reg, peso] of Object.entries(regionPesos)) {
        const score = regScores[reg] || 0
        const contrib = score * (peso / 100)
        notaPais += contrib
        detalle[reg] = Math.round(score * 100) / 100
        detalle[reg + '_contrib'] = Math.round(contrib * 100) / 100
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

  return { notaFinal, paisDetalles, paisPesos, regionPesos, paisesDestino }
}

// --- Funciones auxiliares ---

/**
 * Calcula el promedio de gastos FOB de todos los puertos base para un oferente
 * Toma el promedio del total (sum de 20GP+40GP+40HQ) por cargo, por puerto
 */
function calcularFobPromedio(submission) {
  if (!submission.gastos_fob) return null

  const fobData = typeof submission.gastos_fob === 'string'
    ? JSON.parse(submission.gastos_fob)
    : submission.gastos_fob

  if (!fobData || typeof fobData !== 'object') return null

  let totalSum = 0
  let puertoCount = 0

  for (const puerto of PUERTOS_BASE_CHINA) {
    const puertoData = fobData[puerto]
    if (!puertoData) continue

    let puertoSum = 0
    let hasData = false
    for (const cargo of Object.values(puertoData)) {
      if (typeof cargo === 'object') {
        for (const val of Object.values(cargo)) {
          const n = numOrNull(val)
          if (n !== null && n > 0) { puertoSum += n; hasData = true }
        }
      } else {
        const n = numOrNull(cargo)
        if (n !== null && n > 0) { puertoSum += n; hasData = true }
      }
    }
    if (hasData) {
      totalSum += puertoSum
      puertoCount++
    }
  }

  return puertoCount > 0 ? totalSum / puertoCount : null
}

/**
 * Cuenta el número de "Sí" en representación/oficinas
 */
function contarRepresentacion(submission) {
  if (!submission.representacion) return 0

  const data = typeof submission.representacion === 'string'
    ? JSON.parse(submission.representacion)
    : submission.representacion

  if (!data || typeof data !== 'object') return 0

  let count = 0
  for (const val of Object.values(data)) {
    if (val === true || val === 'si' || val === 'Sí' || val === 'sí' || val === true) count++
  }
  return count
}
