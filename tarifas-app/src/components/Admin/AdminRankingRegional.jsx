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
                  {paisesDestino?.map((p) => <td key={p} className="td-num num">{row[p]?.toFixed(2) || '—'}</td>)}
                  <td className="td-num num" style={{ fontWeight: 800, color: 'var(--teal-deep)' }}>{row.notaFinal.toFixed(2)}</td>
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
                      {Object.keys(regionPesos).map((reg) => (
                        <td key={reg} className="td-num num">{(d[reg] || 0).toFixed(1)}</td>
                      ))}
                      <td className="td-num num" style={{ fontWeight: 800, color: 'var(--teal-deep)' }}>{d.notaPais.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </section>
  )
}
