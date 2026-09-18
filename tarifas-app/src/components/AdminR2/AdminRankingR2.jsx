import { useState, useContext } from 'react'
import { AdminContext } from '../../pages/AdminPage'
import { calcularRankingR2 } from '../../utils/rankingR2'
import { fmtMoney } from '../../utils/format'
import { PAISES_MAP, REGION_POR_ORIGEN } from '../../constantsR2'
import { getPesosE2, getReglasE2 } from '../../utils/rankingConfig'
import { exportarReporteOferente } from '../../utils/reporteOferente'
import { exportarRankingPDF } from '../../utils/reporteRankingPDF'
import ExcluirOferentes, { aplicarExclusion } from '../Admin/ExcluirOferentes'

const REGIONES_ORIGEN = ['America', 'Europa', 'Asia Puertos Base', 'Asia']
const REG_LABELS = { America: 'América', Europa: 'Europa', 'Asia Puertos Base': 'Asia PB', Asia: 'Asia' }

export default function AdminRankingR2() {
  const { respuestasR2, tarifasR2, condOpR2, oferentesExcluidos, volumenes } = useContext(AdminContext)
  const pesos = getPesosE2()
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

  const tarifas = tarifasR2 || []

  // Enriquecer respuestas R2 con datos de condiciones operativas (por oferente)
  const respuestas = (respuestasR2 || []).map((r) => {
    const condOp = (condOpR2 || []).find((c) =>
      c.oferente.trim().toLowerCase() === r.oferente.trim().toLowerCase()
    )
    if (!condOp) return r
    return {
      ...r,
      credito_dias: r.credito_dias ?? condOp.credito_dias,
      facturacion_aplica: r.facturacion_aplica ?? condOp.facturacion_aplica,
      herramienta_seguimiento: r.herramienta_seguimiento ?? condOp.herramienta_seguimiento,
      gastos_fob: r.gastos_fob ?? condOp.gastos_fob
      // representacion viene del formulario de Etapa 2 (por país)
    }
  })

  const tarifasRegion = (regiones.size === REGIONES_ORIGEN.length)
    ? tarifas
    : tarifas.filter((t) => regiones.has(REGION_POR_ORIGEN.get(t.origen) || t.region))

  const { respuestas: respFilt, tarifas: tarFilt } = aplicarExclusion(respuestas, tarifasRegion, oferentesExcluidos)
  const { porRuta, global } = calcularRankingR2(tarFilt, respFilt, { pais, campo, regionFiltro: '', formRegion, volumenes })

  // Agrupar por ruta
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
        <div className="f"><label>Región origen</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', paddingTop: 4 }}>
            {REGIONES_ORIGEN.map((reg) => (
              <label key={reg} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5 }}>
                <input type="checkbox" checked={regiones.has(reg)} onChange={() => toggleRegion(reg)} />
                {REG_LABELS[reg] || reg}
              </label>
            ))}
          </div>
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
            etapa: '2', campo, pesos,
            regionesTxt: regiones.size === REGIONES_ORIGEN.length ? 'Todas' : [...regiones].map((r) => REG_LABELS[r] || r).join(', ')
          })}>
          📄 PDF resumen
        </button>
      </div>

      <ExcluirOferentes respuestas={respuestasR2} />

      <div className="section-title">Ranking Global R2 por Oferente</div>
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="table-scroll" style={{ maxHeight: 400 }}>
          <table className="grid">
            <thead><tr>
              <th>#</th><th>Oferente</th><th>País</th><th className="th-num">Rutas</th>
              <th className="th-num">Tarifa ({pesos.tarifas}%)</th><th className="th-num">Días ({pesos.dias_libres}%)</th>
              <th className="th-num">Crédito ({pesos.credito}%)</th>
              <th className="th-num">Alloc. ({pesos.allocation}%)</th>
              <th className="th-num">Repr. ({pesos.representacion}%)</th><th className="th-num">Total</th>
              <th>Reporte</th>
            </tr></thead>
            <tbody>
              {global.map((o, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 800, color: i < 3 ? 'var(--teal-deep)' : 'var(--muted)' }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''} {i + 1}
                  </td>
                  <td style={{ fontWeight: 600 }}>{o.oferente}</td>
                  <td><span className="badge">{o.pais_nombre}</span></td>
                  <td className="td-num num" title={`Número de rutas evaluadas: ${o.rutas}`}>{o.rutas}</td>
                  <td className="td-num num" title={`TARIFA (${pesos.tarifas}%) ponderada por VOLUMEN (costo total)\nPuntaje = (mejor costo total ÷ costo total del oferente) × ${pesos.tarifas}%\n= ($${fmtMoney(o.mejorCostoTotal || 0)} ÷ $${fmtMoney(o.costoTotal || 0)}) × ${pesos.tarifas}%\n= ${o.avg_tarifa.toFixed(2)} puntos\nCosto total = suma de (tarifa + impresión BL) × volumen ÷ divisor en sus ${o.rutas} ruta(s).\nMejor costo total = suma del menor costo de cada una de sus rutas.\nTarifa cotizada del oferente: ${rangoTxt(o.val_tarifa, '$')}`}>{o.avg_tarifa.toFixed(2)}</td>
                  <td className="td-num num" title={`Promedio de Días libres (${pesos.dias_libres}%) sobre ${o.rutas} ruta(s).\nValor del oferente: ${rangoTxt(o.val_dias, '', ' días')}`}>{o.avg_dias.toFixed(2)}</td>
                  <td className="td-num num" title={`Promedio de Crédito (${pesos.credito}%) sobre ${o.rutas} ruta(s).\nValor del oferente: ${o.val_credito ?? 0} días · facturación: ${o.val_facturacion || '(no indicada)'}`}>{o.avg_credito.toFixed(2)}</td>
                  <td className="td-num num" title={`Promedio de Allocation (${pesos.allocation}%) sobre ${o.rutas} ruta(s).\nAllocation total del oferente: ${o.val_alloc ?? 0}`}>{o.avg_allocation.toFixed(2)}</td>
                  <td className="td-num num" title={`REPRESENTACIÓN / OFICINAS (${pesos.representacion}%)\n# de "Sí" del oferente: ${o.val_repre ?? 0}\nPuntaje = (# "Sí" del oferente ÷ mayor # "Sí" entre oferentes) × ${pesos.representacion}%\nEs proporcional al oferente con más oficinas/representación (ese obtiene ${pesos.representacion}).\nUn valor bajo significa que tiene pocos "Sí" comparado con el líder, aunque sí tenga representación.`}>{o.avg_repre.toFixed(2)}</td>
                  <td className="td-num num" style={{ fontWeight: 800, color: 'var(--teal-deep)' }} title={`Promedio del puntaje total sobre ${o.rutas} ruta(s).\n= Tarifa ${o.avg_tarifa.toFixed(2)} + Días ${o.avg_dias.toFixed(2)} + Crédito ${o.avg_credito.toFixed(2)} + Alloc. ${o.avg_allocation.toFixed(2)} + Repr. ${o.avg_repre.toFixed(2)}`}>{o.avg_total.toFixed(2)}</td>
                  <td><button className="btn btn-ghost btn-sm" title="Descargar reporte de este oferente con sus rubros más bajos" onClick={() => exportarReporteOferente(o, '2')}>📄 Descargar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!global.length && <div className="empty">No hay datos para el ranking R2.</div>}
      </div>

      <div className="section-title">Ranking R2 por Ruta</div>
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
                <th className="th-num">P.Tarifa</th><th className="th-num">Días</th>
                <th className="th-num">Crédito</th>
                <th className="th-num">Alloc.</th>
                <th className="th-num">Repr.</th><th className="th-num">Total</th>
              </tr></thead>
              <tbody>
                {items.map((r, i) => (
                  <tr key={i} style={i === 0 ? { background: 'var(--mint)' } : {}}>
                    <td style={{ fontWeight: 800, color: i < 3 ? 'var(--teal-deep)' : 'var(--muted)' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''} {i + 1}
                    </td>
                    <td style={{ fontWeight: 600 }}>{r.oferente} <span className="badge" style={{ fontSize: 10.5, padding: '2px 6px' }}>{r.pais}</span></td>
                    <td className="td-num num" title={`Tarifa cotizada: $${fmtMoney(r.tarifa)}\nMejor tarifa de la ruta: $${fmtMoney(r.mejorTarifa)}`}>${fmtMoney(r.tarifa)}</td>
                    <td className="td-num num" title={tipTarifaR2(r)}>{r.contrib_tarifa.toFixed(2)}</td>
                    <td className="td-num num" title={tipDiasR2(r)}>{r.contrib_dias.toFixed(2)}</td>
                    <td className="td-num num" title={tipCreditoR2(r)}>{r.contrib_credito.toFixed(2)}</td>
                    <td className="td-num num" title={tipAllocR2(r)}>{r.contrib_allocation.toFixed(2)}</td>
                    <td className="td-num num" title={tipRepreR2(r)}>{r.contrib_repre.toFixed(2)}</td>
                    <td className="td-num num" style={{ fontWeight: 800, color: 'var(--teal-deep)' }} title={tipTotalR2(r)}>{r.puntaje.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {!porRuta.length && <div className="empty">No hay datos para calcular ranking R2 por ruta.</div>}
    </section>
  )
}

// Formatea un rango {min,max} para tooltips (ej. "$1200" o "$1200 – $1500")
function rangoTxt(rango, prefijo = '', sufijo = '') {
  if (!rango) return '(sin dato)'
  const f = (v) => prefijo + fmtMoney(v) + sufijo
  return rango.min === rango.max ? f(rango.min) : `${f(rango.min)} – ${f(rango.max)}`
}

// ---- Tooltips Etapa 2: explican qué regla se aplicó para obtener cada valor ----
// (leen los pesos y reglas vigentes desde la configuración)
function tipTarifaR2(r) {
  const p = getPesosE2().tarifas
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
function tipDiasR2(r) {
  const p = getPesosE2().dias_libres
  const g = getReglasE2().dias
  const regla = r.diasLibres >= g.alto.min ? `≥${g.alto.min} días → ${g.alto.pts} pts`
    : r.diasLibres >= g.medio.min ? `≥${g.medio.min} días → ${g.medio.pts} pts`
    : `<${g.medio.min} días → 0 pts`
  return `DÍAS LIBRES EN DESTINO (${p}% del puntaje)\n` +
    `Días libres ofrecidos: ${r.diasLibres}\n` +
    `Regla: ≥${g.alto.min} = ${g.alto.pts} · ≥${g.medio.min} = ${g.medio.pts} · resto = 0\n` +
    `Aplicó: ${regla} = ${r.contrib_dias.toFixed(2)} puntos`
}
function tipCreditoR2(r) {
  const p = getPesosE2().credito
  const c = getReglasE2().credito
  const max = c.creditoDiasMax ?? 2.5
  let reglaDias
  if (r.credito >= c.dias.alto.min) reglaDias = `≥${c.dias.alto.min} días → ${c.dias.alto.pts} pts`
  else if (r.credito >= c.dias.medio.min) reglaDias = `≥${c.dias.medio.min} días → ${c.dias.medio.pts} pts`
  else if (r.credito > 0) reglaDias = `${r.credito} días → (${r.credito}÷${c.dias.alto.min})×${max} proporcional`
  else reglaDias = 'sin crédito → 0 pts'
  const arribo = r.facturacion === 'arribo'
  return `CRÉDITO (${p}% del puntaje) = días (máx ${max}) + facturación (máx ${c.facturacionArriboPts})\n` +
    `Días de crédito: ${r.credito} → ${reglaDias}\n` +
    `Facturación: ${r.facturacion || '(no indicada)'} → ${arribo ? `al arribo = ${c.facturacionArriboPts} pts` : '0 pts'}\n` +
    `Total crédito = ${r.contrib_credito.toFixed(2)} puntos`
}
function tipGastosR2(r) {
  const p = getPesosE2().gastos_destino
  const g = getReglasE2().gastos
  let regla
  if (!r.gastoSum) regla = 'Sin gastos declarados → 0 pts'
  else if (r.gastoSum <= r.menorGasto) regla = `Es el menor gasto de la ruta → ${g.mejorPts} pts`
  else if (r.gastoSum >= r.mayorGasto && r.mayorGasto > r.menorGasto) regla = `Es el mayor gasto de la ruta → ${g.peorPts} pts`
  else regla = `Gasto intermedio → interpolado entre ${g.mejorPts} y ${g.peorPts}`
  return `GASTOS - Impresión de BL (${p}% del puntaje)\n` +
    `Costo de impresión de BL del oferente: $${fmtMoney(r.gastoSum)}\n` +
    `Menor de la ruta: $${fmtMoney(r.menorGasto)} (${g.mejorPts}) · Mayor: $${fmtMoney(r.mayorGasto)} (${g.peorPts})\n` +
    `Aplicó: ${regla} = ${r.contrib_gastos.toFixed(2)} puntos`
}
function tipAllocR2(r) {
  const p = getPesosE2().allocation
  return `ALLOCATION (${p}% del puntaje)\n` +
    `Fórmula: (allocation total del oferente ÷ mayor allocation) × ${p}\n` +
    `= (${r.allocOferente} ÷ ${r.maxAllocation}) × ${p}\n` +
    `= ${r.contrib_allocation.toFixed(2)} puntos\n` +
    `El oferente con mayor allocation obtiene ${p}.`
}
function tipFobR2(r) {
  const p = getPesosE2().gastos_fob
  return `GASTOS FOB PUERTOS BASE CHINA (${p}% del puntaje)\n` +
    `Fórmula: (menor FOB promedio ÷ FOB promedio del oferente) × ${p}\n` +
    `= ($${fmtMoney(r.minFob)} ÷ $${fmtMoney(r.fobOferente)}) × ${p}\n` +
    `= ${r.contrib_fob.toFixed(2)} puntos\n` +
    `El menor FOB promedio obtiene ${p}.`
}
function tipRepreR2(r) {
  const p = getPesosE2().representacion
  return `REPRESENTACIÓN / OFICINAS (${p}% del puntaje)\n` +
    `Fórmula: (# de "Sí" del oferente ÷ mayor # de "Sí") × ${p}\n` +
    `= (${r.repreOferente} ÷ ${r.maxRepre}) × ${p}\n` +
    `= ${r.contrib_repre.toFixed(2)} puntos\n` +
    `El oferente con más oficinas/representación obtiene ${p}.`
}
function tipTotalR2(r) {
  return `PUNTAJE TOTAL DE LA RUTA\n` +
    `= Tarifa ${r.contrib_tarifa.toFixed(2)} + Días ${r.contrib_dias.toFixed(2)} + Crédito ${r.contrib_credito.toFixed(2)} + Gastos ${r.contrib_gastos.toFixed(2)}\n` +
    `  + Alloc. ${r.contrib_allocation.toFixed(2)} + FOB ${r.contrib_fob.toFixed(2)} + Repr. ${r.contrib_repre.toFixed(2)}\n` +
    `= ${r.puntaje.toFixed(2)} puntos (máximo 100)`
}
