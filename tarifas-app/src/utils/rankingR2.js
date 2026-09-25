import { REGION_POR_ORIGEN, PESOS_R2, RK2_CONFIG_R2, PAISES_MAP, PUERTOS_BASE_CHINA } from '../constantsR2'
import { numOrNull } from './format'
import { getPesosE2, getReglasE2, getRegionalE2, getVolumenConfig } from './rankingConfig'
import { indexarVolumen, volumenDe } from './volumen'

/**
 * Aplica una regla de tramos {alto:{min,pts}, medio:{min,pts}} a un valor.
 */
function puntosPorTramoR2(valor, regla) {
  if (regla.alto && valor >= regla.alto.min) return regla.alto.pts
  if (regla.medio && valor >= regla.medio.min) return regla.medio.pts
  return 0
}

/**
 * Re-normaliza los pesos de región a 100% tomando solo las regiones incluidas.
 * Si `incluidas` es null/undefined o vacío, devuelve los pesos originales.
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
 * Puntos por posición (Opción A): 1º=100, 2º=80, 3º=60, 4º=40, 5º=20, ...
 * Fórmula: max(0, 100 - (puesto-1) × 20). Puesto 0 (sin cotización) = 0.
 */
function puntosPorPuesto(puesto) {
  if (!puesto || puesto < 1) return 0
  return Math.max(0, 100 - (puesto - 1) * 20)
}

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
export function calcularRankingR2(tarifas, respuestas, { pais, campo, regionFiltro, formRegion, volumenes, divisor }) {
  const pesos = getPesosE2()
  const reglas = getReglasE2()
  // Volumen para ponderar la tarifa (mismo criterio que Etapa 1).
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

    // Volumen del puerto (según país destino).
    const volumenRuta = usaVolumen ? volumenDe(volIdx, arr[0].pais, arr[0].origen, 'anual') : 0

    // Gastos destino (misma lógica que E1): solo el costo de impresión de BL
    const gastosArr = arr.map((t) => {
      const sub = subMap.get(t.submission_id)
      if (!sub) return null
      const v = sub.gasto_impresion_bl
      return (v !== null && v !== undefined) ? Number(v) : 0
    })
    const gastosValidos = gastosArr.filter((v) => v !== null && v > 0)
    const menorGasto = gastosValidos.length ? Math.min(...gastosValidos) : 0
    const mayorGasto = gastosValidos.length ? Math.max(...gastosValidos) : 0

    // Costo ponderado por volumen por oferente y el mejor (menor).
    // costo = (tarifa + impresión BL) × volumen ÷ divisor
    const costosArr = arr.map((t, i) => ((Number(t[campo]) + (gastosArr[i] || 0)) * volumenRuta) / divVol)
    const costosValidos = costosArr.filter((c) => c > 0)
    const mejorCosto = costosValidos.length ? Math.min(...costosValidos) : 0

    for (let idx = 0; idx < arr.length; idx++) {
      const t = arr[idx]
      const sub = subMap.get(t.submission_id)
      if (!sub) continue

      const oferKey = (t.oferente || sub.oferente || '').trim().toLowerCase()

      // 1. Tarifa (peso configurable) — ponderada por volumen (costo)
      const tarifa = Number(t[campo])
      const costoOferente = costosArr[idx]
      let puntTarifa = 0
      if (usaVolumen) {
        puntTarifa = (mejorCosto > 0 && costoOferente > 0) ? (mejorCosto / costoOferente) * 100 : 0
      } else {
        puntTarifa = mejorTarifa > 0 ? (mejorTarifa / tarifa) * 100 : 0
      }
      const contrib_tarifa = puntTarifa * (pesos.tarifas / 100)

      // 2. Días libres destino — tramos configurables
      const diasLibres = t.dias_libres_destino !== null ? Number(t.dias_libres_destino) : 0
      const contrib_dias = puntosPorTramoR2(diasLibres, reglas.dias)

      // 3. Crédito — puntos por días + puntos por facturación al arribo (configurable)
      const credito = sub.credito_dias !== null ? Number(sub.credito_dias) : 0
      const cr = reglas.credito || {}
      const creditoDiasMax = cr.creditoDiasMax ?? 2.5
      const crDias = cr.dias || { alto: { min: 60, pts: 2.5 }, medio: { min: 45, pts: 0.5 } }
      let contrib_credito_dias = 0
      if (crDias.alto && credito >= crDias.alto.min) contrib_credito_dias = crDias.alto.pts
      else if (crDias.medio && credito >= crDias.medio.min) contrib_credito_dias = crDias.medio.pts
      else if (credito > 0) contrib_credito_dias = (credito / (crDias.alto?.min || 60)) * creditoDiasMax

      const facturacion = sub.facturacion_aplica || ''
      const contrib_credito_arribo = facturacion === 'arribo' ? (cr.facturacionArriboPts ?? 2.5) : 0
      const contrib_credito = contrib_credito_dias + contrib_credito_arribo

      // 4. Gastos destino — la impresión de BL ya se contempla en el costo de
      // tarifa. El rubro Gastos ya NO suma a la nota.
      const gastoSum = gastosArr[idx] || 0
      const contrib_gastos = 0

      // 5. Allocation — proporcional al mayor (peso configurable)
      const allocOferente = allocationPorOferente.get(oferKey) || 0
      let contrib_allocation = 0
      if (maxAllocation > 0 && allocOferente > 0) {
        contrib_allocation = (allocOferente / maxAllocation) * pesos.allocation
      }

      // 6. Gastos FOB — ya NO suma a la nota (se conserva el valor solo informativo)
      const fobOferente = fobPorOferente.get(oferKey) || 0
      const contrib_fob = 0

      // 7. Representación/Oficinas — mayor # Sí = máximo, proporcional (peso configurable)
      const repreOferente = reprePorOferente.get(oferKey) || 0
      let contrib_repre = 0
      if (maxRepre > 0 && repreOferente > 0) {
        contrib_repre = (repreOferente / maxRepre) * pesos.representacion
      }

      // Gastos y FOB ya no suman a la nota.
      const puntajeTotal = contrib_tarifa + contrib_dias + contrib_credito +
        contrib_allocation + contrib_repre

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
      rutas: 0, sum_dias: 0, sum_credito: 0,
      sum_gastos: 0, sum_allocation: 0, sum_fob: 0, sum_repre: 0,
      sum_costo: 0, sum_mejorCosto: 0,
      // valores originales del oferente
      val_tarifas: [], val_dias: [], val_credito: r.credito, val_facturacion: r.facturacion,
      val_gastos: [], val_alloc: r.allocOferente, val_fob: r.fobOferente, val_repre: r.repreOferente
    })
    const o = oferMap.get(clave)
    o.rutas++
    o.sum_dias += r.contrib_dias
    o.sum_credito += r.contrib_credito
    o.sum_gastos += r.contrib_gastos
    o.sum_allocation += r.contrib_allocation
    o.sum_fob += r.contrib_fob
    o.sum_repre += r.contrib_repre
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
    // TARIFA global ponderada por volumen (costo total)
    const avg_tarifa = (usaVolumen && o.sum_costo > 0)
      ? Math.round((o.sum_mejorCosto / o.sum_costo) * pesos.tarifas * 100) / 100
      : 0
    const avg_dias = Math.round(o.sum_dias / o.rutas * 100) / 100
    const avg_credito = Math.round(o.sum_credito / o.rutas * 100) / 100
    const avg_gastos = Math.round(o.sum_gastos / o.rutas * 100) / 100
    const avg_allocation = Math.round(o.sum_allocation / o.rutas * 100) / 100
    const avg_fob = Math.round(o.sum_fob / o.rutas * 100) / 100
    const avg_repre = Math.round(o.sum_repre / o.rutas * 100) / 100
    const avg_total = Math.round((avg_tarifa + avg_dias + avg_credito + avg_gastos + avg_allocation + avg_fob + avg_repre) * 100) / 100
    return {
      oferente: o.oferente, pais: o.pais, pais_nombre: o.pais_nombre, rutas: o.rutas,
      avg_tarifa, avg_dias, avg_credito, avg_gastos, avg_allocation, avg_fob, avg_repre, avg_total,
      costoTotal: Math.round(o.sum_costo * 100) / 100,
      mejorCostoTotal: Math.round(o.sum_mejorCosto * 100) / 100,
      // valores originales para tooltips
      val_tarifa: rango(o.val_tarifas),
      val_dias: rango(o.val_dias),
      val_credito: o.val_credito,
      val_facturacion: o.val_facturacion,
      val_gastos: rango(o.val_gastos),
      val_alloc: o.val_alloc,
      val_fob: o.val_fob,
      val_repre: o.val_repre
    }
  }).sort((a, b) => b.avg_total - a.avg_total)

  return { porRuta, global }
}

