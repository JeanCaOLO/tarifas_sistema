import { useState } from 'react'
import {
  loadConfig, saveConfig, resetConfig, getDefaults, sumaPesos, RUBRO_LABELS
} from '../../utils/rankingConfig'
import { PAISES_MAP } from '../../constants'

/**
 * Módulo de Configuración de Rankings.
 * Permite ajustar dinámicamente:
 *   - Pesos de cada rubro (Etapa 1 y Etapa 2)
 *   - Reglas / umbrales de puntaje por rubro
 *   - Pesos regionales (por región de origen y por país destino)
 */
export default function AdminConfig() {
  const [cfg, setCfg] = useState(() => JSON.parse(JSON.stringify(loadConfig())))
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [seccion, setSeccion] = useState('E1') // E1 | E2 | E1_REG | E2_REG

  const regLabels = { America: 'América', Europa: 'Europa', 'Asia Puertos Base': 'Asia PB', Asia: 'Asia' }

  function update(mut) {
    setCfg((prev) => {
      const next = JSON.parse(JSON.stringify(prev))
      mut(next)
      return next
    })
    setGuardado(false)
  }

  async function guardar() {
    setGuardando(true)
    setError('')
    const res = await saveConfig(JSON.parse(JSON.stringify(cfg)))
    setGuardando(false)
    if (res.ok) {
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2500)
    } else {
      setError(res.error || 'No se pudo guardar en la base de datos.')
    }
  }

  async function restaurar() {
    if (!window.confirm('¿Restaurar todos los pesos y reglas a los valores por defecto?')) return
    setGuardando(true)
    setError('')
    const res = await resetConfig()
    setGuardando(false)
    setCfg(JSON.parse(JSON.stringify(res.config || getDefaults())))
    if (res.ok) {
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2500)
    } else {
      setError(res.error || 'No se pudo restaurar en la base de datos.')
    }
  }

  const sumaE1 = sumaPesos(cfg.E1.pesos)
  const sumaE2 = sumaPesos(cfg.E2.pesos)

  return (
    <section>
      <div className="section-title">Configuración de Rankings</div>
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16, fontSize: 12.5, lineHeight: 1.6 }}>
        Ajusta el <b>porcentaje de cada rubro</b> y las <b>reglas de puntaje</b> que definen la nota de los rankings.
        Los cambios se aplican al recalcular los rankings y quedan guardados en este navegador.
        Los pesos de rubros de cada etapa deben sumar <b>100%</b>.
      </div>

      {/* Sub-navegación */}
      <div className="filters" style={{ gap: 8 }}>
        <button className={`btn btn-sm ${seccion === 'E1' ? '' : 'btn-ghost'}`} onClick={() => setSeccion('E1')}>Etapa 1 · Rubros</button>
        <button className={`btn btn-sm ${seccion === 'E1_REG' ? '' : 'btn-ghost'}`} onClick={() => setSeccion('E1_REG')}>Etapa 1 · Regional</button>
        <button className={`btn btn-sm ${seccion === 'E2' ? '' : 'btn-ghost'}`} onClick={() => setSeccion('E2')}>Etapa 2 · Rubros</button>
        <button className={`btn btn-sm ${seccion === 'E2_REG' ? '' : 'btn-ghost'}`} onClick={() => setSeccion('E2_REG')}>Etapa 2 · Regional</button>
        <span className="spacer" />
        {guardado && <span style={{ color: 'var(--teal-deep)', fontWeight: 700, fontSize: 12.5 }}>✓ Guardado</span>}
        <button className="btn btn-ghost btn-sm" onClick={restaurar} disabled={guardando}>Restaurar defaults</button>
        <button className="btn btn-sm" onClick={guardar} disabled={guardando || (seccion === 'E1' && sumaE1 !== 100) || (seccion === 'E2' && sumaE2 !== 100)}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
      {error && (
        <div className="card" style={{ padding: '10px 14px', marginBottom: 14, background: '#fde8e8', color: '#c0392b', fontSize: 12.5 }}>
          ⚠ {error}
        </div>
      )}

      {seccion === 'E1' && (
        <PesosRubros
          titulo="Etapa 1 — Pesos por rubro"
          pesos={cfg.E1.pesos}
          suma={sumaE1}
          onChange={(rubro, val) => update((n) => { n.E1.pesos[rubro] = val })}
          extra={<ReglasE1 reglas={cfg.E1.reglas} update={update} />}
        />
      )}

      {seccion === 'E2' && (
        <PesosRubros
          titulo="Etapa 2 — Pesos por rubro"
          pesos={cfg.E2.pesos}
          suma={sumaE2}
          onChange={(rubro, val) => update((n) => { n.E2.pesos[rubro] = val })}
          extra={<ReglasE2 reglas={cfg.E2.reglas} update={update} />}
        />
      )}

      {seccion === 'E1_REG' && (
        <PesosRegionales
          titulo="Etapa 1 — Ranking Regional"
          data={cfg.E1_REG}
          regLabels={regLabels}
          onRegion={(reg, region, val) => update((n) => { n.E1_REG[reg].regionPesos[region] = val })}
          onPais={(reg, pais, val) => update((n) => { n.E1_REG[reg].paisPesos[pais] = val })}
        />
      )}

      {seccion === 'E2_REG' && (
        <PesosRegionales
          titulo="Etapa 2 — Ranking Regional"
          data={cfg.E2_REG}
          regLabels={regLabels}
          onRegion={(reg, region, val) => update((n) => { n.E2_REG[reg].regionPesos[region] = val })}
          onPais={(reg, pais, val) => update((n) => { n.E2_REG[reg].paisPesos[pais] = val })}
        />
      )}
    </section>
  )
}

