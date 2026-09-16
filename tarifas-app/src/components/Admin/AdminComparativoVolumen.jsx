import { useState, useContext, useMemo } from 'react'
import { AdminContext } from '../../pages/AdminPage'
import { calcularRanking } from '../../utils/ranking'
import { calcularRankingR2 } from '../../utils/rankingR2'
import { calcularComparativoVolumen, exportarComparativoVolumen } from '../../utils/comparativoVolumen'
import { MESES, totalPais } from '../../utils/volumen'
import { getVolumenConfig } from '../../utils/rankingConfig'
import { fmtMoney } from '../../utils/format'
import { PAISES, PAISES_MAP } from '../../constants'
import ExcluirOferentes, { aplicarExclusion } from './ExcluirOferentes'

const REG_LABELS = { America: 'América', Europa: 'Europa', 'Asia Puertos Base': 'Asia PB', Asia: 'Asia' }
const REGIONES = ['America', 'Europa', 'Asia Puertos Base', 'Asia']

/**
 * Comparativo Volumen × Precio.
 * Muestra el mejor oferente por COSTO = (volumen/2) × tarifa por región y por
 * país, y lo compara con el mejor oferente según el ranking actual (puntaje).
 */
export default function AdminComparativoVolumen() {
  const {
    respuestas, tarifas, respuestasR2, tarifasR2, condOpR2,
    volumenes, oferentesExcluidos, etapa
  } = useContext(AdminContext)

  const [campo, setCampo] = useState('tarifa_40_std')
  const [periodo, setPeriodo] = useState('anual') // 'anual' | mes
  const [paisFiltro, setPaisFiltro] = useState('')
  // Divisor de la fórmula (persistido en Configuración → Volumen)
  const divNum = Number(getVolumenConfig().divisor) > 0 ? Number(getVolumenConfig().divisor) : 2

  // porRuta según la etapa activa
  const porRuta = useMemo(() => {
    if (etapa === '2') {
      const tars = tarifasR2 || []
      const resp = (respuestasR2 || []).map((r) => {
        const condOp = (condOpR2 || []).find((c) =>
          c.oferente.trim().toLowerCase() === r.oferente.trim().toLowerCase())
        if (!condOp) return r
        return {
          ...r,
          credito_dias: r.credito_dias ?? condOp.credito_dias,
          facturacion_aplica: r.facturacion_aplica ?? condOp.facturacion_aplica,
          herramienta_seguimiento: r.herramienta_seguimiento ?? condOp.herramienta_seguimiento,
          gastos_fob: r.gastos_fob ?? condOp.gastos_fob
        }
      })
      const { respuestas: rf, tarifas: tf } = aplicarExclusion(resp, tars, oferentesExcluidos)
      return calcularRankingR2(tf, rf, { pais: '', campo, regionFiltro: '', formRegion: '' }).porRuta
    }
    const { respuestas: rf, tarifas: tf } = aplicarExclusion(respuestas, tarifas, oferentesExcluidos)
    return calcularRanking(tf, rf, { pais: '', campo, regionFiltro: '', formRegion: '' }).porRuta
  }, [etapa, respuestas, tarifas, respuestasR2, tarifasR2, condOpR2, oferentesExcluidos, campo])

  const comp = useMemo(
    () => calcularComparativoVolumen(porRuta, volumenes, periodo, { paisFiltro, divisor: divNum }),
    [porRuta, volumenes, periodo, paisFiltro, divNum]
  )

  const hayVolumen = (volumenes || []).length > 0

  return (
    <section>
      <div className="section-title">Comparativo Volumen × Precio — Etapa {etapa}</div>
      <div className="card" style={{ padding: '12px 16px', marginBottom: 14, fontSize: 12.5, lineHeight: 1.6 }}>
        Mejor oferente según el <b>costo total</b> que nos representa. Fórmula usada:
        <div style={{ margin: '6px 0', padding: '8px 12px', background: 'var(--mint, #eef7f4)', borderRadius: 6, fontFamily: 'monospace', fontSize: 13 }}>
          costo = (volumen ÷ {divNum}) × tarifa
        </div>
        Donde <b>volumen</b> = TEUs que movemos por ese puerto (según país destino y periodo),
        <b> tarifa</b> = tarifa base seleccionada del oferente, y <b>÷ {divNum}</b> convierte TEUs a
        contenedores. <b>Menor costo = mejor.</b> Se compara con el mejor oferente del ranking actual (por puntaje).
        El divisor se ajusta en <b>Configuración → Volumen</b>.
      </div>

      {!hayVolumen && (
        <div className="card" style={{ padding: '10px 14px', marginBottom: 14, background: '#fff6e5', color: '#8a6d00', fontSize: 12.5 }}>
          ⚠ Aún no hay volumen cargado. Ve a <b>Configuración → Volumen</b> para capturarlo o importarlo.
        </div>
      )}

      <ExcluirOferentes respuestas={etapa === '2' ? respuestasR2 : respuestas} />

      <div className="filters" style={{ gap: 10, flexWrap: 'wrap' }}>
        <div className="f"><label>Tarifa base</label>
          <select value={campo} onChange={(e) => setCampo(e.target.value)}>
            <option value="tarifa_20_std">20" STD</option>
            <option value="tarifa_40_std">40" STD</option>
            <option value="tarifa_40_hc">40" HC</option>
          </select>
        </div>
        <div className="f"><label>Periodo</label>
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            <option value="anual">Anual (total)</option>
            {MESES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>
        <div className="f"><label>País destino</label>
          <select value={paisFiltro} onChange={(e) => setPaisFiltro(e.target.value)}>
            <option value="">Todos</option>
            {PAISES.map((p) => <option key={p.code} value={p.code}>{p.nombre}</option>)}
          </select>
        </div>
        <span className="spacer" />
        <button className="btn btn-sm" disabled={!comp.global.some((o) => o.costo > 0)}
          onClick={() => exportarComparativoVolumen(comp, { etapa, periodo, campo, paisFiltro, divisor: divNum })}>
          ⬇ Descargar Excel
        </button>
      </div>

      {/* Mejor por REGIÓN */}
      <div className="section-title" style={{ marginTop: 18 }}>Mejor oferente por Región de origen</div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="table-scroll">
          <table className="grid">
            <thead><tr>
              <th>Región</th>
              <th>🏆 Mejor por Costo (vol × precio)</th>
              <th className="th-num">Costo total</th>
              <th className="th-num">Volumen (TEUs)</th>
              <th>Mejor por Ranking actual</th>
              <th className="th-num">¿Coinciden?</th>
            </tr></thead>
            <tbody>
              {REGIONES.map((reg) => {
                const g = comp.porRegion[reg]
                return <FilaComparativo key={reg} etiqueta={REG_LABELS[reg] || reg} grupo={g} divisor={divNum} />
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mejor por PAÍS */}
      <div className="section-title">Mejor oferente por País destino</div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="table-scroll">
          <table className="grid">
            <thead><tr>
              <th>País</th>
              <th>🏆 Mejor por Costo (vol × precio)</th>
              <th className="th-num">Costo total</th>
              <th className="th-num">Volumen (TEUs)</th>
              <th>Mejor por Ranking actual</th>
              <th className="th-num">¿Coinciden?</th>
            </tr></thead>
            <tbody>
              {PAISES.filter((p) => !paisFiltro || p.code === paisFiltro).map((p) => {
                const g = comp.porPais[p.code]
                return <FilaComparativo key={p.code} etiqueta={p.nombre} grupo={g} divisor={divNum} />
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ranking global por costo */}
      <div className="section-title">Ranking global por Costo (menor = mejor)</div>
      <div className="card">
        <div className="table-scroll" style={{ maxHeight: 420 }}>
          <table className="grid">
            <thead><tr>
              <th>#</th><th>Oferente</th><th>País</th>
              <th className="th-num">Volumen (TEUs)</th>
              <th className="th-num">Tarifa prom.</th>
              <th className="th-num">Costo total (vol/{divNum} × tarifa)</th>
              <th className="th-num">Puntaje ranking</th>
            </tr></thead>
            <tbody>
              {comp.global.filter((o) => o.costo > 0).map((o, i) => (
                <tr key={i} style={i === 0 ? { background: 'var(--mint)' } : {}}>
                  <td style={{ fontWeight: 800, color: i < 3 ? 'var(--teal-deep)' : 'var(--muted)' }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''} {i + 1}
                  </td>
                  <td style={{ fontWeight: 600 }}>{o.oferente}</td>
                  <td><span className="badge">{o.pais_nombre || o.pais}</span></td>
                  <td className="td-num num" title={`Volumen total del oferente en sus rutas con cotización: ${o.volumen.toLocaleString('en-US')} TEUs (${o.rutasConVolumen} de ${o.rutas} ruta(s) con volumen)`}>{o.volumen.toLocaleString('en-US')}</td>
                  <td className="td-num num" title={`Tarifa promedio del oferente sobre ${o.rutas} ruta(s)`}>${fmtMoney(o.avgTarifa)}</td>
                  <td className="td-num num" style={{ fontWeight: 800, color: 'var(--teal-deep)' }} title={tipCosto(o, divNum)}>${fmtMoney(o.costo)}</td>
                  <td className="td-num num" title="Puntaje promedio del oferente en el ranking actual (por reglas de puntaje)">{o.avgPuntaje.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!comp.global.some((o) => o.costo > 0) && (
          <div className="empty">No hay costo calculable. Verifica que haya volumen cargado y tarifas para el país seleccionado.</div>
        )}
      </div>

      {/* Puertos con volumen SIN cotización — se muestran para evidenciar, no se comparan */}
      {comp.sinCotizacion && comp.sinCotizacion.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 24 }}>
            Volumen sin cotización (no se compara)
          </div>
          <div className="card" style={{ padding: '10px 14px', marginBottom: 10, fontSize: 12.5, lineHeight: 1.5, background: '#fff6e5', color: '#8a6d00' }}>
            Estos puertos tienen volumen nuestro pero <b>ningún oferente cotizó tarifa</b> para ellos,
            por lo que <b>no entran</b> en el comparativo de costo. Se listan solo para dejar constancia.
          </div>
          <div className="card">
            <div className="table-scroll" style={{ maxHeight: 340 }}>
              <table className="grid">
                <thead><tr>
                  <th>País</th><th>Puerto Origen</th><th>Región</th><th className="th-num">Volumen (TEUs)</th>
                </tr></thead>
                <tbody>
                  {comp.sinCotizacion.map((s, i) => (
                    <tr key={i}>
                      <td><span className="badge">{s.pais_nombre}</span></td>
                      <td style={{ fontWeight: 600 }}>{s.puerto}</td>
                      <td style={{ color: 'var(--muted)' }}>{s.region || '—'}</td>
                      <td className="td-num num">{s.volumen.toLocaleString('en-US')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '8px 14px', fontSize: 11.5, color: 'var(--muted)', borderTop: '1px solid var(--line, #e5e7eb)' }}>
              {comp.sinCotizacion.length} puerto(s) · {comp.sinCotizacion.reduce((a, s) => a + s.volumen, 0).toLocaleString('en-US')} TEUs sin comparar
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function FilaComparativo({ etiqueta, grupo, divisor }) {
  const mc = grupo?.mejorCosto
  const mp = grupo?.mejorPuntaje
  const coincide = mc && mp && mc.oferente.trim().toLowerCase() === mp.oferente.trim().toLowerCase()
  return (
    <tr>
      <td style={{ fontWeight: 700 }}>{etiqueta}</td>
      <td style={{ fontWeight: 600 }}>{mc ? mc.oferente : '—'}</td>
      <td className="td-num num" style={{ fontWeight: 700, color: 'var(--teal-deep)' }} title={mc ? tipCosto(mc, divisor) : ''}>{mc ? `$${fmtMoney(mc.costo)}` : '—'}</td>
      <td className="td-num num">{mc ? mc.volumen.toLocaleString('en-US') : '—'}</td>
      <td>{mp ? mp.oferente : '—'}</td>
      <td className="td-num">
        {(!mc || !mp) ? '—' : coincide
          ? <span style={{ color: 'var(--teal-deep)', fontWeight: 700 }}>✓ Sí</span>
          : <span style={{ color: '#c0392b', fontWeight: 700 }}>✗ No</span>}
      </td>
    </tr>
  )
}

// Tooltip con la fórmula y los valores usados para calcular el costo
function tipCosto(o, divisor) {
  const div = Number(divisor) > 0 ? Number(divisor) : 2
  const vol = o.volumen || 0
  const tar = o.avgTarifa || 0
  return `COSTO TOTAL (menor = mejor)\n` +
    `Fórmula: (volumen ÷ ${div}) × tarifa\n` +
    `Volumen del oferente: ${vol.toLocaleString('en-US')} TEUs\n` +
    `Tarifa promedio: $${fmtMoney(tar)}\n` +
    `= (${vol.toLocaleString('en-US')} ÷ ${div}) × $${fmtMoney(tar)}\n` +
    `≈ $${fmtMoney(o.costo)}\n` +
    `(Suma de (volumen_ruta ÷ ${div}) × tarifa_ruta en ${o.rutasConVolumen} ruta(s) con volumen)`
}
