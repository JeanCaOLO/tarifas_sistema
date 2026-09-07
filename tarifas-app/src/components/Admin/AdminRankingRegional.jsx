import { useState, useContext } from 'react'
import { AdminContext } from '../../pages/AdminPage'
import { calcularRankingRegional } from '../../utils/ranking'
import { PAISES_MAP } from '../../constants'

export default function AdminRankingRegional() {
  const { respuestas, tarifas } = useContext(AdminContext)
  const [formRegion, setFormRegion] = useState('CA')
  const [campo, setCampo] = useState('tarifa_40_std')

  const { notaFinal, paisDetalles, paisPesos, regionPesos, paisesDestino } = calcularRankingRegional(tarifas, respuestas, { formRegion, campo })

  const regLabels = { America: 'América', Europa: 'Europa', 'Asia Puertos Base': 'Asia PB', Asia: 'Asia' }

  return (
    <section>
      <div className="filters">
        <div className="f"><label>Región</label>
          <select value={formRegion} onChange={(e) => setFormRegion(e.target.value)}>
            <option value="CA">CA (Centro América)</option>
            <option value="VE">VE (Venezuela)</option>
          </select>
        </div>
        <div className="f"><label>Tarifa base</label>
          <select value={campo} onChange={(e) => setCampo(e.target.value)}>
            <option value="tarifa_20_std">20" STD</option>
            <option value="tarifa_40_std">40" STD</option>
            <option value="tarifa_40_hc">40" HC</option>
          </select>
        </div>
        <span className="spacer" />
        <span className="count-note">{notaFinal.length} oferentes</span>
      </div>

      {regionPesos && (
        <div className="kpis">
          {Object.entries(regionPesos).map(([reg, peso]) => (
            <div key={reg} className="kpi" style={{ borderLeftColor: reg.startsWith('Asia P') ? '#F2B33D' : '#4C6A64' }}>
              <div className="k-label">{regLabels[reg] || reg}</div>
              <div className="k-value" style={{ fontSize: 20 }}>{peso}%</div>
            </div>
          ))}
          <div className="kpi" style={{ borderLeftColor: 'var(--teal)' }}>
            <div className="k-label">Países destino</div>
            <div className="k-value" style={{ fontSize: 14 }}>
              {paisPesos && Object.entries(paisPesos).map(([p, w]) => `${PAISES_MAP[p] || p} ${w}%`).join(' · ')}
            </div>
          </div>
        </div>
      )}

      <ReglasRankingRegional regionPesos={regionPesos} paisPesos={paisPesos} regLabels={regLabels} />

      <div className="section-title">Nota Final por Oferente</div>
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="table-scroll" style={{ maxHeight: 450 }}>
          <table className="grid">
            <thead><tr>
              <th>#</th><th>Oferente</th>
              {paisesDestino?.map((p) => <th key={p} className="th-num">{PAISES_MAP[p] || p} ({paisPesos[p]}%)</th>)}
              <th className="th-num" style={{ fontWeight: 800 }}>Nota Final</th>
            </tr></thead>
            <tbody>
              {notaFinal.map((row, i) => (
                <tr key={i} style={i === 0 ? { background: 'var(--mint)' } : {}}>
                  <td style={{ fontWeight: 800, color: i < 3 ? 'var(--teal-deep)' : 'var(--muted)' }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''} {i + 1}
                  </td>
                  <td style={{ fontWeight: 600 }}>{row.oferente}</td>
                  {paisesDestino?.map((p) => (
                    <td key={p} className="td-num num">
                      {row[p]?.toFixed(2) || '—'}
                      <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>× {paisPesos[p]}% = <b>{((row[p] || 0) * paisPesos[p] / 100).toFixed(2)}</b></div>
                    </td>
                  ))}
                  <td className="td-num num" style={{ fontWeight: 800, color: 'var(--teal-deep)' }}>
                    {row.notaFinal.toFixed(2)}
                    <div style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--muted)' }}>
                      = {paisesDestino?.map((p) => ((row[p] || 0) * paisPesos[p] / 100).toFixed(2)).join(' + ')}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!notaFinal.length && <div className="empty">No hay datos suficientes.</div>}
      </div>

      <div className="section-title">Detalle por País Destino</div>
      {paisesDestino?.map((pais) => {
        const items = paisDetalles[pais] || []
        if (!items.length) return null
        return (
          <div key={pais} className="card" style={{ marginBottom: 14 }}>
            <div style={{ padding: '10px 14px', background: 'var(--teal-dark)', color: '#fff', fontWeight: 700, fontSize: 13 }}>
              📊 {PAISES_MAP[pais] || pais} ({pais}) — Peso: {paisPesos[pais]}%
            </div>
            <div className="table-scroll">
              <table className="grid">
                <thead><tr>
                  <th>#</th><th>Oferente</th>
                  {Object.entries(regionPesos).map(([reg, peso]) => (
                    <th key={reg} className="th-num">{regLabels[reg]} ({peso}%)</th>
                  ))}
                  <th className="th-num" style={{ fontWeight: 800 }}>Nota País</th>
                </tr></thead>
                <tbody>
                  {items.map((d, i) => (
                    <tr key={i} style={i === 0 ? { background: 'var(--mint)' } : {}}>
                      <td style={{ fontWeight: 800, color: i < 3 ? 'var(--teal-deep)' : 'var(--muted)' }}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{d.oferente}</td>
                      {Object.entries(regionPesos).map(([reg, peso]) => (
                        <td key={reg} className="td-num num">
                          <span title={`Score de la región (mejor promedio ÷ promedio del oferente × 100)`}>{(d[reg] || 0).toFixed(1)}</span>
                          <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                            × {peso}% = <b>{(d[reg + '_contrib'] ?? ((d[reg] || 0) * peso / 100)).toFixed(2)}</b>
                          </div>
                        </td>
                      ))}
                      <td className="td-num num" style={{ fontWeight: 800, color: 'var(--teal-deep)' }}>
                        {d.notaPais.toFixed(2)}
                        <div style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--muted)' }}>
                          = {Object.entries(regionPesos).map(([reg]) => (d[reg + '_contrib'] ?? ((d[reg] || 0) * regionPesos[reg] / 100)).toFixed(2)).join(' + ')}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '8px 14px', fontSize: 11.5, color: 'var(--muted)', borderTop: '1px solid var(--line, #e5e7eb)' }}>
              Cada celda de región muestra el <b>score</b> (arriba) y su <b>contribución ponderada</b> (score × peso). La <b>Nota País</b> es la suma de esas contribuciones.
            </div>
          </div>
        )
      })}
    </section>
  )
}

function ReglasRankingRegional({ regionPesos, paisPesos, regLabels }) {
  if (!regionPesos || !paisPesos) return null
  return (
    <details className="card" style={{ marginBottom: 16, padding: 0 }} open>
      <summary style={{ padding: '10px 14px', background: 'var(--teal-dark)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
        ℹ️ ¿Cómo se calcula la nota? (reglas del ranking regional)
      </summary>
      <div style={{ padding: '12px 16px', fontSize: 12.5, lineHeight: 1.6 }}>
        <p style={{ marginTop: 0 }}>La nota se construye en tres pasos:</p>
        <ol style={{ paddingLeft: 18, margin: '8px 0' }}>
          <li>
            <b>Score por región de origen.</b> Para cada región (América, Europa, Asia PB, Asia) se toma el
            <b> promedio de la tarifa base seleccionada</b> de cada oferente y se calcula:
            <div style={{ margin: '4px 0', padding: '6px 10px', background: 'var(--mint, #eef7f4)', borderRadius: 6, fontFamily: 'monospace', fontSize: 12 }}>
              score_región = (mejor promedio ÷ promedio del oferente) × 100
            </div>
            El oferente con el mejor (menor) promedio obtiene <b>100</b>; el resto, proporcionalmente menos.
          </li>
          <li>
            <b>Nota País.</b> Se suma cada score multiplicado por el peso de su región:
            <div style={{ margin: '4px 0', padding: '6px 10px', background: 'var(--mint, #eef7f4)', borderRadius: 6, fontFamily: 'monospace', fontSize: 12 }}>
              Nota País = {Object.entries(regionPesos).map(([reg, peso]) => `score_${(regLabels[reg] || reg)} × ${peso}%`).join(' + ')}
            </div>
          </li>
          <li>
            <b>Nota Final.</b> Se ponderan las Notas País según su peso en la región seleccionada:
            <div style={{ margin: '4px 0', padding: '6px 10px', background: 'var(--mint, #eef7f4)', borderRadius: 6, fontFamily: 'monospace', fontSize: 12 }}>
              Nota Final = {Object.entries(paisPesos).map(([p, w]) => `Nota_${p} × ${w}%`).join(' + ')}
            </div>
          </li>
        </ol>
        <p style={{ marginBottom: 0, color: 'var(--muted)' }}>
          Las tablas de abajo muestran el desglose: cada celda incluye el score y su contribución ponderada.
        </p>
      </div>
    </details>
  )
}
