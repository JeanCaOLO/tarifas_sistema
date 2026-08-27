import * as XLSX from 'xlsx'
import { ORIGENES, PUERTOS, RATE_FIELDS, PUERTOS_BASE_CHINA, CARGOS_FOB, CONTENEDORES_FOB } from '../constantsR2'
import { numOrNull } from './format'

/**
 * Descarga plantilla Excel para Etapa 2 (solo tarifas)
 * Hoja 1: Tarifas (igual que E1)
 * Hoja 2: Puertos válidos
 * (Los gastos FOB se cargan aparte en el formulario de Condiciones Operativas)
 */
export function descargarPlantillaR2(paisActual) {
  const wb = XLSX.utils.book_new()

  // --- Hoja 1: Tarifas ---
  const headers = [
    'Origen', 'Región', 'Destino',
    'Días Libres en Origen', 'Días Libres en Destino',
    'Naviera(s)', 'Tiempo de tránsito', 'Puerto de Arribo (ver hoja Puertos)',
    'Tarifa 20" STD (USD)', 'Tarifa 40" STD (USD)', 'Tarifa 40" HC (USD)'
  ]

  const data = [headers]
  for (const [origen, region] of ORIGENES) {
    data.push([origen, region, paisActual.nombre, '', '', '', '', '', '', '', ''])
  }

  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [
    { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
    { wch: 22 }, { wch: 18 }, { wch: 34 }, { wch: 16 }, { wch: 16 }, { wch: 16 }
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'Tarifas')

  // --- Hoja 2: Puertos ---
  const puertosData = [['Puertos de Arribo válidos'], ...PUERTOS.map((p) => [p])]
  const wsPuertos = XLSX.utils.aoa_to_sheet(puertosData)
  wsPuertos['!cols'] = [{ wch: 36 }]
  XLSX.utils.book_append_sheet(wb, wsPuertos, 'Puertos')

  XLSX.writeFile(wb, `Plantilla_Tarifas_R2_${paisActual.code}.xlsx`)
}

/**
 * Descarga plantilla Excel de Gastos FOB (para el formulario de Condiciones Operativas)
 */
export function descargarPlantillaFobR2() {
  const wb = XLSX.utils.book_new()

  const fobHeaders = ['Puerto', 'Cargo', '20GP (CNY)', '40GP (CNY)', '40HQ (CNY)', 'Unidad', 'Observación']
  const fobData = [fobHeaders]
  for (const puerto of PUERTOS_BASE_CHINA) {
    for (const cargo of CARGOS_FOB) {
      fobData.push([`${puerto}, China`, cargo.label, '', '', '', '', ''])
    }
  }
  const wsFob = XLSX.utils.aoa_to_sheet(fobData)
  wsFob['!cols'] = [{ wch: 22 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 24 }]
  XLSX.utils.book_append_sheet(wb, wsFob, 'Gastos FOB')

  XLSX.writeFile(wb, 'Plantilla_Gastos_FOB_R2.xlsx')
}

/**
 * Lee plantilla de tarifas (Hoja 1) — misma lógica que E1
 */
export function leerPlantillaR2(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

        if (rows.length < 2) { reject(new Error('El archivo no contiene datos.')); return }

        const hdr = rows[0].map((h) => String(h).toLowerCase().trim())
        const colMap = {
          origen: hdr.findIndex((h) => h.includes('origen')),
          dias_libres_origen: hdr.findIndex((h) => (h.includes('días') || h.includes('dias')) && h.includes('origen')),
          dias_libres_destino: hdr.findIndex((h) => (h.includes('días') || h.includes('dias')) && h.includes('destino')),
          navieras: hdr.findIndex((h) => h.includes('naviera')),
          tiempo_transito: hdr.findIndex((h) => h.includes('tránsito') || h.includes('transito')),
          puerto_arribo: hdr.findIndex((h) => h.includes('puerto')),
          tarifa_20_std: hdr.findIndex((h) => h.includes('20')),
          tarifa_40_std: hdr.findIndex((h) => h.includes('40') && h.includes('std')),
          tarifa_40_hc: hdr.findIndex((h) => h.includes('40') && h.includes('hc'))
        }

        const result = []
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r]
          const origen = String(row[colMap.origen] || '').trim()
          if (!origen) continue
          const val = (col) => col >= 0 ? String(row[col] ?? '').trim() : ''
          result.push({
            origen,
            dias_libres_origen: val(colMap.dias_libres_origen),
            dias_libres_destino: val(colMap.dias_libres_destino),
            navieras: val(colMap.navieras),
            tiempo_transito: val(colMap.tiempo_transito),
            puerto_arribo: val(colMap.puerto_arribo),
            tarifa_20_std: val(colMap.tarifa_20_std),
            tarifa_40_std: val(colMap.tarifa_40_std),
            tarifa_40_hc: val(colMap.tarifa_40_hc)
          })
        }
        resolve(result)
      } catch (err) {
        reject(err)
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Lee la hoja de Gastos FOB de la plantilla (Hoja 3)
 * Retorna un objeto { [puerto]: { [cargo_key]: { '20GP': n, '40GP': n, '40HQ': n } } }
 */
export function leerGastosFobR2(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })

        // Buscar hoja de FOB
        const fobSheetName = wb.SheetNames.find((n) => n.toLowerCase().includes('fob'))
        if (!fobSheetName) { resolve(null); return }

        const ws = wb.Sheets[fobSheetName]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

        if (rows.length < 2) { resolve(null); return }

        const result = {}

        for (let r = 1; r < rows.length; r++) {
          const row = rows[r]
          const puertoRaw = String(row[0] || '').trim()
          const cargoLabel = String(row[1] || '').trim()
          const v20 = String(row[2] || '').trim()
          const v40 = String(row[3] || '').trim()
          const v40hq = String(row[4] || '').trim()
          const unidad = String(row[5] || '').trim()
          const observacion = String(row[6] || '').trim()

          if (!puertoRaw || !cargoLabel) continue

          // Extraer nombre del puerto (antes de la coma)
          const puertoNombre = puertoRaw.split(',')[0].trim()
          const puertoMatch = PUERTOS_BASE_CHINA.find((p) =>
            puertoNombre.toLowerCase() === p.toLowerCase()
          )
          if (!puertoMatch) continue

          // Encontrar key del cargo
          const cargoMatch = CARGOS_FOB.find((c) =>
            cargoLabel.toLowerCase().includes(c.label.toLowerCase().slice(0, 10))
          )
          if (!cargoMatch) continue

          if (!result[puertoMatch]) result[puertoMatch] = {}
          result[puertoMatch][cargoMatch.key] = {
            '20GP': v20,
            '40GP': v40,
            '40HQ': v40hq,
            unidad,
            observacion
          }
        }

        resolve(Object.keys(result).length > 0 ? result : null)
      } catch (err) {
        reject(err)
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Carga combinada: lee tarifas + gastos FOB de un mismo archivo
 */
export function leerPlantillaCompletaR2(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })

        // Hoja 1: Tarifas
        const wsTarifas = wb.Sheets[wb.SheetNames[0]]
        const rowsTarifas = XLSX.utils.sheet_to_json(wsTarifas, { header: 1, defval: '' })
        const tarifas = []

        if (rowsTarifas.length >= 2) {
          const hdr = rowsTarifas[0].map((h) => String(h).toLowerCase().trim())
          const colMap = {
            origen: hdr.findIndex((h) => h.includes('origen')),
            dias_libres_origen: hdr.findIndex((h) => (h.includes('días') || h.includes('dias')) && h.includes('origen')),
            dias_libres_destino: hdr.findIndex((h) => (h.includes('días') || h.includes('dias')) && h.includes('destino')),
            navieras: hdr.findIndex((h) => h.includes('naviera')),
            tiempo_transito: hdr.findIndex((h) => h.includes('tránsito') || h.includes('transito')),
            puerto_arribo: hdr.findIndex((h) => h.includes('puerto')),
            tarifa_20_std: hdr.findIndex((h) => h.includes('20')),
            tarifa_40_std: hdr.findIndex((h) => h.includes('40') && h.includes('std')),
            tarifa_40_hc: hdr.findIndex((h) => h.includes('40') && h.includes('hc'))
          }

          for (let r = 1; r < rowsTarifas.length; r++) {
            const row = rowsTarifas[r]
            const origen = String(row[colMap.origen] || '').trim()
            if (!origen) continue
            const val = (col) => col >= 0 ? String(row[col] ?? '').trim() : ''
            tarifas.push({
              origen,
              dias_libres_origen: val(colMap.dias_libres_origen),
              dias_libres_destino: val(colMap.dias_libres_destino),
              navieras: val(colMap.navieras),
              tiempo_transito: val(colMap.tiempo_transito),
              puerto_arribo: val(colMap.puerto_arribo),
              tarifa_20_std: val(colMap.tarifa_20_std),
              tarifa_40_std: val(colMap.tarifa_40_std),
              tarifa_40_hc: val(colMap.tarifa_40_hc)
            })
          }
        }

        // Hoja FOB (si existe)
        let gastosFob = null
        const fobSheetName = wb.SheetNames.find((n) => n.toLowerCase().includes('fob'))
        if (fobSheetName) {
          const wsFob = wb.Sheets[fobSheetName]
          const rowsFob = XLSX.utils.sheet_to_json(wsFob, { header: 1, defval: '' })
          gastosFob = {}

          for (let r = 1; r < rowsFob.length; r++) {
            const row = rowsFob[r]
            const puertoRaw = String(row[0] || '').trim()
            const cargoLabel = String(row[1] || '').trim()
            const v20 = String(row[2] || '').trim()
            const v40 = String(row[3] || '').trim()
            const v40hq = String(row[4] || '').trim()

            if (!puertoRaw || !cargoLabel) continue

            const puertoNombre = puertoRaw.split(',')[0].trim()
            const puertoMatch = PUERTOS_BASE_CHINA.find((p) =>
              puertoNombre.toLowerCase() === p.toLowerCase()
            )
            if (!puertoMatch) continue

            const cargoMatch = CARGOS_FOB.find((c) =>
              cargoLabel.toLowerCase().includes(c.label.toLowerCase().slice(0, 10))
            )
            if (!cargoMatch) continue

            if (!gastosFob[puertoMatch]) gastosFob[puertoMatch] = {}
            gastosFob[puertoMatch][cargoMatch.key] = {
              '20GP': v20,
              '40GP': v40,
              '40HQ': v40hq
            }
          }

          if (!Object.keys(gastosFob).length) gastosFob = null
        }

        resolve({ tarifas, gastosFob })
      } catch (err) {
        reject(err)
      }
    }
    reader.readAsArrayBuffer(file)
  })
}
