import { useState, useContext } from 'react'
import { AdminContext } from '../../pages/AdminPage'
import { calcularRanking } from '../../utils/ranking'
import { fmtMoney } from '../../utils/format'
import { PAISES_MAP } from '../../constants'

export default function AdminRanking() {
  const { respuestas, tarifas } = useContext(AdminContext)
  const [pais, setPais] = useState('')
  const [campo, setCampo] = useState('tarifa_40_std')
  const [regionFiltro, setRegionFiltro] = useState('')
  const [formRegion, setFormRegion] = useState('')

  const { porRuta, global } = calcularRanking(tarifas, respuestas, { pais, campo, regionFiltro, formRegion })

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
        <div className="f"><label>Región origen</label>
          <select value={regionFiltro} onChange={(e) => setRegionFiltro(e.target.value)}>
            <option value="">Todas</option>
            <option value="Asia">Asia</option><option value="Asia Puertos Base">Asia Puertos Base</option>
            <option value="Europa">Europa</option><option value="America">América</option>
          </select>
        </div>
        <div className="f"><label>Región (CA/VE)</label>
          <select value={formRegion} onChange={(e) => setFormRegion(e.target.value)}>
            <option value="">Todas</option><option value="CA">CA</option><option value="VE">VE</option>
          </select>
        </div>
        <span className="spacer" />
        <span className="count-note">{porRuta.length} evaluaciones · {global.length} oferentes</span>
      </div>

      <div className="section-title">Ranking Global por Oferente</div>
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="table-scroll" style={{ maxHeight: 400 }}>
          <table className="grid">
            <thead><tr>
              <th>#</th><th>Oferente</th><th>País</th><th className="th-num">Rutas</th>
              <th className="th-num">Tarifa (80%)</th><th className="th-num">Días (5%)</th>
              <th className="th-num">Crédito (5%)</th><th className="th-num">Gastos (5%)</th>
              <th className="th-num">Herram. (5%)</th><th className="th-num">Total</th>
            </tr></thead>
            <tbody>
              {global.map((o, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 800, color: i < 3 ? 'var(--teal-deep)' : 'var(--muted)' }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{o.oferente}</td>
                  <td><span className="badge">{o.pais_nombre}</span></td>
                  <td className="td-num num">{o.rutas}</td>
                  <td className="td-num num">{o.avg_tarifa.toFixed(2)}</td>
                  <td className="td-num num">{o.avg_dias.toFixed(2)}</td>
                  <td className="td-num num">{o.avg_credito.toFixed(2)}</td>
                  <td className="td-num num">{o.avg_gastos.toFixed(2)}</td>
                  <td className="td-num num">{o.avg_herramienta.toFixed(2)}</td>
                  <td className="td-num num" style={{ fontWeight: 800, color: 'var(--teal-deep)' }}>{o.avg_total.toFixed(2)}</td>
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
                <th className="th-num">Crédito</th><th className="th-num">Gastos</th>
                <th className="th-num">Herram.</th><th className="th-num">Total</th>
              </tr></thead>
              <tbody>
                {items.map((r, i) => (
                  <tr key={i} style={i === 0 ? { background: 'var(--mint)' } : {}}>
                    <td style={{ fontWeight: 800, color: i < 3 ? 'var(--teal-deep)' : 'var(--muted)' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''} {i + 1}
                    </td>
                    <td style={{ fontWeight: 600 }}>{r.oferente} <span className="badge" style={{ fontSize: 10.5, padding: '2px 6px' }}>{r.pais}</span></td>
                    <td className="td-num num">${fmtMoney(r.tarifa)}</td>
                    <td className="td-num num">{r.contrib_tarifa.toFixed(2)}</td>
                    <td className="td-num num">{r.contrib_dias.toFixed(2)}</td>
                    <td className="td-num num">{r.contrib_credito.toFixed(2)}</td>
                    <td className="td-num num">{r.contrib_gastos.toFixed(2)}</td>
                    <td className="td-num num">{r.contrib_herramienta.toFixed(2)}</td>
                    <td className="td-num num" style={{ fontWeight: 800, color: 'var(--teal-deep)' }}>{r.puntaje.toFixed(2)}</td>
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
