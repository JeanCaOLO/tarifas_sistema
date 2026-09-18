import { useState, useContext } from 'react'
import { AdminContext } from '../../pages/AdminPage'
import { calcularRanking } from '../../utils/ranking'
import { fmtMoney } from '../../utils/format'
import { PAISES_MAP, REGION_POR_ORIGEN } from '../../constants'
import { getPesosE1, getReglasE1 } from '../../utils/rankingConfig'
import { exportarReporteOferente } from '../../utils/reporteOferente'
import { exportarRankingPDF } from '../../utils/reporteRankingPDF'
import FiltroRegiones, { REGIONES_ORIGEN, REG_LABELS } from './FiltroRegiones'
import ExcluirOferentes, { aplicarExclusion } from './ExcluirOferentes'

export default function AdminRanking() {
  const { respuestas, tarifas, oferentesExcluidos, volumenes } = useContext(AdminContext)
  const pesos = getPesosE1()
  const [pais, setPais] = useState('')
  const [campo, setCampo] = useState('tarifa_40_std')
  const [regiones, setRegiones] = useState(() => new Set(REGIONES_ORIGEN))
  const [formRegion, setFormRegion] = useState('')

  function toggleRegion(reg) {
    setRegiones((prev) => {
      const next = new Set(prev)
      if (next.has(reg)) next.delete(reg); else next.add(reg)
      return next
    })
  }

  // Filtrar tarifas por las regiones de origen seleccionadas (checkboxes)
  const tarifasRegion = (regiones.size === REGIONES_ORIGEN.length)
    ? tarifas
    : tarifas.filter((t) => regiones.has(REGION_POR_ORIGEN.get(t.origen) || t.region))

  const { respuestas: respFilt, tarifas: tarFilt } = aplicarExclusion(respuestas, tarifasRegion, oferentesExcluidos)
  const { porRuta, global } = calcularRanking(tarFilt, respFilt, { pais, campo, regionFiltro: '', formRegion, volumenes })

  // Group porRuta by route
  const rutasMap = new Map()
  for (const r of porRuta) {
    const clave = r.pais + '|' + r.origen
    if (!rutasMap.has(clave)) rutasMap.set(clave, [])
    rutasMap.get(clave).push(r)
  }
  for (const arr of rutasMap.values()) arr.sort((a, b) => b.puntaje - a.puntaje)

  return (
    <section>
      <div className="filters">
        <div className="f"><label>País</label>
          <select value={pais} onChange={(e) => setPais(e.target.value)}>
            <option value="">Todos</option>
            <option value="CR">Costa Rica</option><option value="SV">El Salvador</option>
            <option value="GT">Guatemala</option><option value="VNZ">Venezuela</option>
          </select>
        </div>
        <div className="f"><label>Tarifa base</label>
          <select value={campo} onChange={(e) => setCampo(e.target.value)}>
            <option value="tarifa_20_std">20" STD</option>
            <option value="tarifa_40_std">40" STD</option>
            <option value="tarifa_40_hc">40" HC</option>
          </select>
        </div>
        <div className="f"><label>Región (CA/VE)</label>
          <select value={formRegion} onChange={(e) => setFormRegion(e.target.value)}>
            <option value="">Todas</option><option value="CA">CA</option><option value="VE">VE</option>
          </select>
        </div>
        <span className="spacer" />
        <span className="count-note">{porRuta.length} evaluaciones · {global.length} oferentes</span>
        <button className="btn btn-sm" disabled={!global.length}
          onClick={() => exportarRankingPDF({ porRuta, global }, {
            etapa: '1', campo, pesos,
            regionesTxt: regiones.size === REGIONES_ORIGEN.length ? 'Todas' : [...regiones].map((r) => REG_LABELS[r] || r).join(', ')
          })}>
          📄 PDF resumen
        </button>
      </div>

      <FiltroRegiones
        seleccionadas={regiones}
        onToggle={toggleRegion}
        onTodas={() => setRegiones(new Set(REGIONES_ORIGEN))}
        onSoloPB={() => setRegiones(new Set(['Asia Puertos Base']))}
      />

      <ExcluirOferentes respuestas={respuestas} />

      <div className="section-title">Ranking Global por Oferente</div>
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="table-scroll" style={{ maxHeight: 400 }}>
          <table className="grid">
            <thead><tr>
              <th>#</th><th>Oferente</th><th>País</th><th className="th-num">Rutas</th>
              <th className="th-num">Tarifa ({pesos.tarifas}%)</th><th className="th-num">Días ({pesos.dias_libres}%)</th>
              <th className="th-num">Crédito ({pesos.credito}%)</th>
              <th className="th-num">Herram. ({pesos.herramienta}%)</th><th className="th-num">Total</th>
              <th>Reporte</th>
            </tr></thead>
            <tbody>
              {global.map((o, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 800, color: i < 3 ? 'var(--teal-deep)' : 'var(--muted)' }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{o.oferente}</td>
                  <td><span className="badge">{o.pais_nombre}</span></td>
                  <td className="td-num num" title={`Número de rutas evaluadas para este oferente: ${o.rutas}`}>{o.rutas}</td>
                  <td className="td-num num" title={`TARIFA (${pesos.tarifas}%) ponderada por VOLUMEN (costo total)\nPuntaje = (mejor costo total ÷ costo total del oferente) × ${pesos.tarifas}%\n= ($${fmtMoney(o.mejorCostoTotal || 0)} ÷ $${fmtMoney(o.costoTotal || 0)}) × ${pesos.tarifas}%\n= ${o.avg_tarifa.toFixed(2)} puntos\nCosto total = suma de (tarifa + impresión BL) × volumen ÷ divisor en sus ${o.rutas} ruta(s).\nMejor costo total = suma del menor costo de cada una de sus rutas.\nTarifa cotizada del oferente: ${rangoTxt(o.val_tarifa, '$')}`}>{o.avg_tarifa.toFixed(2)}</td>
                  <td className="td-num num" title={`Promedio de la contribución de Días libres (${pesos.dias_libres}%) sobre ${o.rutas} ruta(s).\nValor del oferente: ${rangoTxt(o.val_dias, '', ' días')}`}>{o.avg_dias.toFixed(2)}</td>
                  <td className="td-num num" title={`Promedio de la contribución de Crédito (${pesos.credito}%) sobre ${o.rutas} ruta(s).\nValor del oferente: ${o.val_credito ?? 0} días de crédito`}>{o.avg_credito.toFixed(2)}</td>
                  <td className="td-num num" title={`Promedio de la contribución de Herramienta de seguimiento (${pesos.herramienta}%) sobre ${o.rutas} ruta(s).\nHerramienta declarada: ${o.val_herramienta && o.val_herramienta.trim() ? o.val_herramienta : '(ninguna)'}`}>{o.avg_herramienta.toFixed(2)}</td>
                  <td className="td-num num" style={{ fontWeight: 800, color: 'var(--teal-deep)' }} title={`Promedio del puntaje total sobre ${o.rutas} ruta(s).\n= Tarifa ${o.avg_tarifa.toFixed(2)} + Días ${o.avg_dias.toFixed(2)} + Crédito ${o.avg_credito.toFixed(2)} + Herram. ${o.avg_herramienta.toFixed(2)}`}>{o.avg_total.toFixed(2)}</td>
                  <td><button className="btn btn-ghost btn-sm" title="Descargar reporte de este oferente con sus rubros más bajos" onClick={() => exportarReporteOferente(o, '1')}>📄 Descargar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!global.length && <div className="empty">No hay datos para el ranking.</div>}
      </div>

      <div className="section-title">Ranking por Ruta</div>
      {[...rutasMap.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([clave, items]) => (
        <div key={clave} className="card" style={{ marginBottom: 14 }}>
          <div style={{ padding: '10px 14px', background: 'var(--teal-dark)', color: '#fff', fontWeight: 700, fontSize: 13 }}>
            🚢 {items[0].origen} → {items[0].pais_nombre}
            <span style={{ opacity: 0.75, marginLeft: 8, background: 'rgba(255,255,255,.15)', padding: '2px 8px', borderRadius: 4, fontSize: 11.5 }}>{items[0].region}</span>
            <span style={{ opacity: 0.7, marginLeft: 10 }}>{items.length} oferente{items.length > 1 ? 's' : ''}</span>
          </div>
          <div className="table-scroll">
            <table className="grid">
              <thead><tr>
                <th>#</th><th>Oferente</th><th className="th-num">Tarifa</th>
                <th className="th-num">Punt. Tarifa</th><th className="th-num">Días</th>
                <th className="th-num">Crédito</th>
                <th className="th-num">Herram.</th><th className="th-num">Total</th>
              </tr></thead>
              <tbody>
                {items.map((r, i) => (
                  <tr key={i} style={i === 0 ? { background: 'var(--mint)' } : {}}>
                    <td style={{ fontWeight: 800, color: i < 3 ? 'var(--teal-deep)' : 'var(--muted)' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''} {i + 1}
                    </td>
                    <td style={{ fontWeight: 600 }}>{r.oferente} <span className="badge" style={{ fontSize: 10.5, padding: '2px 6px' }}>{r.pais}</span></td>
                    <td className="td-num num" title={`Tarifa cotizada: $${fmtMoney(r.tarifa)}\nMejor tarifa de la ruta: $${fmtMoney(r.mejorTarifa)}`}>${fmtMoney(r.tarifa)}</td>
                    <td className="td-num num" title={tipTarifa(r)}>{r.contrib_tarifa.toFixed(2)}</td>
                    <td className="td-num num" title={tipDias(r)}>{r.contrib_dias.toFixed(2)}</td>
                    <td className="td-num num" title={tipCredito(r)}>{r.contrib_credito.toFixed(2)}</td>
                    <td className="td-num num" title={tipHerramienta(r)}>{r.contrib_herramienta.toFixed(2)}</td>
                    <td className="td-num num" style={{ fontWeight: 800, color: 'var(--teal-deep)' }} title={tipTotal(r)}>{r.puntaje.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {!porRuta.length && <div className="empty">No hay datos para calcular ranking por ruta.</div>}
    </section>
  )
}

// Formatea un rango {min,max} para tooltips (ej. "$1200" o "$1200 – $1500")
function rangoTxt(rango, prefijo = '', sufijo = '') {
  if (!rango) return '(sin dato)'
  const f = (v) => prefijo + fmtMoney(v) + sufijo
  return rango.min === rango.max ? f(rango.min) : `${f(rango.min)} – ${f(rango.max)}`
}

// ---- Tooltips: explican qué regla se aplicó para obtener cada valor ----
// (leen los pesos y reglas vigentes desde la configuración)
function tipTarifa(r) {
  const p = getPesosE1().tarifas
  if (r.volumenRuta > 0) {
    return `TARIFA ponderada por VOLUMEN (${p}% del puntaje)\n` +
      `Costo = (tarifa + impresión BL) × volumen ÷ divisor\n` +
      `= ($${fmtMoney(r.tarifa)} + $${fmtMoney(r.gastoSum)}) × ${r.volumenRuta.toLocaleString('en-US')} TEUs ÷ divisor\n` +
      `= $${fmtMoney(r.costoOferente)}\n` +
      `Mejor (menor) costo de la ruta: $${fmtMoney(r.mejorCosto)}\n` +
      `Puntaje = (mejor costo ÷ costo del oferente) × 100 × ${p}%\n` +
      `= ($${fmtMoney(r.mejorCosto)} ÷ $${fmtMoney(r.costoOferente)}) × 100 × ${p}%\n` +
      `= ${r.contrib_tarifa.toFixed(2)} puntos\n` +
      `El menor costo de la ruta obtiene el máximo (${p}).`
  }
  return `TARIFA (${p}% del puntaje)\n` +
    `Este puerto no tiene volumen cargado → puntaje de tarifa = 0.\n` +
    `(Con volumen: costo = (tarifa + impresión BL) × volumen ÷ divisor; puntaje = mejor costo ÷ costo × 100 × ${p}%)`
}
function tipDias(r) {
  const p = getPesosE1().dias_libres
  const g = getReglasE1().dias
  const regla = r.diasLibres >= g.alto.min ? `≥${g.alto.min} días → ${g.alto.pts} pts`
    : r.diasLibres >= g.medio.min ? `≥${g.medio.min} días → ${g.medio.pts} pts`
    : `<${g.medio.min} días → ${g.bajo ?? 0} pts`
  return `DÍAS LIBRES EN DESTINO (${p}% del puntaje)\n` +
    `Días libres ofrecidos: ${r.diasLibres}\n` +
    `Regla: ≥${g.alto.min} = ${g.alto.pts} · ≥${g.medio.min} = ${g.medio.pts} · resto = ${g.bajo ?? 0}\n` +
    `Aplicó: ${regla} = ${r.contrib_dias.toFixed(2)} puntos`
}
function tipCredito(r) {
  const p = getPesosE1().credito
  const g = getReglasE1().credito
  const regla = r.credito >= g.alto.min ? `≥${g.alto.min} días → ${g.alto.pts} pts`
    : r.credito >= g.medio.min ? `≥${g.medio.min} días → ${g.medio.pts} pts`
    : `<${g.medio.min} días → ${g.bajo ?? 0} pts`
  return `CRÉDITO (${p}% del puntaje)\n` +
    `Días de crédito ofrecidos: ${r.credito}\n` +
    `Regla: ≥${g.alto.min} = ${g.alto.pts} · ≥${g.medio.min} = ${g.medio.pts} · resto = ${g.bajo ?? 0}\n` +
    `Aplicó: ${regla} = ${r.contrib_credito.toFixed(2)} puntos`
}
function tipGastos(r) {
  const p = getPesosE1().gastos_destino
  const g = getReglasE1().gastos
  let regla
  if (!r.gastoSum) regla = 'Sin gastos declarados → 0 pts'
  else if (r.gastoSum <= r.menorGasto) regla = `Es el menor gasto de la ruta → ${g.mejorPts} pts`
  else if (r.gastoSum >= r.mayorGasto && r.mayorGasto > r.menorGasto) regla = `Es el mayor gasto de la ruta → ${g.peorPts} pts`
  else regla = `Gasto intermedio → interpolado entre ${g.mejorPts} y ${g.peorPts}`
  return `GASTOS - Impresión de BL (${p}% del puntaje)\n` +
    `Costo de impresión de BL del oferente: $${fmtMoney(r.gastoSum)}\n` +
    `Menor gasto de la ruta: $${fmtMoney(r.menorGasto)} (obtiene ${g.mejorPts})\n` +
    `Mayor gasto de la ruta: $${fmtMoney(r.mayorGasto)} (obtiene ${g.peorPts})\n` +
    `Aplicó: ${regla} = ${r.contrib_gastos.toFixed(2)} puntos`
}
function tipHerramienta(r) {
  const p = getPesosE1().herramienta
  const g = getReglasE1().herramienta
  const tiene = r.herramienta && r.herramienta.trim().length > 0
  return `HERRAMIENTA DE SEGUIMIENTO (${p}% del puntaje)\n` +
    `Herramienta declarada: ${tiene ? r.herramienta : '(ninguna)'}\n` +
    `Regla: tiene herramienta = ${g.si} · no tiene = ${g.no}\n` +
    `Aplicó: ${tiene ? `Sí ofrece → ${g.si} pts` : `No ofrece → ${g.no} pts`} = ${r.contrib_herramienta.toFixed(2)} puntos`
}
function tipTotal(r) {
  return `PUNTAJE TOTAL DE LA RUTA\n` +
    `= Tarifa ${r.contrib_tarifa.toFixed(2)} + Días ${r.contrib_dias.toFixed(2)} + Crédito ${r.contrib_credito.toFixed(2)} + Gastos ${r.contrib_gastos.toFixed(2)} + Herram. ${r.contrib_herramienta.toFixed(2)}\n` +
    `= ${r.puntaje.toFixed(2)} puntos (máximo 100)`
}