/* ---------- Pesos por rubro ---------- */
function PesosRubros({ titulo, pesos, suma, onChange, extra }) {
  const ok = suma === 100
  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ padding: '10px 14px', background: 'var(--teal-dark)', color: '#fff', fontWeight: 700, fontSize: 13 }}>
          {titulo}
        </div>
        <div style={{ padding: '14px 16px' }}>
          <table className="grid" style={{ maxWidth: 480 }}>
            <thead><tr><th>Rubro</th><th className="th-num" style={{ width: 140 }}>Peso (%)</th></tr></thead>
            <tbody>
              {Object.entries(pesos).map(([rubro, val]) => (
                <tr key={rubro}>
                  <td style={{ fontWeight: 600 }}>{RUBRO_LABELS[rubro] || rubro}</td>
                  <td className="td-num">
                    <input type="number" min="0" max="100" step="1" value={val}
                      onChange={(e) => onChange(rubro, clampNum(e.target.value))}
                      style={inputStyle} />
                  </td>
                </tr>
              ))}
              <tr style={{ background: ok ? 'var(--mint)' : '#fde8e8' }}>
                <td style={{ fontWeight: 800 }}>Total</td>
                <td className="td-num num" style={{ fontWeight: 800, color: ok ? 'var(--teal-deep)' : '#c0392b' }}>
                  {suma}% {ok ? '✓' : '⚠ debe sumar 100'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      {extra}
    </>
  )
}

/* ---------- Reglas Etapa 1 ---------- */
function ReglasE1({ reglas, update }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ padding: '10px 14px', background: 'var(--teal-dark)', color: '#fff', fontWeight: 700, fontSize: 13 }}>
        Etapa 1 — Reglas de puntaje
      </div>
      <div style={{ padding: '14px 16px', display: 'grid', gap: 18 }}>
        <ReglaTramos
          titulo="Días libres en destino"
          nota="Puntos según los días libres ofrecidos."
          regla={reglas.dias}
          onChange={(campo, val) => update((n) => setEnRuta(n.E1.reglas.dias, campo, val))}
        />
        <ReglaTramos
          titulo="Crédito (días)"
          nota="Puntos según los días de crédito ofrecidos."
          regla={reglas.credito}
          onChange={(campo, val) => update((n) => setEnRuta(n.E1.reglas.credito, campo, val))}
        />
        <ReglaGastos
          titulo="Gastos destino"
          regla={reglas.gastos}
          onChange={(campo, val) => update((n) => { n.E1.reglas.gastos[campo] = val })}
        />
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Herramienta de seguimiento</div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 12.5 }}>
            <label>Tiene: <input type="number" step="0.5" value={reglas.herramienta.si}
              onChange={(e) => update((n) => { n.E1.reglas.herramienta.si = clampNum(e.target.value) })} style={inputStyle} /></label>
            <label>No tiene: <input type="number" step="0.5" value={reglas.herramienta.no}
              onChange={(e) => update((n) => { n.E1.reglas.herramienta.no = clampNum(e.target.value) })} style={inputStyle} /></label>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- Reglas Etapa 2 ---------- */
