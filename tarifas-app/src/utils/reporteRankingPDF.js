import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fmtMoney } from './format'

const TEAL = [15, 95, 87]
const REG_LABELS = { America: 'America', Europa: 'Europa', 'Asia Puertos Base': 'Asia PB', Asia: 'Asia' }

function encabezado(doc, titulo, subtitulo) {
  const W = doc.internal.pageSize.getWidth()
  doc.setFillColor(TEAL[0], TEAL[1], TEAL[2])
  doc.rect(0, 0, W, 64, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16)
  doc.text(titulo, 40, 32)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  doc.text(subtitulo, 40, 50)
  doc.setFontSize(9)
  doc.text(new Date().toLocaleDateString('es'), W - 40, 32, { align: 'right' })
}

function pie(doc) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const pages = doc.internal.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setTextColor(150, 150, 150); doc.setFontSize(8)
    doc.text(`Tarifas Maritimas - RFP 2026-2027   |   Pagina ${p} de ${pages}`, W / 2, H - 18, { align: 'center' })
  }
}

function tituloSeccion(doc, texto, y) {
  if (y > doc.internal.pageSize.getHeight() - 80) { doc.addPage(); y = 50 }
  doc.setTextColor(TEAL[0], TEAL[1], TEAL[2]); doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
  doc.text(texto, 40, y)
  doc.setFont('helvetica', 'normal')
  return y + 8
}

/**
 * PDF resumen ejecutivo del RANKING (global por oferente + por ruta).
 * @param {object} data - { porRuta, global }
 * @param {object} meta - { etapa, campo, pesos, regionesTxt }
 */
export function exportarRankingPDF(data, meta) {
  const { global, porRuta } = data
  const { etapa, campo, pesos, regionesTxt } = meta
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const campoTxt = campo === 'tarifa_20_std' ? '20" STD' : campo === 'tarifa_40_hc' ? '40" HC' : '40" STD'
  encabezado(doc, `Ranking de Oferentes - Etapa ${etapa}`, `Resumen ejecutivo  |  Tarifa base: ${campoTxt}  |  Regiones: ${regionesTxt || 'Todas'}`)

  let y = 82

  // --- Ranking global ---
  y = tituloSeccion(doc, 'Ranking Global por Oferente', y)
  const esE2 = etapa === '2'
  const head = esE2
    ? [['#', 'Oferente', 'Pais', 'Rutas', `Tarifa(${pesos.tarifas})`, `Dias(${pesos.dias_libres})`, `Cred(${pesos.credito})`, `Alloc(${pesos.allocation})`, `Repr(${pesos.representacion})`, 'Total']]
    : [['#', 'Oferente', 'Pais', 'Rutas', `Tarifa(${pesos.tarifas})`, `Dias(${pesos.dias_libres})`, `Cred(${pesos.credito})`, `Herram(${pesos.herramienta})`, 'Total']]
  const body = global.map((o, i) => esE2
    ? [i + 1, o.oferente, o.pais_nombre || o.pais, o.rutas, o.avg_tarifa.toFixed(2), o.avg_dias.toFixed(2), o.avg_credito.toFixed(2), o.avg_allocation.toFixed(2), o.avg_repre.toFixed(2), o.avg_total.toFixed(2)]
    : [i + 1, o.oferente, o.pais_nombre || o.pais, o.rutas, o.avg_tarifa.toFixed(2), o.avg_dias.toFixed(2), o.avg_credito.toFixed(2), o.avg_herramienta.toFixed(2), o.avg_total.toFixed(2)])
  autoTable(doc, {
    startY: y + 4, head, body,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: TEAL, textColor: 255, fontStyle: 'bold' },
    margin: { left: 40, right: 40 }
  })
  y = doc.lastAutoTable.finalY + 18

  // --- Ranking por ruta (agrupado) ---
  const rutasMap = new Map()
  for (const r of porRuta) {
    const clave = r.pais + '|' + r.origen
    if (!rutasMap.has(clave)) rutasMap.set(clave, [])
    rutasMap.get(clave).push(r)
  }
  for (const arr of rutasMap.values()) arr.sort((a, b) => b.puntaje - a.puntaje)
  const rutasOrden = [...rutasMap.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))

  y = tituloSeccion(doc, 'Ranking por Ruta', y)
  for (const [, items] of rutasOrden) {
    const r0 = items[0]
    if (y > doc.internal.pageSize.getHeight() - 90) { doc.addPage(); y = 50 }
    doc.setTextColor(40, 40, 40); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
    doc.text(`${r0.origen} -> ${r0.pais_nombre || r0.pais}  (${r0.region})`, 40, y + 4)
    doc.setFont('helvetica', 'normal')
    const rHead = esE2
      ? [['#', 'Oferente', 'Tarifa', 'P.Tarifa', 'Dias', 'Cred', 'Alloc', 'Repr', 'Total']]
      : [['#', 'Oferente', 'Tarifa', 'P.Tarifa', 'Dias', 'Cred', 'Herram', 'Total']]
    const rBody = items.map((r, i) => esE2
      ? [i + 1, r.oferente, '$' + fmtMoney(r.tarifa), r.contrib_tarifa.toFixed(2), r.contrib_dias.toFixed(2), r.contrib_credito.toFixed(2), r.contrib_allocation.toFixed(2), r.contrib_repre.toFixed(2), r.puntaje.toFixed(2)]
      : [i + 1, r.oferente, '$' + fmtMoney(r.tarifa), r.contrib_tarifa.toFixed(2), r.contrib_dias.toFixed(2), r.contrib_credito.toFixed(2), r.contrib_herramienta.toFixed(2), r.puntaje.toFixed(2)])
    autoTable(doc, {
      startY: y + 10, head: rHead, body: rBody,
      styles: { fontSize: 7.5, cellPadding: 2.5 },
      headStyles: { fillColor: [76, 106, 100], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      margin: { left: 40, right: 40 }
    })
    y = doc.lastAutoTable.finalY + 12
  }

  pie(doc)
  const fecha = new Date().toISOString().slice(0, 10)
  doc.save(`Ranking_E${etapa}_${fecha}.pdf`)
}

