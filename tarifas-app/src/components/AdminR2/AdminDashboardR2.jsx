import { useState, useContext, useEffect, useRef } from 'react'
import { AdminContext } from '../../pages/AdminPage'
import { PAISES_MAP, TOTAL_RUTAS } from '../../constantsR2'
import { fmtMoney, avg } from '../../utils/format'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

export default function AdminDashboardR2() {
  const { respuestasR2, tarifasR2 } = useContext(AdminContext)
  const [dPais, setDPais] = useState('')

  const respuestas = respuestasR2 || []
  const tarifas = tarifasR2 || []

  const subs = dPais ? respuestas.filter((r) => r.pais === dPais) : respuestas
  const rates = dPais ? tarifas.filter((t) => t.pais === dPais) : tarifas

  const kResp = subs.length
  const kOfer = new Set(subs.map((r) => r.oferente.trim().toLowerCase())).size
  const cob = avg(subs.map((r) => r.rutas_cotizadas / TOTAL_RUTAS * 100))
  const t40 = avg(rates.map((t) => t.tarifa_40_std).filter((v) => v !== null).map(Number))

  // Allocation promedio
  const allocAvg = avg(subs.map((r) =>
    (Number(r.allocation_america) || 0) + (Number(r.allocation_europa) || 0) +
    (Number(r.allocation_asia_pb) || 0) + (Number(r.allocation_asia_restante) || 0)
  ).filter((v) => v > 0))

  // % que facturan al arribo
  const arriboCount = subs.filter((r) => r.facturacion_aplica === 'arribo').length
  const arriboPct = kResp > 0 ? Math.round(arriboCount / kResp * 100) : 0

  return (
    <section>
      <div className="filters">
        <div className="f">
          <label>País</label>
          <select value={dPais} onChange={(e) => setDPais(e.target.value)}>
            <option value="">Todos</option>
            <option value="CR">Costa Rica</option>
            <option value="SV">El Salvador</option>
            <option value="GT">Guatemala</option>
            <option value="VNZ">Venezuela</option>
          </select>
        </div>
        <span className="spacer" />
        <span className="count-note">{subs.length} respuestas R2</span>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="k-label">Respuestas R2</div><div className="k-value">{kResp}</div></div>
        <div className="kpi"><div className="k-label">Oferentes únicos</div><div className="k-value">{kOfer}</div></div>
        <div className="kpi"><div className="k-label">Cobertura promedio</div><div className="k-value">{cob !== null ? cob.toFixed(0) + '%' : '—'}</div></div>
        <div className="kpi"><div className="k-label">Tarifa prom. 40" STD</div><div className="k-value">{t40 !== null ? '$' + fmtMoney(t40) : '—'}</div></div>
        <div className="kpi" style={{ borderLeftColor: '#F2B33D' }}><div className="k-label">Allocation prom. (TEUS)</div><div className="k-value">{allocAvg !== null ? Math.round(allocAvg) : '—'}</div></div>
        <div className="kpi" style={{ borderLeftColor: '#8A5A00' }}><div className="k-label">Facturan al Arribo</div><div className="k-value">{arriboPct}%</div></div>
      </div>

      <div className="charts">
        <ChartCard title="Respuestas R2 por país" respuestas={respuestas} />
        <ChartCardAlloc title="Allocation promedio por región" subs={subs} />
      </div>
    </section>
  )
}

function ChartCard({ title, respuestas }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    if (!canvasRef.current) return
    if (chartRef.current) chartRef.current.destroy()

    const codigos = Object.keys(PAISES_MAP)
    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: codigos.map((c) => PAISES_MAP[c]),
        datasets: [{ label: 'Respuestas R2', data: codigos.map((c) => respuestas.filter((r) => r.pais === c).length), backgroundColor: '#F2B33D', borderRadius: 6 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    })
    return () => { if (chartRef.current) chartRef.current.destroy() }
  }, [respuestas])

  return (
    <div className="chart-card">
      <h3>{title}</h3>
      <div className="c-wrap"><canvas ref={canvasRef} /></div>
    </div>
  )
}

function ChartCardAlloc({ title, subs }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    if (!canvasRef.current) return
    if (chartRef.current) chartRef.current.destroy()

    const regiones = ['América', 'Europa', 'Asia PB', 'Asia Rest.']
    const keys = ['allocation_america', 'allocation_europa', 'allocation_asia_pb', 'allocation_asia_restante']

    const data = keys.map((k) => {
      const vals = subs.map((r) => Number(r[k]) || 0).filter((v) => v > 0)
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
    })

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: regiones,
        datasets: [{ label: 'Allocation TEUS (prom)', data, backgroundColor: '#00B497', borderRadius: 6 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    })
    return () => { if (chartRef.current) chartRef.current.destroy() }
  }, [subs])

  return (
    <div className="chart-card">
      <h3>{title}</h3>
      <div className="c-wrap"><canvas ref={canvasRef} /></div>
    </div>
  )
}