function ReglasE2({ reglas, update }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ padding: '10px 14px', background: 'var(--teal-dark)', color: '#fff', fontWeight: 700, fontSize: 13 }}>
        Etapa 2 — Reglas de puntaje
      </div>
      <div style={{ padding: '14px 16px', display: 'grid', gap: 18 }}>
        <ReglaTramos
          titulo="Días libres en destino"
          nota="Puntos según los días libres ofrecidos."
          regla={reglas.dias}
          onChange={(campo, val) => update((n) => setEnRuta(n.E2.reglas.dias, campo, val))}
        />
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Crédito (días + facturación)</div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 8 }}>
            El puntaje de crédito se divide en dos partes: días de crédito y facturación al arribo.
          </div>
          <div style={{ display: 'grid', gap: 8, fontSize: 12.5 }}>
            <label>Puntos máx. por días: <input type="number" step="0.5" value={reglas.credito.creditoDiasMax}
              onChange={(e) => update((n) => { n.E2.reglas.credito.creditoDiasMax = clampNum(e.target.value) })} style={inputStyle} /></label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label>Alto ≥ <input type="number" value={reglas.credito.dias.alto.min}
                onChange={(e) => update((n) => { n.E2.reglas.credito.dias.alto.min = clampNum(e.target.value) })} style={inputStyleSm} /> días →
                <input type="number" step="0.5" value={reglas.credito.dias.alto.pts}
                  onChange={(e) => update((n) => { n.E2.reglas.credito.dias.alto.pts = clampNum(e.target.value) })} style={inputStyleSm} /> pts</label>
              <label>Medio ≥ <input type="number" value={reglas.credito.dias.medio.min}
                onChange={(e) => update((n) => { n.E2.reglas.credito.dias.medio.min = clampNum(e.target.value) })} style={inputStyleSm} /> días →
                <input type="number" step="0.5" value={reglas.credito.dias.medio.pts}
                  onChange={(e) => update((n) => { n.E2.reglas.credito.dias.medio.pts = clampNum(e.target.value) })} style={inputStyleSm} /> pts</label>
            </div>
            <label>Puntos por facturación al arribo: <input type="number" step="0.5" value={reglas.credito.facturacionArriboPts}
              onChange={(e) => update((n) => { n.E2.reglas.credito.facturacionArriboPts = clampNum(e.target.value) })} style={inputStyle} /></label>
          </div>
        </div>
        <ReglaGastos
          titulo="Gastos destino"
          regla={reglas.gastos}
          onChange={(campo, val) => update((n) => { n.E2.reglas.gastos[campo] = val })}
        />
        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
          Allocation, Gastos FOB y Representación se puntúan proporcionalmente al mejor oferente,
          escalado al peso del rubro (configurable arriba).
        </div>
      </div>
    </div>
  )
}

