import { useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import {
  PAISES, ORIGENES, PUERTOS, RATE_FIELDS,
  REGIONES_ALLOCATION, PUERTOS_BASE_CHINA
} from '../constantsR2'
import { numOrNull } from '../utils/format'
import { descargarPlantillaR2, leerPlantillaCompletaR2 } from '../utils/excelR2'
import { useAutoSave, loadDraft, clearDraft } from '../hooks/useAutoSave'

const DRAFT_PREFIX_R2 = 'rfp_r2_draft_'

export default function FormularioR2Page() {
  const [view, setView] = useState('select')
  const [paisActual, setPaisActual] = useState(null)
  const [filas, setFilas] = useState([])
  const [oferente, setOferente] = useState('')
  const [email, setEmail] = useState('')
  const [regionCA, setRegionCA] = useState(false)
  const [regionVE, setRegionVE] = useState(false)
  const [condiciones, setCondiciones] = useState({})
  const [allocation, setAllocation] = useState({})
  const [representacion, setRepresentacion] = useState({})
  const [enviando, setEnviando] = useState(false)
  const [folio, setFolio] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [msg, setMsg] = useState(null)
  const [errors, setErrors] = useState({})
  const fileRef = useRef(null)

  const getData = useCallback(() => ({
    oferente, email, regionCA, regionVE, condiciones, filas,
    allocation, representacion
  }), [oferente, email, regionCA, regionVE, condiciones, filas, allocation, representacion])

  const { scheduleSave } = useAutoSave(paisActual ? DRAFT_PREFIX_R2 + paisActual.code : null, getData)

  function openForm(code) {
    const pais = PAISES.find((p) => p.code === code)
    if (!pais) return
    setPaisActual(pais)
    const newFilas = ORIGENES.map(([origen, region]) => ({
      origen, region, destino: pais.nombre,
      dias_libres_origen: '', dias_libres_destino: '', navieras: '',
      tiempo_transito: '', puerto_arribo: '',
      tarifa_20_std: '', tarifa_40_std: '', tarifa_40_hc: ''
    }))
    setFilas(newFilas)
    setOferente('')
    setEmail('')
    setRegionCA(false)
    setRegionVE(false)
    setCondiciones({})
    setAllocation({})
    setRepresentacion({})
    setErrors({})
    setView('form')

    // Check draft
    const draft = loadDraft(DRAFT_PREFIX_R2 + code)
    if (draft) {
      const hace = Math.round((Date.now() - draft.timestamp) / 60000)
      const tiempo = hace < 1 ? 'hace menos de un minuto' : hace < 60 ? `hace ${hace} min` : `hace ${Math.round(hace / 60)}h`
      if (window.confirm(`Se encontró un borrador R2 guardado${draft.oferente ? ` (${draft.oferente})` : ''} — ${tiempo}.\n\n¿Deseas restaurar los datos?`)) {
        setOferente(draft.oferente || '')
        setEmail(draft.email || '')
        setRegionCA(!!draft.regionCA)
        setRegionVE(!!draft.regionVE)
        setCondiciones(draft.condiciones || {})
        setAllocation(draft.allocation || {})
        setRepresentacion(draft.representacion || {})
        if (draft.filas && draft.filas.length === newFilas.length) {
          setFilas(draft.filas)
        }
      } else {
        clearDraft(DRAFT_PREFIX_R2 + code)
      }
    }
  }

  function updateFila(idx, field, value) {
    setFilas((prev) => {
      const copy = [...prev]
      copy[idx] = { ...copy[idx], [field]: value }
      return copy
    })
    scheduleSave()
  }

  function updateCond(key, value) {
    setCondiciones((prev) => ({ ...prev, [key]: value }))
    scheduleSave()
  }

  function updateAllocation(key, value) {
    setAllocation((prev) => ({ ...prev, [key]: value }))
    scheduleSave()
  }

  function updateRepre(key, value) {
    setRepresentacion((prev) => ({ ...prev, [key]: value }))
    scheduleSave()
  }

  const cotizadas = filas.filter((f) =>
    [f.tarifa_20_std, f.tarifa_40_std, f.tarifa_40_hc].some((v) => numOrNull(v) !== null && Number(v) > 0)
  ).length

  function validar() {
    const errs = {}
    if (!oferente.trim()) errs.oferente = true
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = true
    if (!regionCA && !regionVE) errs.region = true
    setErrors(errs)
    if (Object.keys(errs).length) { setMsg({ title: 'Faltan datos', body: 'Revisa los campos marcados en rojo.', error: true }); return false }
    if (cotizadas === 0) { setMsg({ title: 'Sin rutas', body: 'Ingresa al menos una tarifa.', error: true }); return false }
    return true
  }

  async function enviar() {
    if (enviando) return
    setEnviando(true)
    try {
      const regionArr = []
      if (regionCA) regionArr.push('CA')
      if (regionVE) regionArr.push('VE')

      const tarifasPayload = filas
        .filter((f) => RATE_FIELDS.some((k) => String(f[k]).trim() !== ''))
        .map((f) => ({
          origen: f.origen, region: f.region, destino: f.destino,
          dias_libres_origen: numOrNull(f.dias_libres_origen),
          dias_libres_destino: numOrNull(f.dias_libres_destino),
          navieras: f.navieras.trim() || null,
          tiempo_transito: f.tiempo_transito.trim() || null,
          puerto_arribo: f.puerto_arribo.trim() || null,
          tarifa_20_std: numOrNull(f.tarifa_20_std),
          tarifa_40_std: numOrNull(f.tarifa_40_std),
          tarifa_40_hc: numOrNull(f.tarifa_40_hc)
        }))

      const payload = {
        ronda: 2,
        pais: paisActual.code,
        oferente: oferente.trim(),
        email_contacto: email.trim() || null,
        region: regionArr,
        vigencia_del: condiciones.vigencia_del || null,
        vigencia_al: condiciones.vigencia_al || null,
        tarifas_incluyen: condiciones.tarifas_incluyen?.trim() || null,
        tarifas_no_incluyen: condiciones.tarifas_no_incluyen?.trim() || null,
        observaciones: condiciones.observaciones?.trim() || null,
        gasto_impresion_bl: numOrNull(condiciones.g_impresion_bl),
        gasto_retiro_vacio: numOrNull(condiciones.g_retiro_vacio),
        gasto_demora_contenedor_dia: numOrNull(condiciones.g_demora_contenedor),
        gasto_demora_chasis_dia: numOrNull(condiciones.g_demora_chasis),
        gasto_chasis_3_ejes: numOrNull(condiciones.g_chasis_3_ejes),
        gasto_estadias: numOrNull(condiciones.g_estadias),
        allocation_america: numOrNull(allocation.america),
        allocation_europa: numOrNull(allocation.europa),
        allocation_asia_pb: numOrNull(allocation.asia_puertos_base),
        allocation_asia_restante: numOrNull(allocation.asia_restante),
        representacion: representacion,
        tarifas: tarifasPayload
      }

      const { data, error } = await supabase.rpc('submit_rfp_r2', { p: payload })
      if (error) throw error
      setFolio(String(data).slice(0, 8).toUpperCase())
      clearDraft(DRAFT_PREFIX_R2 + paisActual.code)
      setShowConfirm(false)
      setView('success')
    } catch (err) {
      setMsg({ title: 'Error al enviar', body: err.message || 'Inténtalo de nuevo.', error: true })
    } finally {
      setEnviando(false)
    }
  }

  async function handleCargarExcel(e) {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    try {
      const { tarifas: rows } = await leerPlantillaCompletaR2(file)
      let count = 0
      setFilas((prev) => {
        const copy = [...prev]
        for (const row of rows) {
          const idx = copy.findIndex((f) => f.origen.toLowerCase() === row.origen.toLowerCase())
          if (idx < 0) continue
          if (row.dias_libres_origen) copy[idx].dias_libres_origen = row.dias_libres_origen
          if (row.dias_libres_destino) copy[idx].dias_libres_destino = row.dias_libres_destino
          if (row.navieras) copy[idx].navieras = row.navieras
          if (row.tiempo_transito) copy[idx].tiempo_transito = row.tiempo_transito
          if (row.puerto_arribo) copy[idx].puerto_arribo = row.puerto_arribo
          if (row.tarifa_20_std) copy[idx].tarifa_20_std = row.tarifa_20_std
          if (row.tarifa_40_std) copy[idx].tarifa_40_std = row.tarifa_40_std
          if (row.tarifa_40_hc) copy[idx].tarifa_40_hc = row.tarifa_40_hc
          count++
        }
        return copy
      })
      scheduleSave()
      setMsg({ title: 'Plantilla cargada', body: `Se importaron datos de ${count} rutas.`, error: false })
    } catch (err) {
      setMsg({ title: 'Error', body: err.message, error: true })
    }
  }

  // --- VIEWS ---
  if (view === 'select') return (
    <div className="wrap">
      <section className="doc">
        <div className="banner with-admin">
          <h1>Matriz de Tarifas Marítimas — Ronda 2</h1>
          <a className="btn-admin" href="/admin">Admin</a>
        </div>
        <div className="subbar">
          <span>Request For Proposal 2026-2027 · <strong>Segunda Ronda</strong></span>
          <span className="anexo">Anexo B</span>
        </div>
        <div className="r2-badge-bar">
          <span className="r2-badge">ETAPA 2</span>
          <Link to="/" className="btn btn-ghost btn-sm">← Ir a Etapa 1</Link>
        </div>
        <div className="intro">
          <h2>Selecciona el formulario que vas a completar</h2>
          <p>Cada formulario contiene las 54 rutas de origen, condiciones comerciales, allocation, gastos FOB y representación.</p>
        </div>
        <div className="country-grid">
          {PAISES.map((p) => (
            <button key={p.code} type="button" className="country-card" onClick={() => openForm(p.code)}>
              <span className="code">{p.code}</span>
              <span>
                <div className="t">Marítimos {p.code} — R2</div>
                <div className="s">{p.nombre} · {ORIGENES.length} rutas de origen</div>
              </span>
            </button>
          ))}
        </div>
        <div style={{ padding: '0 28px 28px' }}>
          <Link to="/ronda2/condiciones-operativas" className="country-card" style={{ textDecoration: 'none', borderLeftColor: '#F2B33D' }}>
            <span className="code" style={{ background: '#8A5A00' }}>CO</span>
            <span>
              <div className="t">Condiciones Operativas</div>
              <div className="s">Crédito, FOB, Representación · Una vez por oferente</div>
            </span>
          </Link>
        </div>
      </section>
    </div>
  )

  if (view === 'success') return (
    <div className="wrap">
      <section className="doc">
        <div className="success">
          <div className="check" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <path d="M4 12.5l5 5L20 6.5" stroke="#007A63" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2>Respuesta Ronda 2 enviada</h2>
          <p>{oferente} · {paisActual?.nombre} · {cotizadas} rutas cotizadas</p>
          <div className="folio">Folio {folio}</div>
          <button type="button" className="btn btn-primary" onClick={() => setView('select')}>Completar otro formulario</button>
        </div>
      </section>
    </div>
  )

  // --- FORM VIEW ---
  return (
    <div className="wrap">
      <section className="doc">
        <div className="banner">
          <h1>Tarifas Marítimas — {paisActual?.nombre} (Ronda 2)</h1>
        </div>
        <div className="subbar">
          <span>RFP 2026-2027 · Segunda Ronda · {paisActual?.code}</span>
          <span className="r2-badge">ETAPA 2</span>
        </div>

        {/* Back */}
        <div style={{ padding: '12px 28px 0' }}>
          <button type="button" className="back-link" onClick={() => setView('select')}>
            ← Volver a selección
          </button>
        </div>

        {/* Oferente block */}
        <div className="oferente-block">
          <div className={`field ${errors.oferente ? 'invalid' : ''}`}>
            <label>Oferente <span className="opt">(nombre empresa)</span></label>
            <input value={oferente} onChange={(e) => { setOferente(e.target.value); scheduleSave() }} placeholder="Nombre del oferente" />
            <div className="hint">Campo obligatorio</div>
          </div>
          <div className={`field ${errors.email ? 'invalid' : ''}`}>
            <label>Correo de contacto <span className="opt">(opcional)</span></label>
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); scheduleSave() }} placeholder="correo@empresa.com" />
            <div className="hint">Formato de correo inválido</div>
          </div>
          <div className={`field ${errors.region ? 'invalid' : ''}`}>
            <label>Región de participación</label>
            <div className="checkbox-group">
              <label className="cb-label"><input type="checkbox" checked={regionCA} onChange={(e) => { setRegionCA(e.target.checked); scheduleSave() }} /> CA</label>
              <label className="cb-label"><input type="checkbox" checked={regionVE} onChange={(e) => { setRegionVE(e.target.checked); scheduleSave() }} /> VE</label>
            </div>
            <div className="hint">Selecciona al menos una región</div>
          </div>
        </div>

        {/* Carga masiva + descarga */}
        <div className="section-head">
          <h3>Matriz de Tarifas</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => descargarPlantillaR2(paisActual)}>
              Descargar plantilla R2
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()}>
              Cargar Excel
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={handleCargarExcel} />
          </div>
        </div>
        <span className="count-note" style={{ padding: '0 28px' }}>{cotizadas} de {ORIGENES.length} rutas cotizadas</span>

        {/* Tabla de tarifas */}
        <div className="table-scroll" style={{ margin: '0 0 0', maxHeight: 520 }}>
          <table className="matriz">
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Origen</th>
                <th>Región</th>
                <th>Destino</th>
                <th className="num">Días Libres{'\n'}Origen</th>
                <th className="num">Días Libres{'\n'}Destino</th>
                <th>Naviera(s)</th>
                <th>Tiempo{'\n'}tránsito</th>
                <th>Puerto{'\n'}Arribo</th>
                <th className="num">20" STD{'\n'}(USD)</th>
                <th className="num">40" STD{'\n'}(USD)</th>
                <th className="num">40" HC{'\n'}(USD)</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i}>
                  <td className="fix">{f.origen} <span className="region">{f.region}</span></td>
                  <td className="fix">{f.region}</td>
                  <td className="fix">{f.destino}</td>
                  <td className="num"><input type="number" min="0" value={f.dias_libres_origen} onChange={(e) => updateFila(i, 'dias_libres_origen', e.target.value)} /></td>
                  <td className="num"><input type="number" min="0" value={f.dias_libres_destino} onChange={(e) => updateFila(i, 'dias_libres_destino', e.target.value)} /></td>
                  <td><input value={f.navieras} onChange={(e) => updateFila(i, 'navieras', e.target.value)} placeholder="—" /></td>
                  <td><input value={f.tiempo_transito} onChange={(e) => updateFila(i, 'tiempo_transito', e.target.value)} placeholder="—" /></td>
                  <td>
                    <select value={f.puerto_arribo} onChange={(e) => updateFila(i, 'puerto_arribo', e.target.value)}>
                      <option value="">—</option>
                      {PUERTOS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </td>
                  <td className="num"><input type="number" min="0" step="0.01" value={f.tarifa_20_std} onChange={(e) => updateFila(i, 'tarifa_20_std', e.target.value)} placeholder="0.00" /></td>
                  <td className="num"><input type="number" min="0" step="0.01" value={f.tarifa_40_std} onChange={(e) => updateFila(i, 'tarifa_40_std', e.target.value)} placeholder="0.00" /></td>
                  <td className="num"><input type="number" min="0" step="0.01" value={f.tarifa_40_hc} onChange={(e) => updateFila(i, 'tarifa_40_hc', e.target.value)} placeholder="0.00" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* CONDICIONES COMERCIALES */}
        <div className="cond-bar">Condiciones Comerciales</div>
        <div className="cond-grid">
          <div className="cond-row"><div className="lbl">Vigencia</div><div className="val" style={{ display: 'flex', gap: 8 }}>
            <input type="date" value={condiciones.vigencia_del || ''} onChange={(e) => updateCond('vigencia_del', e.target.value)} />
            <span style={{ alignSelf: 'center' }}>al</span>
            <input type="date" value={condiciones.vigencia_al || ''} onChange={(e) => updateCond('vigencia_al', e.target.value)} />
          </div></div>
          <div className="cond-row"><div className="lbl">Las tarifas incluyen</div><div className="val"><textarea value={condiciones.tarifas_incluyen || ''} onChange={(e) => updateCond('tarifas_incluyen', e.target.value)} /></div></div>
          <div className="cond-row"><div className="lbl">Las tarifas NO incluyen</div><div className="val"><textarea value={condiciones.tarifas_no_incluyen || ''} onChange={(e) => updateCond('tarifas_no_incluyen', e.target.value)} /></div></div>
          <div className="cond-row"><div className="lbl">Observaciones</div><div className="val"><textarea value={condiciones.observaciones || ''} onChange={(e) => updateCond('observaciones', e.target.value)} /></div></div>
        </div>

        {/* GASTOS EN DESTINO */}
        <div className="cond-bar">Gastos en Destino (USD)</div>
        <div className="cond-grid">
          <div className="cond-row"><div className="lbl">Impresión de BL</div><div className="val"><div className="money"><span className="cur">$</span><input type="number" min="0" step="0.01" value={condiciones.g_impresion_bl || ''} onChange={(e) => updateCond('g_impresion_bl', e.target.value)} /></div></div></div>
          <div className="cond-row"><div className="lbl">Retiro de vacío</div><div className="val"><div className="money"><span className="cur">$</span><input type="number" min="0" step="0.01" value={condiciones.g_retiro_vacio || ''} onChange={(e) => updateCond('g_retiro_vacio', e.target.value)} /></div></div></div>
          <div className="cond-row"><div className="lbl">Demoras contenedor por día</div><div className="val"><div className="money"><span className="cur">$</span><input type="number" min="0" step="0.01" value={condiciones.g_demora_contenedor || ''} onChange={(e) => updateCond('g_demora_contenedor', e.target.value)} /></div></div></div>
          <div className="cond-row"><div className="lbl">Demoras chasis por día</div><div className="val"><div className="money"><span className="cur">$</span><input type="number" min="0" step="0.01" value={condiciones.g_demora_chasis || ''} onChange={(e) => updateCond('g_demora_chasis', e.target.value)} /></div></div></div>
          <div className="cond-row"><div className="lbl">Chasis 3 ejes</div><div className="val"><div className="money"><span className="cur">$</span><input type="number" min="0" step="0.01" value={condiciones.g_chasis_3_ejes || ''} onChange={(e) => updateCond('g_chasis_3_ejes', e.target.value)} /></div></div></div>
          <div className="cond-row"><div className="lbl">Estadías</div><div className="val"><div className="money"><span className="cur">$</span><input type="number" min="0" step="0.01" value={condiciones.g_estadias || ''} onChange={(e) => updateCond('g_estadias', e.target.value)} /></div></div></div>
        </div>

        {/* ALLOCATION */}
        <div className="cond-bar">Allocation Total Mensual por Región (en TEUS)</div>
        <div className="cond-grid">
          {REGIONES_ALLOCATION.map((reg) => (
            <div key={reg.key} className="cond-row">
              <div className="lbl">{reg.label}</div>
              <div className="val"><input type="number" min="0" value={allocation[reg.key] || ''} onChange={(e) => updateAllocation(reg.key, e.target.value)} placeholder="0" /></div>
            </div>
          ))}
        </div>

        {/* REPRESENTACIÓN / OFICINAS */}
        <div className="cond-bar">Representación / Oficinas (propias)</div>
        <div className="cond-grid">
          <div className="cond-row">
            <div className="lbl">Puertos Base China</div>
            <div className="val">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 20px' }}>
                {PUERTOS_BASE_CHINA.map((p) => (
                  <label key={p} className="cb-label">
                    <input
                      type="checkbox"
                      checked={!!representacion[`china_${p.toLowerCase()}`]}
                      onChange={(e) => updateRepre(`china_${p.toLowerCase()}`, e.target.checked)}
                    />
                    {p}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="cond-row">
            <div className="lbl">Destino ({paisActual?.nombre})</div>
            <div className="val">
              <label className="cb-label">
                <input
                  type="checkbox"
                  checked={!!representacion.destino}
                  onChange={(e) => updateRepre('destino', e.target.checked)}
                />
                Sí, tiene oficina propia en destino
              </label>
            </div>
          </div>
        </div>

        {/* Link a Condiciones Operativas */}
        <div style={{ margin: '22px 28px', padding: '14px 18px', background: 'var(--amber-bg)', border: '1px solid var(--amber-line)', borderRadius: 'var(--radius)' }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: '#8A5A00', marginBottom: 4 }}>
            Condiciones Operativas, Crédito/Facturación y Gastos FOB
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
            Estas secciones se completan una única vez por oferente en un formulario aparte.
          </div>
          <Link to="/ronda2/condiciones-operativas" className="btn btn-ghost btn-sm">
            Ir a completar Condiciones Operativas →
          </Link>
        </div>

      </section>

      {/* Actions bar */}
      <div className="actions">
        <div className="inner">
          <div className="progress-pill"><span className="dot" />{cotizadas} / {ORIGENES.length} rutas</div>
          <span className="r2-badge" style={{ margin: '0 8px' }}>ETAPA 2</span>
          <span className="usd-note">Tarifas en USD · FOB en CNY</span>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={() => setView('select')}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={enviando} onClick={() => { if (validar()) setShowConfirm(true) }}>
            {enviando ? 'Enviando…' : 'Enviar respuesta'}
          </button>
        </div>
      </div>

      {/* Confirm modal */}
      {showConfirm && (
        <div className="overlay open" onClick={() => setShowConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="m-head">Confirmar envío — Ronda 2</div>
            <div className="m-body">
              <p>¿Estás seguro de enviar esta respuesta?</p>
              <div className="resumen">
                <div><span>Oferente</span><b>{oferente}</b></div>
                <div><span>País</span><b>{paisActual?.nombre}</b></div>
                <div><span>Rutas cotizadas</span><b>{cotizadas} / {ORIGENES.length}</b></div>
                <div><span>Región</span><b>{[regionCA && 'CA', regionVE && 'VE'].filter(Boolean).join(', ')}</b></div>
              </div>
            </div>
            <div className="m-foot">
              <button type="button" className="btn btn-ghost" onClick={() => setShowConfirm(false)}>Cancelar</button>
              <button type="button" className="btn btn-primary" disabled={enviando} onClick={enviar}>
                {enviando ? 'Enviando…' : 'Confirmar envío'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message modal */}
      {msg && (
        <div className="overlay open" onClick={() => setMsg(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className={`m-head ${msg.error ? 'err' : ''}`}>{msg.title}</div>
            <div className="m-body"><p>{msg.body}</p></div>
            <div className="m-foot"><button type="button" className="btn btn-primary" onClick={() => setMsg(null)}>Cerrar</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