/**
 * PDF resumen ejecutivo del RANKING REGIONAL (pesos por pais + nota final + detalle por pais).
 * @param {object} resultado - salida de calcularRankingRegional / R2
 * @param {object} meta - { etapa, formRegion, campo }
 */
export function exportarRankingRegionalPDF(resultado, meta) {
  const { notaFinal, paisDetalles, paisPesos, regionPesosPorPais, paisesDestino } = resultado
  const { etapa, formRegion, campo } = meta
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const campoTxt = campo === 'tarifa_20_std' ? '20" STD' : campo === 'tarifa_40_hc' ? '40" HC' : '40" STD'
  encabezado(doc, `Ranking Regional - Etapa ${etapa}`, `Resumen ejecutivo  |  Region: ${formRegion}  |  Tarifa base: ${campoTxt}`)
  const regs = ['America', 'Europa', 'Asia Puertos Base', 'Asia']

  let y = 82

  // --- Distribucion de pesos por pais ---
  y = tituloSeccion(doc, 'Distribucion de pesos por pais (segun volumen real)', y)
  autoTable(doc, {
    startY: y + 4,
    head: [['Pais destino', 'Peso pais', ...regs.map((r) => REG_LABELS[r])]],
    body: (paisesDestino || []).map((p) => {
      const pesos = (regionPesosPorPais && regionPesosPorPais[p]) || {}
      return [nombrePais(p), (paisPesos[p] ?? '') + '%', ...regs.map((r) => pesos[r] != null ? pesos[r] + '%' : '-')]
    }),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: TEAL, textColor: 255, fontStyle: 'bold' },
    margin: { left: 40, right: 40 }
  })
  y = doc.lastAutoTable.finalY + 18

  // --- Nota final ---
  y = tituloSeccion(doc, 'Nota Final por Oferente', y)
  autoTable(doc, {
    startY: y + 4,
    head: [['#', 'Oferente', ...(paisesDestino || []).map((p) => `${nombrePais(p)} (${paisPesos[p]}%)`), 'Nota Final']],
    body: notaFinal.map((row, i) => [
      i + 1, row.oferente,
      ...(paisesDestino || []).map((p) => (row[p] ?? 0).toFixed(2)),
      row.notaFinal.toFixed(2)
    ]),
    styles: { fontSize: 8.5, cellPadding: 3 },
    headStyles: { fillColor: TEAL, textColor: 255, fontStyle: 'bold' },
    margin: { left: 40, right: 40 }
  })
  y = doc.lastAutoTable.finalY + 18

  // --- Detalle por pais destino ---
  for (const pais of (paisesDestino || [])) {
    const items = paisDetalles[pais] || []
    if (!items.length) continue
    const pesos = (regionPesosPorPais && regionPesosPorPais[pais]) || {}
    const regsPais = Object.keys(pesos)
    if (y > doc.internal.pageSize.getHeight() - 100) { doc.addPage(); y = 50 }
    y = tituloSeccion(doc, `Detalle - ${nombrePais(pais)} (peso ${paisPesos[pais]}%)`, y)
    autoTable(doc, {
      startY: y + 4,
      head: [['#', 'Oferente', ...regsPais.map((r) => `${REG_LABELS[r] || r} (${pesos[r]}%)`), 'Nota Pais']],
      body: items.map((d, i) => [
        i + 1, d.oferente,
        ...regsPais.map((r) => (d[r] ?? 0).toFixed(1)),
        d.notaPais.toFixed(2)
      ]),
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [76, 106, 100], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      margin: { left: 40, right: 40 }
    })
    y = doc.lastAutoTable.finalY + 14
  }

  pie(doc)
  const fecha = new Date().toISOString().slice(0, 10)
  doc.save(`Ranking_Regional_E${etapa}_${formRegion}_${fecha}.pdf`)
}

function nombrePais(code) {
  const m = { CR: 'Costa Rica', SV: 'El Salvador', GT: 'Guatemala', VNZ: 'Venezuela' }
  return m[code] || code
}