/**
 * Ranking Regional Etapa 2 (CA/VE)
 * Misma lógica que E1 pero sobre datos de ronda 2
 */
export function calcularRankingRegionalR2(tarifas, respuestas, { formRegion, campo, regionesIncluidas, volumenes, divisor }) {
  const config = getRegionalE2()[formRegion]
  if (!config) return { notaFinal: [], paisDetalles: {}, paisPesos: {}, regionPesos: {}, paisesDestino: [] }

  const { paisPesos } = config
  const paisesDestino = Object.keys(paisPesos)

  // Pesos de región por país (según volumen real) — solo informativos aquí.
  const regionPesos = renormalizarRegionPesos(config.regionPesos, regionesIncluidas)
  const regionPesosPorPais = {}
  for (const p of paisesDestino) {
    regionPesosPorPais[p] = renormalizarRegionPesos(
      (config.regionPesosPorPais && config.regionPesosPorPais[p]) || config.regionPesos,
      regionesIncluidas
    )
  }

  // Filtrar cotizaciones a la región (CA/VE) y a las regiones de origen incluidas.
  const subMap = new Map()
  for (const r of respuestas) subMap.set(r.id, r)
  const regInclSet = (regionesIncluidas && regionesIncluidas.length) ? new Set(regionesIncluidas) : null
  const tarifasRegion = tarifas.filter((t) => {
    const sub = subMap.get(t.submission_id)
    if (!sub) return false
    const reg = Array.isArray(sub.region) ? sub.region : (sub.region ? [sub.region] : [])
    if (!reg.includes(formRegion)) return false
    if (regInclSet) {
      const ro = REGION_POR_ORIGEN.get(t.origen) || t.region
      if (!regInclSet.has(ro)) return false
    }
    return true
  })

  // === CLAVE: el puesto por país sale del RANKING NORMAL (mismo criterio) ===
  // Reutilizamos calcularRankingR2, que agrupa el `global` por oferente|país con
  // su nota total (avg_total = costo total ponderado por volumen + otros rubros).
  const { global } = calcularRankingR2(tarifasRegion, respuestas, {
    pais: '', campo, regionFiltro: '', formRegion, volumenes, divisor
  })

  // Puesto de cada oferente por país según la nota del ranking normal.
  const puestoPorPais = {}
  const notaRankingPorPais = {}    // guarda avg_total del ranking por oferente|país
  for (const pais of paisesDestino) {
    const delPais = global.filter((g) => g.pais === pais && g.avg_total > 0)
      .sort((a, b) => b.avg_total - a.avg_total)
    puestoPorPais[pais] = new Map()
    notaRankingPorPais[pais] = new Map()
    delPais.forEach((g, i) => {
      const k = g.oferente.trim().toLowerCase()
      puestoPorPais[pais].set(k, i + 1)
      notaRankingPorPais[pais].set(k, g.avg_total)
    })
  }

  // Lista de oferentes presentes
  const oferentes = new Set()
  for (const g of global) oferentes.add(g.oferente)

  // paisDetalles: para la tabla de detalle mostramos el puesto y la nota del ranking.
  const paisDetalles = {}
  for (const pais of paisesDestino) {
    const filas = []
    for (const g of global.filter((x) => x.pais === pais)) {
      const k = g.oferente.trim().toLowerCase()
      filas.push({
        oferente: g.oferente,
        puesto: puestoPorPais[pais].get(k) || 0,
        notaRanking: g.avg_total,
        rutas: g.rutas
      })
    }
    filas.sort((a, b) => (a.puesto || 999) - (b.puesto || 999))
    paisDetalles[pais] = filas
  }

  // NOTA FINAL por POSICIÓN: puntos por puesto (del ranking) ponderados por país.
  const notaFinal = []
  for (const ofer of oferentes) {
    const k = ofer.trim().toLowerCase()
    let totalPonderado = 0
    const row = { oferente: ofer }
    for (const [pais, peso] of Object.entries(paisPesos)) {
      const puesto = puestoPorPais[pais]?.get(k) || 0
      const puntos = puntosPorPuesto(puesto)
      row[pais] = Math.round((notaRankingPorPais[pais]?.get(k) || 0) * 100) / 100 // nota del ranking (informativa)
      row[pais + '_puesto'] = puesto
      row[pais + '_puntos'] = puntos
      totalPonderado += puntos * (peso / 100)
    }
    row.notaFinal = Math.round(totalPonderado * 100) / 100
    notaFinal.push(row)
  }
  notaFinal.sort((a, b) => b.notaFinal - a.notaFinal)

  return { notaFinal, paisDetalles, paisPesos, regionPesos, regionPesosPorPais, paisesDestino }
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

  const esSi = (v) => {
    if (v === true || v === 1) return true
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase()
      return s === 'si' || s === 'sí' || s === 'true' || s === '1' || s === 'x' || s === 'yes'
    }
    return false
  }

  let count = 0
  for (const val of Object.values(data)) {
    if (esSi(val)) count++
  }
  return count
}
