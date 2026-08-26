import { useState, useContext } from 'react'
import { AdminContext } from '../../pages/AdminPage'
import { calcularRanking } from '../../utils/ranking'
import { calcularRankingR2 } from '../../utils/rankingR2'
import { PAISES_MAP } from '../../constantsR2'

/**
 * Vista comparativa: muestra rankings de Etapa 1 y Etapa 2 lado a lado
 * para el mismo oferente, permitiendo ver cómo cambia su posición.
 */
export default function AdminComparativa() {
  const { respuestas, tarifas, respuestasR2, tarifasR2, condOpR2 } = useContext(AdminContext)
  const [pais, setPais] = useState('')
  const [campo, setCampo] = useState('tarifa_40_std')
  const [formRegion, setFormRegion] = useState('')
  const [vistaMode, setVistaMode] = useState('global') // global | detalle

  const r1Resp = respuestas || []
  const r1Tarif = tarifas || []
  // Enriquecer respuestas R2 con condiciones operativas
  const r2Resp = (respuestasR2 || []).map((r) => {
    const condOp = (condOpR2 || []).find((c) =>
      c.oferente.trim().toLowerCase() === r.oferente.trim().toLowerCase()
    )
    if (!condOp) return r
    return {
      ...r,
      credito_dias: r.credito_dias ?? condOp.credito_dias,
      facturacion_aplica: r.facturacion_aplica ?? condOp.facturacion_aplica,
      gastos_fob: r.gastos_fob ?? condOp.gastos_fob,
      representacion: r.representacion ?? condOp.representacion
    }
  })
  const r2Tarif = tarifasR2 || []

  // Calcular rankings de ambas etapas
  const { global: globalE1 } = calcularRanking(r1Tarif, r1Resp, { pais, campo, regionFiltro: '', formRegion })
  const { global: globalE2 } = calcularRankingR2(r2Tarif, r2Resp, { pais, campo, regionFiltro: '', formRegion })

  // Construir mapa comparativo por oferente
  const oferentes = new Set()
  for (const o of globalE1) oferentes.add(o.oferente.trim().toLowerCase())
  for (const o of globalE2) oferentes.add(o.oferente.trim().toLowerCase())

  const comparativa = [...oferentes].map((oferKey) => {
    const e1 = globalE1.find((o) => o.oferente.trim().toLowerCase() === oferKey)
    const e2 = globalE2.find((o) => o.oferente.trim().toLowerCase() === oferKey)
    const posE1 = e1 ? globalE1.indexOf(e1) + 1 : null
    const posE2 = e2 ? globalE2.indexOf(e2) + 1 : null

    return {
      oferente: e1?.oferente || e2?.oferente || oferKey,
      pais_nombre: e1?.pais_nombre || e2?.pais_nombre || '',
      pais: e1?.pais || e2?.pais || '',
      // Etapa 1
      e1_pos: posE1,
      e1_total: e1?.avg_total || null,
      e1_rutas: e1?.rutas || 0,
      e1_tarifa: e1?.avg_tarifa || null,
      e1_dias: e1?.avg_dias || null,
      e1_credito: e1?.avg_credito || null,
      e1_gastos: e1?.avg_gastos || null,
      e1_herramienta: e1?.avg_herramienta || null,
      // Etapa 2
      e2_pos: posE2,
      e2_total: e2?.avg_total || null,
      e2_rutas: e2?.rutas || 0,
      e2_tarifa: e2?.avg_tarifa || null,
      e2_dias: e2?.avg_dias || null,
      e2_credito: e2?.avg_credito || null,
      e2_gastos: e2?.avg_gastos || null,
      e2_allocation: e2?.avg_allocation || null,
      e2_fob: e2?.avg_fob || null,
      e2_repre: e2?.avg_repre || null,
      // Delta
      delta_pos: (posE1 !== null && posE2 !== null) ? posE1 - posE2 : null,
      delta_total: (e1?.avg_total != null && e2?.avg_total != null) ? e2.avg_total - e1.avg_total : null
    }
  }).sort((a, b) => {
    // Ordenar por nota E2 desc, luego E1 desc
    if (a.e2_total !== null && b.e2_total !== null) return b.e2_total - a.e2_total
    if (a.e2_total !== null) return -1
    if (b.e2_total !== null) return 1
    return (b.e1_total || 0) - (a.e1_total || 0)
  })

  function deltaIcon(delta) {
    if (delta === null) return '—'
    if (delta > 0) return <span style={{ color: '#007A63', fontWeight: 700 }}>▲ {delta}</span>
    if (delta < 0) return <span style={{ color: '#B3402E', fontWeight: 700 }}>▼ {Math.abs(delta)}</span>
    return <span style={{ color: 'var(--muted)' }}>= 0</span>
  }

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
        <div className="f"><label>Vista</label>
          <select value={vistaMode} onChange={(e) => setVistaMode(e.target.value)}>
            <option value="global">Resumen</option>
            <option value="detalle">Detalle completo</option>
          </select>
        </div>
        <span className="spacer" />
        <span className="count-note">
          E1: {globalE1.length} oferentes · E2: {globalE2.length} oferentes
        </span>
      </div>

      {/* KPIs resumen */}
      <div className="kpis">
        <div className="kpi">
          <div className="k-label">Oferentes Etapa 1</div>
          <div className="k-value">{globalE1.length}</div>
        </div>
        <div className="kpi" style={{ borderLeftColor: '#F2B33D' }}>
          <div className="k-label">Oferentes Etapa 2</div>
          <div className="k-value">{globalE2.length}</div>
        </div>
        <div className="kpi">
          <div className="k-label">En ambas etapas</div>
          <div className="k-value">{comparativa.filter((c) => c.e1_pos && c.e2_pos).length}</div>
        </div>
        <div className="kpi" style={{ borderLeftColor: '#8A5A00' }}>
          <div className="k-label">Solo en E2 (nuevos)</div>
          <div className="k-value">{comparativa.filter((c) => !c.e1_pos && c.e2_pos).length}</div>
        </div>
      </div>

      <div className="section-title">Comparativa de Rankings: Etapa 1 vs Etapa 2</div>

      {vistaMode === 'global' && (
        <div className="card" style={{ marginBottom: 22 }}>
          <div className="table-scroll" style={{ maxHeight: 500 }}>
            <table className="grid">
              <thead><tr>
                <th>Oferente</th><th>País</th>
                <th className="th-num" style={{ background: '#055D4D' }}>Pos E1</th>
                <th className="th-num" style={{ background: '#055D4D' }}>Nota E1</th>
                <th className="th-num" style={{ background: '#8A5A00' }}>Pos E2</th>
                <th className="th-num" style={{ background: '#8A5A00' }}>Nota E2</th>
                <th className="th-num">Δ Posición</th>
                <th className="th-num">Δ Nota</th>
              </tr></thead>
              <tbody>
                {comparativa.map((c, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{c.oferente}</td>
                    <td><span className="badge">{c.pais_nombre}</span></td>
                    <td className="td-num num">{c.e1_pos || '—'}</td>
                    <td className="td-num num">{c.e1_total?.toFixed(2) || '—'}</td>
                    <td className="td-num num" style={{ fontWeight: 700 }}>{c.e2_pos || '—'}</td>
                    <td className="td-num num" style={{ fontWeight: 700 }}>{c.e2_total?.toFixed(2) || '—'}</td>
                    <td className="td-num">{deltaIcon(c.delta_pos)}</td>
                    <td className="td-num">
                      {c.delta_total !== null
                        ? <span style={{ color: c.delta_total >= 0 ? '#007A63' : '#B3402E', fontWeight: 600 }}>
                            {c.delta_total >= 0 ? '+' : ''}{c.delta_total.toFixed(2)}
                          </span>
                        : '—'
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!comparativa.length && <div className="empty">No hay datos para comparar.</div>}
        </div>
      )}

      {vistaMode === 'detalle' && (
        <div className="card" style={{ marginBottom: 22 }}>
          <div className="table-scroll" style={{ maxHeight: 500 }}>
            <table className="grid">
              <thead><tr>
                <th>Oferente</th><th>País</th>
                <th className="th-num" style={{ background: '#055D4D', fontSize: 11 }}>E1 Tarifa{'\n'}(80%)</th>
                <th className="th-num" style={{ background: '#055D4D', fontSize: 11 }}>E1 Días{'\n'}(5%)</th>
                <th className="th-num" style={{ background: '#055D4D', fontSize: 11 }}>E1 Créd.{'\n'}(5%)</th>
                <th className="th-num" style={{ background: '#055D4D', fontSize: 11 }}>E1 Gast.{'\n'}(5%)</th>
                <th className="th-num" style={{ background: '#055D4D', fontSize: 11 }}>E1 Herr.{'\n'}(5%)</th>
                <th className="th-num" style={{ background: '#055D4D', fontWeight: 800 }}>E1 Total</th>
                <th className="th-num" style={{ background: '#8A5A00', fontSize: 11 }}>E2 Tarifa{'\n'}(60%)</th>
                <th className="th-num" style={{ background: '#8A5A00', fontSize: 11 }}>E2 Días{'\n'}(5%)</th>
                <th className="th-num" style={{ background: '#8A5A00', fontSize: 11 }}>E2 Créd.{'\n'}(5%)</th>
                <th className="th-num" style={{ background: '#8A5A00', fontSize: 11 }}>E2 Gast.{'\n'}(5%)</th>
                <th className="th-num" style={{ background: '#8A5A00', fontSize: 11 }}>E2 Alloc.{'\n'}(15%)</th>
                <th className="th-num" style={{ background: '#8A5A00', fontSize: 11 }}>E2 FOB{'\n'}(5%)</th>
                <th className="th-num" style={{ background: '#8A5A00', fontSize: 11 }}>E2 Repr.{'\n'}(5%)</th>
                <th className="th-num" style={{ background: '#8A5A00', fontWeight: 800 }}>E2 Total</th>
              </tr></thead>
              <tbody>
                {comparativa.map((c, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{c.oferente}</td>
                    <td><span className="badge">{c.pais_nombre}</span></td>
                    <td className="td-num num">{c.e1_tarifa?.toFixed(2) || '—'}</td>
                    <td className="td-num num">{c.e1_dias?.toFixed(2) || '—'}</td>
                    <td className="td-num num">{c.e1_credito?.toFixed(2) || '—'}</td>
                    <td className="td-num num">{c.e1_gastos?.toFixed(2) || '—'}</td>
                    <td className="td-num num">{c.e1_herramienta?.toFixed(2) || '—'}</td>
                    <td className="td-num num" style={{ fontWeight: 800, color: 'var(--teal-deep)' }}>{c.e1_total?.toFixed(2) || '—'}</td>
                    <td className="td-num num">{c.e2_tarifa?.toFixed(2) || '—'}</td>
                    <td className="td-num num">{c.e2_dias?.toFixed(2) || '—'}</td>
                    <td className="td-num num">{c.e2_credito?.toFixed(2) || '—'}</td>
                    <td className="td-num num">{c.e2_gastos?.toFixed(2) || '—'}</td>
                    <td className="td-num num">{c.e2_allocation?.toFixed(2) || '—'}</td>
                    <td className="td-num num">{c.e2_fob?.toFixed(2) || '—'}</td>
                    <td className="td-num num">{c.e2_repre?.toFixed(2) || '—'}</td>
                    <td className="td-num num" style={{ fontWeight: 800, color: '#8A5A00' }}>{c.e2_total?.toFixed(2) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!comparativa.length && <div className="empty">No hay datos para comparar.</div>}
        </div>
      )}

      {/* Leyenda */}
      <div style={{ padding: '12px 0', fontSize: 12.5, color: 'var(--muted)' }}>
        <strong>Δ Posición:</strong> Positivo (▲) = subió de posición en E2 respecto a E1. Negativo (▼) = bajó.
        <br /><strong>Δ Nota:</strong> Diferencia en puntaje total (E2 − E1). No son directamente comparables por los diferentes pesos.
      </div>
    </section>
  )
}
