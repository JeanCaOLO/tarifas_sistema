import * as XLSX from 'xlsx'

/**
 * Exportaciones de respuestas de Etapa 1 (RFP ronda 1).
 */

/**
 * Exporta una sola oferta de Etapa 1 a Excel (resumen + tarifas).
 */
export function exportarOferta(submission, tarifas) {
  const wb = XLSX.utils.book_new()

  const region = Array.isArray(submission.region) ? submission.region.join(', ') : (submission.region || '')

  const resumen = [
    ['OFERTA ETAPA 1 — RESUMEN'],
    [],
    ['Oferente', submission.oferente],
    ['Correo', submission.email_contacto || ''],
    ['País', submission.pais_nombre || submission.pais],
    ['Región', region],
    ['Folio', String(submission.id).slice(0, 8).toUpperCase()],
    ['Fecha', submission.created_at],
    ['Vigencia del', submission.vigencia_del || ''],
    ['Vigencia al', submission.vigencia_al || ''],
    [],
    ['CONDICIONES COMERCIALES'],
    ['Las tarifas incluyen', submission.tarifas_incluyen || ''],
    ['Las tarifas NO incluyen', submission.tarifas_no_incluyen || ''],
    ['Herramienta de seguimiento', submission.herramienta_seguimiento || ''],
    ['Crédito (días)', submission.credito_dias ?? ''],
    ['Observaciones', submission.observaciones || ''],
    [],
    ['GASTOS EN DESTINO (USD)'],
    ['Impresión de BL', submission.gasto_impresion_bl ?? ''],
    ['Retiro de vacío', submission.gasto_retiro_vacio ?? ''],
    ['Demoras contenedor por día', submission.gasto_demora_contenedor_dia ?? ''],
    ['Demoras chasis por día', submission.gasto_demora_chasis_dia ?? ''],
    ['Chasis 3 ejes', submission.gasto_chasis_3_ejes ?? ''],
    ['Estadías', submission.gasto_estadias ?? '']
  ]
  const wsResumen = XLSX.utils.aoa_to_sheet(resumen)
  wsResumen['!cols'] = [{ wch: 34 }, { wch: 44 }]
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen')

  const wsTarifas = XLSX.utils.aoa_to_sheet(tarifasAoA(tarifas))
  wsTarifas['!cols'] = COLS_TARIFAS
  XLSX.utils.book_append_sheet(wb, wsTarifas, 'Tarifas')

  const folioTxt = String(submission.id).slice(0, 8).toUpperCase()
  XLSX.writeFile(wb, `Oferta_R1_${submission.oferente}_${submission.pais}_${folioTxt}.xlsx`)
}

/**
 * Exporta TODAS las ofertas de Etapa 1 (resumen plano).
 * Hoja 1: una fila por oferente. Hoja 2: tarifas planas.
 */
export function exportarTodas(respuestas, tarifas) {
  const wb = XLSX.utils.book_new()

  const headers = ['Fecha', 'Folio', 'País', 'Región', 'Oferente', 'Correo', 'Rutas cotizadas',
    'Vigencia del', 'Vigencia al', 'Tarifas incluyen', 'Tarifas NO incluyen',
    'Herramienta seguimiento', 'Crédito (días)',
    'Gasto Impresión BL', 'Gasto Retiro Vacío', 'Demora Contenedor/día', 'Demora Chasis/día',
    'Chasis 3 ejes', 'Estadías', 'Observaciones']
  const rows = [headers]
  for (const r of respuestas) {
    const region = Array.isArray(r.region) ? r.region.join(', ') : (r.region || '')
    rows.push([
      r.created_at, String(r.id).slice(0, 8).toUpperCase(), r.pais_nombre || r.pais, region,
      r.oferente, r.email_contacto || '', r.rutas_cotizadas ?? '',
      r.vigencia_del || '', r.vigencia_al || '', r.tarifas_incluyen || '', r.tarifas_no_incluyen || '',
      r.herramienta_seguimiento || '', r.credito_dias ?? '',
      r.gasto_impresion_bl ?? '', r.gasto_retiro_vacio ?? '', r.gasto_demora_contenedor_dia ?? '', r.gasto_demora_chasis_dia ?? '',
      r.gasto_chasis_3_ejes ?? '', r.gasto_estadias ?? '', r.observaciones || ''
    ])
  }
  const wsResp = XLSX.utils.aoa_to_sheet(rows)
  wsResp['!cols'] = headers.map(() => ({ wch: 18 }))
  XLSX.utils.book_append_sheet(wb, wsResp, 'Respuestas')

  const tHeaders = ['Oferente', 'País', 'Origen', 'Región', 'Destino', 'Días Libres Origen', 'Días Libres Destino',
    'Naviera(s)', 'Tiempo tránsito', 'Puerto Arribo', 'Tarifa 20" STD', 'Tarifa 40" STD', 'Tarifa 40" HC']
  const tRows = [tHeaders]
  for (const t of tarifas) {
    tRows.push([
      t.oferente || '', t.pais_nombre || t.pais, t.origen, t.region, t.destino,
      t.dias_libres_origen ?? '', t.dias_libres_destino ?? '',
      t.navieras || '', t.tiempo_transito || '', t.puerto_arribo || '',
      t.tarifa_20_std ?? '', t.tarifa_40_std ?? '', t.tarifa_40_hc ?? ''
    ])
  }
  const wsTar = XLSX.utils.aoa_to_sheet(tRows)
  wsTar['!cols'] = tHeaders.map(() => ({ wch: 18 }))
  XLSX.utils.book_append_sheet(wb, wsTar, 'Tarifas')

  const fecha = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `Ofertas_R1_Todas_${fecha}.xlsx`)
}

