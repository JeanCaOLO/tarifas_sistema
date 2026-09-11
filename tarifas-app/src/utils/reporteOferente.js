import * as XLSX from 'xlsx'
import { getPesosE1, getPesosE2, RUBRO_LABELS } from './rankingConfig'
import { fmtMoney } from './format'

/**
 * Reporte de retroalimentación por oferente.
 *
 * A partir de una fila del ranking global (avg_* + val_*) construye el detalle
 * de cada rubro con su puntaje obtenido, el máximo posible (peso del rubro) y
 * el % de aprovechamiento, ordena de menor a mayor aprovechamiento e identifica
 * los rubros más bajos para dar retroalimentación al oferente.
 */

// Descripción de qué mejorar según el rubro
const SUGERENCIAS = {
  tarifas: 'Ofrecer tarifas más competitivas: el puntaje se calcula respecto a la tarifa más baja de cada ruta.',
  dias_libres: 'Aumentar los días libres en destino para alcanzar los tramos de mayor puntaje.',
  credito: 'Ampliar los días de crédito y/o ajustar las condiciones de facturación.',
  gastos_destino: 'Reducir los gastos en destino; se comparan contra el menor gasto de cada ruta.',
  herramienta: 'Ofrecer una herramienta de seguimiento de carga.',
  allocation: 'Aumentar el allocation mensual ofrecido (TEUs por región).',
  gastos_fob: 'Reducir los gastos FOB promedio en los puertos base de China.',
  representacion: 'Ampliar la representación/oficinas propias en los países destino.'
}

/**
 * Construye el detalle de rubros de un oferente (fila del ranking global).
 * @param {object} row - fila de `global` del ranking
 * @param {object} pesos - pesos por rubro (máximo de cada uno)
 * @param {string} etapa - '1' | '2'
 */
export function construirDetalleRubros(row, pesos, etapa) {
  // Mapeo rubro -> valor promedio de contribución y valor original del oferente
  const mapa = {
    tarifas: { obtenido: row.avg_tarifa, valor: descTarifa(row) },
    dias_libres: { obtenido: row.avg_dias, valor: descRango(row.val_dias, '', ' días') },
    credito: { obtenido: row.avg_credito, valor: descCredito(row, etapa) },
    gastos_destino: { obtenido: row.avg_gastos, valor: descRango(row.val_gastos, '$') }
  }
  if (etapa === '1') {
    mapa.herramienta = { obtenido: row.avg_herramienta, valor: row.val_herramienta && row.val_herramienta.trim() ? row.val_herramienta : '(ninguna)' }
  } else {
    mapa.allocation = { obtenido: row.avg_allocation, valor: `${row.val_alloc ?? 0} TEUs` }
    mapa.gastos_fob = { obtenido: row.avg_fob, valor: row.val_fob ? `$${fmtMoney(row.val_fob)} prom.` : '(sin dato)' }
    mapa.representacion = { obtenido: row.avg_repre, valor: `${row.val_repre ?? 0} "Sí"` }
  }

  const detalle = Object.entries(mapa).map(([rubro, info]) => {
    const maximo = pesos[rubro] ?? 0
    const obtenido = Math.round((info.obtenido || 0) * 100) / 100
    const aprovech = maximo > 0 ? Math.round((obtenido / maximo) * 1000) / 10 : 0
    return {
      rubro,
      label: RUBRO_LABELS[rubro] || rubro,
      obtenido,
      maximo,
      aprovechamiento: aprovech, // %
      brecha: Math.round((maximo - obtenido) * 100) / 100,
      valor: info.valor,
      sugerencia: SUGERENCIAS[rubro] || ''
    }
  })

  // Ordenar de menor a mayor aprovechamiento (peor primero)
  detalle.sort((a, b) => a.aprovechamiento - b.aprovechamiento)
  return detalle
}

/**
 * Devuelve los rubros más bajos (mayor brecha). Un rubro se considera "bajo"
 * si su aprovechamiento es < 60%. Siempre devuelve al menos el peor.
 */
export function rubrosMasBajos(detalle) {
  const bajos = detalle.filter((d) => d.maximo > 0 && d.aprovechamiento < 60)
  return bajos.length ? bajos : detalle.slice(0, 1)
}

/**
 * Exporta un Excel de retroalimentación para un oferente.
 */
export function exportarReporteOferente(row, etapa) {
  const pesos = etapa === '1' ? getPesosE1() : getPesosE2()
  const detalle = construirDetalleRubros(row, pesos, etapa)
  const bajos = rubrosMasBajos(detalle)

  const wb = XLSX.utils.book_new()

  const aoa = [
    [`REPORTE DE EVALUACIÓN — ETAPA ${etapa}`],
    [],
    ['Oferente', row.oferente],
    ['País', row.pais_nombre || row.pais],
    ['Rutas evaluadas', row.rutas],
    ['Nota total (promedio)', row.avg_total],
    [],
    ['RESUMEN: RUBROS DE MENOR A MAYOR DESEMPEÑO'],
    ['Rubro', 'Valor ofrecido', 'Puntos obtenidos', 'Puntos máximos', 'Aprovechamiento', 'Brecha'],
    ...detalle.map((d) => [
      d.label, d.valor, d.obtenido, d.maximo, `${d.aprovechamiento}%`, d.brecha
    ]),
    [],
    ['⚠ RUBRO(S) MÁS BAJO(S) — OPORTUNIDADES DE MEJORA'],
    ...bajos.flatMap((d) => [
      [`• ${d.label}`, `${d.obtenido} de ${d.maximo} pts (${d.aprovechamiento}%)`],
      ['   Valor ofrecido', d.valor],
      ['   Sugerencia', d.sugerencia],
      []
    ])
  ]

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 26 }, { wch: 34 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, ws, 'Evaluación')

  const nombre = String(row.oferente || 'Oferente').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 40)
  XLSX.writeFile(wb, `Reporte_E${etapa}_${nombre}_${row.pais}.xlsx`)
}

/* ---------- Helpers de descripción ---------- */
function descRango(rango, prefijo = '', sufijo = '') {
  if (!rango) return '(sin dato)'
  const f = (v) => prefijo + fmtMoney(v) + sufijo
  return rango.min === rango.max ? f(rango.min) : `${f(rango.min)} – ${f(rango.max)}`
}

function descTarifa(row) {
  return descRango(row.val_tarifa, '$')
}

function descCredito(row, etapa) {
  const dias = row.val_credito ?? 0
  if (etapa === '2') {
    return `${dias} días · facturación: ${row.val_facturacion || '(no indicada)'}`
  }
  return `${dias} días`
}
