import { useState, useContext } from 'react'
import { AdminContext } from '../../pages/AdminPage'
import { calcularRankingRegional } from '../../utils/ranking'
import { PAISES_MAP } from '../../constants'
import { fmtMoney } from '../../utils/format'
import { exportarReporteRegional } from '../../utils/reporteOferente'
import { exportarRankingRegionalPDF } from '../../utils/reporteRankingPDF'
import FiltroRegiones, { REGIONES_ORIGEN } from './FiltroRegiones'
import ExcluirOferentes, { aplicarExclusion } from './ExcluirOferentes'

export default function AdminRankingRegional() {
  const { respuestas, tarifas, oferentesExcluidos, volumenes } = useContext(AdminContext)
  const [formRegion, setFormRegion] = useState('CA')
  const [campo, setCampo] = useState('tarifa_40_std')
  const [regiones, setRegiones] = useState(() => new Set(REGIONES_ORIGEN))

  const regLabels = { America: 'América', Europa: 'Europa', 'Asia Puertos Base': 'Asia PB', Asia: 'Asia' }

  function toggleRegion(reg) {
    setRegiones((prev) => {
      const next = new Set(prev)
      if (next.has(reg)) next.delete(reg); else next.add(reg)
      return next
    })
  }

  const { respuestas: respFilt, tarifas: tarFilt } = aplicarExclusion(respuestas, tarifas, oferentesExcluidos)
  const regionesArr = [...regiones]
  const resultado = calcularRankingRegional(tarFilt, respFilt, { formRegion, campo, regionesIncluidas: regionesArr, volumenes })
  const { notaFinal, paisDetalles, paisPesos, regionPesos, paisesDestino } = resultado

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
        <button className="btn btn-sm" disabled={!notaFinal.length}
          onClick={() => exportarRankingRegionalPDF(resultado, { etapa: '1', formRegion, campo })}>
          📄 PDF resumen
        </button>
      </div>

      <FiltroRegiones
        seleccionadas={regiones}
        onToggle={toggleRegion}
        onTodas={() => setRegiones(new Set(REGIONES_ORIGEN))}
        onSoloPB={() => setRegiones(new Set(['Asia Puertos Base']))}
        label="Regiones de origen (los pesos se re-normalizan)"
      />

      <PesosPorPais resultado={resultado} regLabels={regLabels} />

      <ExcluirOferentes respuestas={respuestas} />

      <ReglasRankingRegional regionPesos={regionPesos} paisPesos={paisPesos} regLabels={regLabels} />

      <div className="section-title">Nota Final por Oferente (por posición)</div>
      <div className="card" style={{ padding: '8px 14px', marginBottom: 8, fontSize: 11.5, color: 'var(--muted)' }}>
        La Nota Final se calcula por <b>puesto por país</b>: 1º = 100 pts, 2º = 80, 3º = 60, 4º = 40, 5º = 20…, ponderado por el peso de cada país. Así, ganar un país con más peso mueve fuertemente la nota. El score de costo queda como dato informativo en el tooltip.
      </div>
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="table-scroll" style={{ maxHeight: 450 }}>
          <table className="grid">
            <thead><tr>
              <th>#</th><th>Oferente</th>
              {paisesDestino?.map((p) => <th key={p} className="th-num">{PAISES_MAP[p] || p} ({paisPesos[p]}%)</th>)}
              <th className="th-num" style={{ fontWeight: 800 }}>Nota Final</th>
              <th>Reporte</th>
            </tr></thead>
            <tbody>
              {notaFinal.map((row, i) => (
                <tr key={i} style={i === 0 ? { background: 'var(--mint)' } : {}}>
                  <td style={{ fontWeight: 800, color: i < 3 ? 'var(--teal-deep)' : 'var(--muted)' }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''} {i + 1}
                  </td>
                  <td style={{ fontWeight: 600 }}>{row.oferente}</td>
                  {paisesDestino?.map((p) => {
                    const puesto = row[p + '_puesto'] || 0
                    const puntos = row[p + '_puntos'] ?? 0
                    return (
                      <td key={p} className="td-num num" title={`Puesto en ${PAISES_MAP[p] || p}: ${puesto || '—'}\nPuntos por posición: ${puntos} (1º=100, 2º=80, 3º=60, 4º=40, 5º=20)\nPeso del país: ${paisPesos[p]}%\nContribución = ${puntos} × ${paisPesos[p]}% = ${(puntos * paisPesos[p] / 100).toFixed(2)}\n\n(Score de costo, informativo: ${(row[p] || 0).toFixed(2)})`}>
                        <span style={{ fontWeight: 700 }}>{medalla(puesto)}{puesto || '—'}</span>
                        <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{puntos} pts × {paisPesos[p]}% = <b>{(puntos * paisPesos[p] / 100).toFixed(2)}</b></div>
                      </td>
                    )
                  })}
                  <td className="td-num num" style={{ fontWeight: 800, color: 'var(--teal-deep)' }} title={`NOTA FINAL = suma de (puntos por puesto × peso del país)\n${paisesDestino?.map((p) => `${PAISES_MAP[p] || p}: puesto ${row[p + '_puesto'] || '—'} = ${row[p + '_puntos'] ?? 0} pts × ${paisPesos[p]}% = ${((row[p + '_puntos'] ?? 0) * paisPesos[p] / 100).toFixed(2)}`).join('\n')}\n= ${row.notaFinal.toFixed(2)}`}>
                    {row.notaFinal.toFixed(2)}
                    <div style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--muted)' }}>
                      = {paisesDestino?.map((p) => ((row[p + '_puntos'] ?? 0) * paisPesos[p] / 100).toFixed(2)).join(' + ')}
                    </div>
                  </td>
                  <td><button className="btn btn-ghost btn-sm" title="Descargar reporte regional de este oferente con sus regiones más bajas" onClick={() => exportarReporteRegional(row.oferente, resultado, '1', formRegion)}>📄 Descargar</button></td>
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
              📊 {PAISES_MAP[pais] || pais} ({pais}) — Peso: {paisPesos[pais]}% · Posición según el Ranking
            </div>
            <div className="table-scroll">
              <table className="grid">
                <thead><tr>
                  <th>Puesto</th><th>Oferente</th>
                  <th className="th-num">Nota Ranking</th>
                  <th className="th-num">Puntos por posición</th>
                  <th className="th-num">Rutas</th>
                </tr></thead>
                <tbody>
                  {items.map((d, i) => (
                    <tr key={i} style={i === 0 ? { background: 'var(--mint)' } : {}}>
                      <td style={{ fontWeight: 800, color: i < 3 ? 'var(--teal-deep)' : 'var(--muted)' }}>{medalla(d.puesto)}{d.puesto || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{d.oferente}</td>
                      <td className="td-num num" title="Nota total de este oferente en el Ranking (mismo criterio, costo ponderado por volumen)">{(d.notaRanking || 0).toFixed(2)}</td>
                      <td className="td-num num" style={{ fontWeight: 700 }}>{puntosPuesto(d.puesto)}</td>
                      <td className="td-num num">{d.rutas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '8px 14px', fontSize: 11.5, color: 'var(--muted)', borderTop: '1px solid var(--line, #e5e7eb)' }}>
              El puesto es el mismo del <b>Ranking</b> filtrado a este país (costo ponderado por volumen). Puntos: 1º=100, 2º=80, 3º=60, 4º=40, 5º=20.
            </div>
          </div>
        )
      })}
    </section>
  )
}