/**
 * Exporta TODAS las ofertas de Etapa 1 en formato DETALLE:
 * una hoja por oferente con su resumen completo + tarifas.
 */
export function exportarTodasDetalle(respuestas, tarifas) {
  const wb = XLSX.utils.book_new()

  const tarifasPorSub = new Map()
  for (const t of tarifas) {
    if (!tarifasPorSub.has(t.submission_id)) tarifasPorSub.set(t.submission_id, [])
    tarifasPorSub.get(t.submission_id).push(t)
  }

  const usados = new Set()
  respuestas.forEach((submission, idx) => {
    const tars = tarifasPorSub.get(submission.id) || []
    const region = Array.isArray(submission.region) ? submission.region.join(', ') : (submission.region || '')

    const detalle = [
      ['OFERTA ETAPA 1 — DETALLE'],
      [],
      ['Oferente', submission.oferente],
      ['Correo', submission.email_contacto || ''],
      ['País', submission.pais_nombre || submission.pais],
      ['Región', region],
      ['Folio', String(submission.id).slice(0, 8).toUpperCase()],
      ['Fecha', submission.created_at],
      ['Vigencia del', submission.vigencia_del || ''],
      ['Vigencia al', submission.vigencia_al || ''],
      [],
      ['CONDICIONES COMERCIALES'],
      ['Las tarifas incluyen', submission.tarifas_incluyen || ''],
      ['Las tarifas NO incluyen', submission.tarifas_no_incluyen || ''],
      ['Herramienta de seguimiento', submission.herramienta_seguimiento || ''],
      ['Crédito (días)', submission.credito_dias ?? ''],
      ['Observaciones', submission.observaciones || ''],
      [],
      ['GASTOS EN DESTINO (USD)'],
      ['Impresión de BL', submission.gasto_impresion_bl ?? ''],
      ['Retiro de vacío', submission.gasto_retiro_vacio ?? ''],
      ['Demoras contenedor por día', submission.gasto_demora_contenedor_dia ?? ''],
      ['Demoras chasis por día', submission.gasto_demora_chasis_dia ?? ''],
      ['Chasis 3 ejes', submission.gasto_chasis_3_ejes ?? ''],
      ['Estadías', submission.gasto_estadias ?? ''],
      [],
      [`TARIFAS COTIZADAS (${tars.length})`],
      ...tarifasAoA(tars)
    ]

    const ws = XLSX.utils.aoa_to_sheet(detalle)
    ws['!cols'] = COLS_TARIFAS
    XLSX.utils.book_append_sheet(wb, ws, nombreHojaUnico(submission.oferente, idx, usados))
  })

  const fecha = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `Ofertas_R1_Detalle_${fecha}.xlsx`)
}

// --- Helpers ---

const COLS_TARIFAS = [{ wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
  { wch: 22 }, { wch: 16 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 14 }]

function tarifasAoA(tarifas) {
  const headers = ['Origen', 'Región', 'Destino', 'Días Libres Origen', 'Días Libres Destino',
    'Naviera(s)', 'Tiempo tránsito', 'Puerto Arribo', 'Tarifa 20" STD', 'Tarifa 40" STD', 'Tarifa 40" HC']
  return [headers, ...tarifas.map((t) => [
    t.origen, t.region, t.destino,
    t.dias_libres_origen ?? '', t.dias_libres_destino ?? '',
    t.navieras || '', t.tiempo_transito || '', t.puerto_arribo || '',
    t.tarifa_20_std ?? '', t.tarifa_40_std ?? '', t.tarifa_40_hc ?? ''
  ])]
}

function nombreHojaUnico(oferente, idx, usados) {
  let base = String(oferente || `Oferente ${idx + 1}`).replace(/[:\\/?*[\]]/g, ' ').trim()
  const sufijo = ` (${idx + 1})`
  base = base.slice(0, 31 - sufijo.length)
  let nombre = `${base}${sufijo}`
  let n = idx + 1
  while (usados.has(nombre)) {
    n++
    const s = ` (${n})`
    nombre = `${base.slice(0, 31 - s.length)}${s}`
  }
  usados.add(nombre)
  return nombre
}
