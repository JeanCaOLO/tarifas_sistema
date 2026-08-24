import * as XLSX from 'xlsx'
import { ORIGENES, PUERTOS, RATE_FIELDS } from '../constants'
import { numOrNull } from './format'

export function descargarPlantilla(paisActual) {
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

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [
    { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
    { wch: 22 }, { wch: 18 }, { wch: 34 }, { wch: 16 }, { wch: 16 }, { wch: 16 }
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'Tarifas')

  const puertosData = [['Puertos de Arribo válidos'], ...PUERTOS.map((p) => [p])]
  const wsPuertos = XLSX.utils.aoa_to_sheet(puertosData)
  wsPuertos['!cols'] = [{ wch: 36 }]
  XLSX.utils.book_append_sheet(wb, wsPuertos, 'Puertos')

  XLSX.writeFile(wb, `Plantilla_Tarifas_${paisActual.code}.xlsx`)
}

export function leerPlantilla(file) {
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