function medalla(puesto) {
  return puesto === 1 ? '🥇 ' : puesto === 2 ? '🥈 ' : puesto === 3 ? '🥉 ' : ''
}

function puntosPuesto(puesto) {
  if (!puesto || puesto < 1) return 0
  return Math.max(0, 100 - (puesto - 1) * 20)
}

function PesosPorPais({ resultado, regLabels }) {
  const { regionPesosPorPais, paisPesos, paisesDestino } = resultado
  if (!regionPesosPorPais || !paisesDestino?.length) return null
  const regs = ['America', 'Europa', 'Asia Puertos Base', 'Asia']
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ padding: '10px 14px', background: 'var(--teal-dark)', color: '#fff', fontWeight: 700, fontSize: 13 }}>
        Distribución de pesos por país (según volumen real)
      </div>
      <div className="table-scroll">
        <table className="grid">
          <thead><tr>
            <th>País destino</th>
            <th className="th-num">Peso país</th>
            {regs.map((r) => <th key={r} className="th-num">{regLabels[r] || r}</th>)}
          </tr></thead>
          <tbody>
            {paisesDestino.map((p) => {
              const pesos = regionPesosPorPais[p] || {}
              return (
                <tr key={p}>
                  <td style={{ fontWeight: 600 }}>{PAISES_MAP[p] || p}</td>
                  <td className="td-num num" style={{ fontWeight: 700 }}>{paisPesos[p]}%</td>
                  {regs.map((r) => (
                    <td key={r} className="td-num num" style={r === 'Asia Puertos Base' ? { color: '#B8860B', fontWeight: 700 } : {}}>
                      {pesos[r] != null ? `${pesos[r]}%` : '—'}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '8px 14px', fontSize: 11.5, color: 'var(--muted)', borderTop: '1px solid var(--line, #e5e7eb)' }}>
        Estos pesos reflejan cuánto volumen movemos por región en cada país. Se re-normalizan si filtras regiones.
      </div>
    </div>
  )
}

function CeldaRegion({ d, reg, peso }) {
  const score = d[reg] || 0
  const avg = d[reg + '_avg']
  const rutas = d[reg + '_rutas'] || 0
  const costo = d[reg + '_costo']
  const usaCosto = d[reg + '_usaCosto']
  const contrib = d[reg + '_contrib'] ?? (score * peso / 100)
  const esMejor = Math.abs(score - 100) < 0.05

  if (avg == null) {
    return <span style={{ color: 'var(--muted)' }} title={`Sin cotizaciones del oferente en esta región → no contribuye a la Nota País`}>—</span>
  }

  const tip = usaCosto
    ? `SCORE DE LA REGIÓN (peso ${peso}%) — ponderado por VOLUMEN (ahorro real)\n` +
      `Costo del oferente = Σ (tarifa × volumen ÷ divisor) en esta región = $${fmtMoney(costo || 0)}\n` +
      `Score = (menor costo de la región ÷ costo del oferente) × 100 = ${score.toFixed(1)}${esMejor ? '  ★ mejor (100)' : ''}\n` +
      `Tarifa promedio (informativa): ${avg.toFixed(0)}\n` +
      `Contribución = score × ${peso}% = ${contrib.toFixed(2)} a la Nota País.`
    : `SCORE DE LA REGIÓN (peso ${peso}%) — sin volumen, por tarifa promedio\n` +
      `Score = (mejor promedio ÷ promedio del oferente) × 100 = ${score.toFixed(1)}\n` +
      `Contribución = score × ${peso}% = ${contrib.toFixed(2)}.`

  return (
    <div title={tip}>
      <div style={{ fontWeight: 700, color: esMejor ? 'var(--teal-deep)' : 'inherit' }}>
        {score.toFixed(1)}{esMejor ? ' ★' : ''}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.4 }}>
        {usaCosto ? <>costo: ${fmtMoney(costo || 0)}<br /></> : <>prom: {avg.toFixed(0)}<br /></>}
        × {peso}% = <b>{contrib.toFixed(2)}</b>
        {rutas ? <><br /><span style={{ fontSize: 9.5 }}>({rutas} ruta{rutas !== 1 ? 's' : ''})</span></> : null}
      </div>
    </div>
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
