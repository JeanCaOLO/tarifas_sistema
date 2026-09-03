import * as XLSX from 'xlsx'
import { PUERTOS_BASE_CHINA, CARGOS_FOB, CONTENEDORES_FOB } from '../constantsR2'

const REPRE_LABELS = {
  america: 'América', europa: 'Europa'
}

/**
 * Exporta una sola oferta de Etapa 2 a Excel (con todas sus tarifas y condiciones)
 */
export function exportarOfertaR2(submission, tarifas) {
  const wb = XLSX.utils.book_new()

  // --- Hoja 1: Resumen de la oferta ---
  const allocTotal = (Number(submission.allocation_america) || 0) + (Number(submission.allocation_europa) || 0) +
    (Number(submission.allocation_asia_pb) || 0) + (Number(submission.allocation_asia_restante) || 0)

  const region = Array.isArray(submission.region) ? submission.region.join(', ') : (submission.region || '')

  const resumen = [
    ['OFERTA ETAPA 2 — RESUMEN'],
    [],
    ['Oferente', submission.oferente],
    ['Correo', submission.email_contacto || ''],
    ['País', submission.pais_nombre || submission.pais],
    ['Región', region],
    ['Fecha', submission.created_at],
    ['Vigencia del', submission.vigencia_del || ''],
    ['Vigencia al', submission.vigencia_al || ''],
    [],
    ['CONDICIONES COMERCIALES'],
    ['Las tarifas incluyen', submission.tarifas_incluyen || ''],
    ['Las tarifas NO incluyen', submission.tarifas_no_incluyen || ''],
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
    ['ALLOCATION MENSUAL (TEUS)'],
    ['América', submission.allocation_america ?? ''],
    ['Europa', submission.allocation_europa ?? ''],
    ['Asia Puertos Base', submission.allocation_asia_pb ?? ''],
    ['Asia (restante)', submission.allocation_asia_restante ?? ''],
    ['Total', allocTotal],
    [],
    ['REPRESENTACIÓN / OFICINAS'],
    ...representacionRows(submission.representacion)
  ]

  const wsResumen = XLSX.utils.aoa_to_sheet(resumen)
  wsResumen['!cols'] = [{ wch: 34 }, { wch: 44 }]
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen')

  // --- Hoja 2: Tarifas ---
  const headers = ['Origen', 'Región', 'Destino', 'Días Libres Origen', 'Días Libres Destino',
    'Naviera(s)', 'Tiempo tránsito', 'Puerto Arribo', 'Tarifa 20" STD', 'Tarifa 40" STD', 'Tarifa 40" HC']
  const filas = [headers]
  for (const t of tarifas) {
    filas.push([
      t.origen, t.region, t.destino,
      t.dias_libres_origen ?? '', t.dias_libres_destino ?? '',
      t.navieras || '', t.tiempo_transito || '', t.puerto_arribo || '',
      t.tarifa_20_std ?? '', t.tarifa_40_std ?? '', t.tarifa_40_hc ?? ''
    ])
  }
  const wsTarifas = XLSX.utils.aoa_to_sheet(filas)
  wsTarifas['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
    { wch: 22 }, { wch: 16 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, wsTarifas, 'Tarifas')

  const folioTxt = String(submission.id).slice(0, 8).toUpperCase()
  XLSX.writeFile(wb, `Oferta_R2_${submission.oferente}_${submission.pais}_${folioTxt}.xlsx`)
}

/**
 * Exporta TODAS las ofertas de Etapa 2 a un solo Excel
 * Hoja 1: todas las respuestas (resumen)
 * Hoja 2: todas las tarifas planas
 */
export function exportarTodasR2(respuestas, tarifas) {
  const wb = XLSX.utils.book_new()

  // --- Hoja 1: Respuestas ---
  const headers = ['Fecha', 'Folio', 'País', 'Región', 'Oferente', 'Correo', 'Rutas cotizadas',
    'Alloc. América', 'Alloc. Europa', 'Alloc. Asia PB', 'Alloc. Asia Rest.', 'Alloc. Total',
    'Vigencia del', 'Vigencia al', 'Tarifas incluyen', 'Tarifas NO incluyen',
    'Gasto Impresión BL', 'Gasto Retiro Vacío', 'Demora Contenedor/día', 'Demora Chasis/día',
    'Chasis 3 ejes', 'Estadías', 'Representación', 'Observaciones']
  const rows = [headers]

  for (const r of respuestas) {
    const region = Array.isArray(r.region) ? r.region.join(', ') : (r.region || '')
    const allocTotal = (Number(r.allocation_america) || 0) + (Number(r.allocation_europa) || 0) +
      (Number(r.allocation_asia_pb) || 0) + (Number(r.allocation_asia_restante) || 0)
    rows.push([
      r.created_at, String(r.id).slice(0, 8).toUpperCase(), r.pais_nombre || r.pais, region,
      r.oferente, r.email_contacto || '', r.rutas_cotizadas ?? '',
      r.allocation_america ?? '', r.allocation_europa ?? '', r.allocation_asia_pb ?? '', r.allocation_asia_restante ?? '', allocTotal,
      r.vigencia_del || '', r.vigencia_al || '', r.tarifas_incluyen || '', r.tarifas_no_incluyen || '',
      r.gasto_impresion_bl ?? '', r.gasto_retiro_vacio ?? '', r.gasto_demora_contenedor_dia ?? '', r.gasto_demora_chasis_dia ?? '',
      r.gasto_chasis_3_ejes ?? '', r.gasto_estadias ?? '', representacionTexto(r.representacion), r.observaciones || ''
    ])
  }
  const wsResp = XLSX.utils.aoa_to_sheet(rows)
  wsResp['!cols'] = headers.map(() => ({ wch: 18 }))
  XLSX.utils.book_append_sheet(wb, wsResp, 'Respuestas')

  // --- Hoja 2: Tarifas planas ---
  const subMap = new Map()
  for (const r of respuestas) subMap.set(r.id, r)

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
  XLSX.writeFile(wb, `Ofertas_R2_Todas_${fecha}.xlsx`)
}

/**
 * Exporta TODAS las ofertas de Etapa 2 en formato DETALLE:
 * una hoja por oferente con su resumen completo + tarifas (igual que la descarga individual).
 */
export function exportarTodasDetalleR2(respuestas, tarifas) {
  const wb = XLSX.utils.book_new()

  // Agrupar tarifas por submission
  const tarifasPorSub = new Map()
  for (const t of tarifas) {
    if (!tarifasPorSub.has(t.submission_id)) tarifasPorSub.set(t.submission_id, [])
    tarifasPorSub.get(t.submission_id).push(t)
  }

  const usados = new Set()
  respuestas.forEach((submission, idx) => {
    const tars = tarifasPorSub.get(submission.id) || []

    const allocTotal = (Number(submission.allocation_america) || 0) + (Number(submission.allocation_europa) || 0) +
      (Number(submission.allocation_asia_pb) || 0) + (Number(submission.allocation_asia_restante) || 0)
    const region = Array.isArray(submission.region) ? submission.region.join(', ') : (submission.region || '')
    const folioTxt = String(submission.id).slice(0, 8).toUpperCase()

    const detalle = [
      ['OFERTA ETAPA 2 — DETALLE'],
      [],
      ['Oferente', submission.oferente],
      ['Correo', submission.email_contacto || ''],
      ['País', submission.pais_nombre || submission.pais],
      ['Región', region],
      ['Folio', folioTxt],
      ['Fecha', submission.created_at],
      ['Vigencia del', submission.vigencia_del || ''],
      ['Vigencia al', submission.vigencia_al || ''],
      [],
      ['CONDICIONES COMERCIALES'],
      ['Las tarifas incluyen', submission.tarifas_incluyen || ''],
      ['Las tarifas NO incluyen', submission.tarifas_no_incluyen || ''],
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
      ['ALLOCATION MENSUAL (TEUS)'],
      ['América', submission.allocation_america ?? ''],
      ['Europa', submission.allocation_europa ?? ''],
      ['Asia Puertos Base', submission.allocation_asia_pb ?? ''],
      ['Asia (restante)', submission.allocation_asia_restante ?? ''],
      ['Total', allocTotal],
      [],
      ['REPRESENTACIÓN / OFICINAS'],
      ...representacionRows(submission.representacion),
      [],
      [`TARIFAS COTIZADAS (${tars.length})`],
      ['Origen', 'Región', 'Destino', 'Días Libres Origen', 'Días Libres Destino',
        'Naviera(s)', 'Tiempo tránsito', 'Puerto Arribo', 'Tarifa 20" STD', 'Tarifa 40" STD', 'Tarifa 40" HC'],
      ...tars.map((t) => [
        t.origen, t.region, t.destino,
        t.dias_libres_origen ?? '', t.dias_libres_destino ?? '',
        t.navieras || '', t.tiempo_transito || '', t.puerto_arribo || '',
        t.tarifa_20_std ?? '', t.tarifa_40_std ?? '', t.tarifa_40_hc ?? ''
      ])
    ]

    const ws = XLSX.utils.aoa_to_sheet(detalle)
    ws['!cols'] = [{ wch: 34 }, { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
      { wch: 22 }, { wch: 16 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, ws, nombreHojaUnico(submission.oferente, idx, usados))
  })

  const fecha = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `Ofertas_R2_Detalle_${fecha}.xlsx`)
}

/**
 * Genera un nombre de hoja válido y único (Excel limita a 31 caracteres
 * y no permite los caracteres : \ / ? * [ ]).
 */
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

/**
 * Exporta una condición operativa a Excel (incluye FOB detallado)
 */
export function exportarCondicionOperativa(condOp) {
  const wb = XLSX.utils.book_new()

  const region = Array.isArray(condOp.region) ? condOp.region.join(', ') : (condOp.region || '')

  const resumen = [
    ['CONDICIONES OPERATIVAS — ETAPA 2'],
    [],
    ['Oferente', condOp.oferente],
    ['Correo', condOp.email_contacto || ''],
    ['Región', region],
    ['Fecha', condOp.created_at],
    [],
    ['CRÉDITO Y FACTURACIÓN'],
    ['Crédito (días)', condOp.credito_dias ?? ''],
    ['Facturación aplica a partir de', condOp.facturacion_aplica || ''],
    [],
    ['CONDICIONES OPERATIVAS'],
    ['Herramienta seguimiento', condOp.herramienta_seguimiento || ''],
    ['Descripción herramienta', condOp.herramienta_descripcion || ''],
    ['Integración API', condOp.integracion_api || ''],
    ['Recursos operativos', condOp.recursos_operativos || ''],
    ['Observaciones', condOp.observaciones || ''],
    ['Observaciones FOB', condOp.obs_fob || '']
  ]
  const wsResumen = XLSX.utils.aoa_to_sheet(resumen)
  wsResumen['!cols'] = [{ wch: 34 }, { wch: 50 }]
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen')

  // Hoja FOB
  const fob = parseJson(condOp.gastos_fob)
  const fobHeaders = ['Puerto', 'Cargo', '20GP (CNY)', '40GP (CNY)', '40HQ (CNY)', 'Unidad', 'Observación']
  const fobRows = [fobHeaders]
  for (const puerto of PUERTOS_BASE_CHINA) {
    const pData = fob?.[puerto]
    for (const cargo of CARGOS_FOB) {
      const cData = pData?.[cargo.key] || {}
      fobRows.push([
        `${puerto}, China`, cargo.label,
        cData['20GP'] ?? '', cData['40GP'] ?? '', cData['40HQ'] ?? '',
        cData.unidad || '', cData.observacion || ''
      ])
    }
  }
  const wsFob = XLSX.utils.aoa_to_sheet(fobRows)
  wsFob['!cols'] = [{ wch: 20 }, { wch: 26 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 24 }]
  XLSX.utils.book_append_sheet(wb, wsFob, 'Gastos FOB')

  const folioTxt = String(condOp.id).slice(0, 8).toUpperCase()
  XLSX.writeFile(wb, `CondicionesOperativas_${condOp.oferente}_${folioTxt}.xlsx`)
}

/**
 * Exporta TODAS las condiciones operativas a un único Excel.
 * Hoja 1: resumen (una fila por oferente).
 * Hoja 2: gastos FOB planos (una fila por oferente/puerto/cargo).
 */
export function exportarTodasCondicionesOperativas(lista) {
  const wb = XLSX.utils.book_new()
  const items = lista || []

  // Hoja 1: Resumen
  const resHeaders = [
    'Oferente', 'Correo', 'Región', 'Fecha',
    'Crédito (días)', 'Facturación aplica a partir de',
    'Herramienta seguimiento', 'Descripción herramienta',
    'Integración API', 'Recursos operativos', 'Observaciones', 'Observaciones FOB'
  ]
  const resRows = [resHeaders]
  for (const c of items) {
    const region = Array.isArray(c.region) ? c.region.join(', ') : (c.region || '')
    resRows.push([
      c.oferente || '', c.email_contacto || '', region, c.created_at || '',
      c.credito_dias ?? '', c.facturacion_aplica || '',
      c.herramienta_seguimiento || '', c.herramienta_descripcion || '',
      c.integracion_api || '', c.recursos_operativos || '',
      c.observaciones || '', c.obs_fob || ''
    ])
  }
  const wsRes = XLSX.utils.aoa_to_sheet(resRows)
  wsRes['!cols'] = [
    { wch: 24 }, { wch: 26 }, { wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 26 },
    { wch: 22 }, { wch: 30 }, { wch: 18 }, { wch: 30 }, { wch: 30 }, { wch: 30 }
  ]
  XLSX.utils.book_append_sheet(wb, wsRes, 'Resumen')

  // Hoja 2: Gastos FOB planos
  const fobHeaders = ['Oferente', 'Puerto', 'Cargo', '20GP (CNY)', '40GP (CNY)', '40HQ (CNY)', 'Unidad', 'Observación']
  const fobRows = [fobHeaders]
  for (const c of items) {
    const fob = parseJson(c.gastos_fob)
    for (const puerto of PUERTOS_BASE_CHINA) {
      const pData = fob?.[puerto]
      for (const cargo of CARGOS_FOB) {
        const cData = pData?.[cargo.key] || {}
        fobRows.push([
          c.oferente || '', `${puerto}, China`, cargo.label,
          cData['20GP'] ?? '', cData['40GP'] ?? '', cData['40HQ'] ?? '',
          cData.unidad || '', cData.observacion || ''
        ])
      }
    }
  }
  const wsFob = XLSX.utils.aoa_to_sheet(fobRows)
  wsFob['!cols'] = [{ wch: 24 }, { wch: 20 }, { wch: 26 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 24 }]
  XLSX.utils.book_append_sheet(wb, wsFob, 'Gastos FOB')

  XLSX.writeFile(wb, `CondicionesOperativas_Todas_${items.length}.xlsx`)
}

// --- Helpers ---
function parseJson(v) {
  if (!v) return null
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return null } }
  return v
}

function representacionTexto(rep) {
  const data = parseJson(rep)
  if (!data) return ''
  const sies = []
  for (const [k, v] of Object.entries(data)) {
    if (v === true) {
      if (k.startsWith('china_')) sies.push(k.replace('china_', '').replace(/^\w/, (c) => c.toUpperCase()))
      else if (k === 'destino') sies.push('Destino')
      else sies.push(k)
    }
  }
  return sies.join(', ')
}

function representacionRows(rep) {
  const data = parseJson(rep)
  if (!data) return [['(sin datos)', '']]
  const rows = []
  for (const [k, v] of Object.entries(data)) {
    let label = k
    if (k.startsWith('china_')) label = 'China - ' + k.replace('china_', '').replace(/^\w/, (c) => c.toUpperCase())
    else if (k === 'destino') label = 'Oficina en Destino'
    rows.push([label, v === true ? 'Sí' : 'No'])
  }
  return rows.length ? rows : [['(sin datos)', '']]
}
