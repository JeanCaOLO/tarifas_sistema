import { useState, useContext, useEffect, useRef } from 'react'
import { AdminContext } from '../../pages/AdminPage'
import { PAISES_MAP, TOTAL_RUTAS } from '../../constants'
import { fmtMoney, avg } from '../../utils/format'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

export default function AdminDashboard() {
  const { respuestas, tarifas } = useContext(AdminContext)
  const [dPais, setDPais] = useState('')

  const subs = dPais ? respuestas.filter((r) => r.pais === dPais) : respuestas
  const rates = dPais ? tarifas.filter((t) => t.pais === dPais) : tarifas

  const kResp = subs.length
  const kOfer = new Set(subs.map((r) => r.oferente.trim().toLowerCase())).size
  const cob = avg(subs.map((r) => r.rutas_cotizadas / TOTAL_RUTAS * 100))
  const t40 = avg(rates.map((t) => t.tarifa_40_std).filter((v) => v !== null).map(Number))

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
        <span className="count-note">{subs.length} respuestas</span>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="k-label">Respuestas</div><div className="k-value">{kResp}</div></div>
        <div className="kpi"><div className="k-label">Oferentes únicos</div><div className="k-value">{kOfer}</div></div>
        <div className="kpi"><div className="k-label">Cobertura promedio</div><div className="k-value">{cob !== null ? cob.toFixed(0) + '%' : '—'}</div></div>
        <div className="kpi"><div className="k-label">Tarifa prom. 40" STD</div><div className="k-value">{t40 !== null ? '$' + fmtMoney(t40) : '—'}</div></div>
      </div>

      <div className="charts">
        <ChartCard title="Respuestas por país" id="chPais" respuestas={respuestas} />
      </div>
    </section>
  )
}

function ChartCard({ title, id, respuestas }) {
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
        datasets: [{ label: 'Respuestas', data: codigos.map((c) => respuestas.filter((r) => r.pais === c).length), backgroundColor: '#00B497', borderRadius: 6 }]
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