/* Regla de dos tramos (alto/medio) + bajo */
function ReglaTramos({ titulo, nota, regla, onChange }) {
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{titulo}</div>
      {nota && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 8 }}>{nota}</div>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12.5 }}>
        <label>Alto ≥ <input type="number" value={regla.alto.min}
          onChange={(e) => onChange('alto.min', clampNum(e.target.value))} style={inputStyleSm} /> →
          <input type="number" step="0.5" value={regla.alto.pts}
            onChange={(e) => onChange('alto.pts', clampNum(e.target.value))} style={inputStyleSm} /> pts</label>
        <label>Medio ≥ <input type="number" value={regla.medio.min}
          onChange={(e) => onChange('medio.min', clampNum(e.target.value))} style={inputStyleSm} /> →
          <input type="number" step="0.5" value={regla.medio.pts}
            onChange={(e) => onChange('medio.pts', clampNum(e.target.value))} style={inputStyleSm} /> pts</label>
        <label>Bajo → <input type="number" step="0.5" value={regla.bajo}
          onChange={(e) => onChange('bajo', clampNum(e.target.value))} style={inputStyleSm} /> pts</label>
      </div>
    </div>
  )
}

function ReglaGastos({ titulo, regla, onChange }) {
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{titulo}</div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 8 }}>
        El menor gasto de la ruta obtiene el máximo; el mayor, el mínimo; los intermedios se interpolan.
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: 12.5 }}>
        <label>Menor gasto (máx): <input type="number" step="0.5" value={regla.mejorPts}
          onChange={(e) => onChange('mejorPts', clampNum(e.target.value))} style={inputStyle} /></label>
        <label>Mayor gasto (mín): <input type="number" step="0.5" value={regla.peorPts}
          onChange={(e) => onChange('peorPts', clampNum(e.target.value))} style={inputStyle} /></label>
      </div>
    </div>
  )
}

/* ---------- Pesos regionales ---------- */
function PesosRegionales({ titulo, data, regLabels, onRegion, onPais }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ padding: '10px 14px', background: 'var(--teal-dark)', color: '#fff', fontWeight: 700, fontSize: 13 }}>
        {titulo}
      </div>
      <div style={{ padding: '14px 16px', display: 'grid', gap: 22 }}>
        {Object.entries(data).map(([reg, conf]) => {
          const sumaRegion = sumaPesos(conf.regionPesos)
          const sumaPais = sumaPesos(conf.paisPesos)
          return (
            <div key={reg}>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>Región {reg}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Pesos por región de origen</div>
                  {Object.entries(conf.regionPesos).map(([region, val]) => (
                    <div key={region} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, fontSize: 12.5 }}>
                      <span>{regLabels[region] || region}</span>
                      <input type="number" min="0" max="100" value={val}
                        onChange={(e) => onRegion(reg, region, clampNum(e.target.value))} style={inputStyle} />
                    </div>
                  ))}
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: sumaRegion === 100 ? 'var(--teal-deep)' : '#c0392b' }}>
                    Total: {sumaRegion}% {sumaRegion === 100 ? '✓' : '⚠'}
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Pesos por país destino</div>
                  {Object.entries(conf.paisPesos).map(([pais, val]) => (
                    <div key={pais} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, fontSize: 12.5 }}>
                      <span>{PAISES_MAP[pais] || pais}</span>
                      <input type="number" min="0" max="100" value={val}
                        onChange={(e) => onPais(reg, pais, clampNum(e.target.value))} style={inputStyle} />
                    </div>
                  ))}
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: sumaPais === 100 ? 'var(--teal-deep)' : '#c0392b' }}>
                    Total: {sumaPais}% {sumaPais === 100 ? '✓' : '⚠'}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- Helpers ---------- */
const inputStyle = { width: 80, padding: '4px 8px', border: '1px solid #d0d7de', borderRadius: 6, textAlign: 'right', fontSize: 12.5 }
const inputStyleSm = { width: 56, padding: '3px 6px', border: '1px solid #d0d7de', borderRadius: 6, textAlign: 'right', fontSize: 12.5, margin: '0 3px' }

function clampNum(v) {
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

// Escribe en una ruta tipo "alto.min" dentro de un objeto de regla
function setEnRuta(obj, ruta, val) {
  const partes = ruta.split('.')
  let ref = obj
  for (let i = 0; i < partes.length - 1; i++) ref = ref[partes[i]]
  ref[partes[partes.length - 1]] = val
}
