import { useState, useCallback, useRef } from 'react'
import { supabase } from '../supabase'
import { PAISES, ORIGENES, PUERTOS, RATE_FIELDS } from '../constants'
import { numOrNull } from '../utils/format'
import { descargarPlantilla, leerPlantilla } from '../utils/excel'
import { useAutoSave, loadDraft, clearDraft } from '../hooks/useAutoSave'

export default function FormularioPage() {
  const [view, setView] = useState('select') // select | form | success
  const [paisActual, setPaisActual] = useState(null)
  const [filas, setFilas] = useState([])
  const [oferente, setOferente] = useState('')
  const [email, setEmail] = useState('')
  const [regionCA, setRegionCA] = useState(false)
  const [regionVE, setRegionVE] = useState(false)
  const [condiciones, setCondiciones] = useState({})
  const [enviando, setEnviando] = useState(false)
  const [folio, setFolio] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [msg, setMsg] = useState(null)
  const [errors, setErrors] = useState({})
  const fileRef = useRef(null)

  const getData = useCallback(() => ({
    oferente, email, regionCA, regionVE, condiciones, filas
  }), [oferente, email, regionCA, regionVE, condiciones, filas])

  const { scheduleSave } = useAutoSave(paisActual?.code, getData)

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
    setErrors({})
    setView('form')

    // Check draft
    const draft = loadDraft(code)
    if (draft) {
      const hace = Math.round((Date.now() - draft.timestamp) / 60000)
      const tiempo = hace < 1 ? 'hace menos de un minuto' : hace < 60 ? `hace ${hace} min` : `hace ${Math.round(hace / 60)}h`
      if (window.confirm(`Se encontró un borrador guardado${draft.oferente ? ` (${draft.oferente})` : ''} — ${tiempo}.\n\n¿Deseas restaurar los datos?`)) {
        setOferente(draft.oferente || '')
        setEmail(draft.email || '')
        setRegionCA(!!draft.regionCA)
        setRegionVE(!!draft.regionVE)
        setCondiciones(draft.condiciones || {})
        if (draft.filas && draft.filas.length === newFilas.length) {
          setFilas(draft.filas)
        }
      } else {
        clearDraft(code)
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
        pais: paisActual.code,
        oferente: oferente.trim(),
        email_contacto: email.trim() || null,
        region: regionArr,
        vigencia_del: condiciones.vigencia_del || null,
        vigencia_al: condiciones.vigencia_al || null,
        tarifas_incluyen: condiciones.tarifas_incluyen?.trim() || null,
        tarifas_no_incluyen: condiciones.tarifas_no_incluyen?.trim() || null,
        herramienta_seguimiento: condiciones.herramienta_seguimiento?.trim() || null,
        credito_dias: numOrNull(condiciones.credito_dias),
        observaciones: condiciones.observaciones?.trim() || null,
        gasto_impresion_bl: numOrNull(condiciones.g_impresion_bl),
        gasto_retiro_vacio: numOrNull(condiciones.g_retiro_vacio),
        gasto_demora_contenedor_dia: numOrNull(condiciones.g_demora_contenedor),
        gasto_demora_chasis_dia: numOrNull(condiciones.g_demora_chasis),
        gasto_chasis_3_ejes: numOrNull(condiciones.g_chasis_3_ejes),
        gasto_estadias: numOrNull(condiciones.g_estadias),
        tarifas: tarifasPayload
      }

      const { data, error } = await supabase.rpc('submit_rfp', { p: payload })
      if (error) throw error
      setFolio(String(data).slice(0, 8).toUpperCase())
      clearDraft(paisActual.code)
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
      const rows = await leerPlantilla(file)
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
          <h1>Matriz de Tarifas Marítimas</h1>
          <a className="btn-admin" href="/admin">Admin</a>
        </div>
        <div className="subbar"><span>Request For Proposal 2026-2027</span><span className="anexo">Anexo B</span></div>
        <div className="intro">
          <h2>Selecciona el formulario que vas a completar</h2>
          <p>Cada formulario contiene las 54 rutas de origen y las condiciones comerciales del país de destino.</p>
        </div>
        <div className="country-grid">
          {PAISES.map((p) => (
            <button key={p.code} type="button" className="country-card" onClick={() => openForm(p.code)}>
              <span className="code">{p.code}</span>
              <span>
                <div className="t">Marítimos {p.code}</div>
                <div className="s">{p.nombre} · {ORIGENES.length} rutas de origen</div>
              </span>
            </button>
          ))}
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
          <h2>Respuesta enviada</h2>
          <p>{oferente} · {paisActual?.nombre} · {cotizadas} rutas cotizadas</p>
          <div className="folio">Folio {folio}</div>
          <button type="button" className="btn btn-primary" onClick={() => setView('select')}>Completar otro formulario</button>
        </div>
      </section>
    </div>
  )

  // form view
  return (
    <div className="wrap">
      <button type="button" className="back-link" onClick={() => setView('select')}>← Elegir otro país</button>
      <section className="doc">
        <div className="banner"><h1>Tarifas Marítimas — {paisActual?.nombre}</h1></div>
        <div className="subbar"><span>Request For Proposal 2026-2027</span><span className="anexo">Anexo B · Matriz de Tarifas</span></div>

        <div className="oferente-block">
          <div className={`field ${errors.oferente ? 'invalid' : ''}`}>
            <label>Oferente *</label>
            <input value={oferente} onChange={(e) => { setOferente(e.target.value); scheduleSave() }} placeholder="Nombre de la empresa" />
            <div className="hint">Escribe el nombre del oferente.</div>
          </div>
          <div className={`field ${errors.email ? 'invalid' : ''}`}>
            <label>Correo de contacto <span className="opt">(opcional)</span></label>
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); scheduleSave() }} placeholder="contacto@empresa.com" />
            <div className="hint">Revisa el formato del correo.</div>
          </div>
          <div className={`field ${errors.region ? 'invalid' : ''}`}>
            <label>Región *</label>
            <div className="checkbox-group">
              <label className="cb-label"><input type="checkbox" checked={regionCA} onChange={(e) => { setRegionCA(e.target.checked); scheduleSave() }} /> CA</label>
              <label className="cb-label"><input type="checkbox" checked={regionVE} onChange={(e) => { setRegionVE(e.target.checked); scheduleSave() }} /> VE</label>
            </div>
            <div className="hint">Selecciona al menos una región.</div>
          </div>
        </div>

        <div className="section-head">
          <h3>Tarifas por ruta</h3>
          <span className="note">Completa solo las rutas que cotizas · Tarifas en USD</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-ghost" style={{ fontSize: 13, padding: '7px 12px' }} onClick={() => descargarPlantilla(paisActual)}>📥 Descargar plantilla</button>
          <label className="btn btn-ghost" style={{ fontSize: 13, padding: '7px 12px', cursor: 'pointer' }}>
            📤 Cargar Excel
            <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={handleCargarExcel} />
          </label>
        </div>

        <div className="table-scroll" tabIndex={0}>
          <table className="matriz">
            <thead>
              <tr>
                <th>Origen</th><th>Región</th><th>Destino</th>
                <th className="num">Días Libres Origen</th><th className="num">Días Libres Destino</th>
                <th>Naviera(s)</th><th>Tiempo tránsito</th><th>Puerto Arribo</th>
                <th className="num">20" STD</th><th className="num">40" STD</th><th className="num">40" HC</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i}>
                  <td className="fix">{f.origen}</td>
                  <td className="fix"><span className="region">{f.region}</span></td>
                  <td className="fix">{f.destino}</td>
                  <td className="num"><input type="number" min="0" step="1" value={f.dias_libres_origen} onChange={(e) => updateFila(i, 'dias_libres_origen', e.target.value)} /></td>
                  <td className="num"><input type="number" min="0" step="1" value={f.dias_libres_destino} onChange={(e) => updateFila(i, 'dias_libres_destino', e.target.value)} /></td>
                  <td><input type="text" value={f.navieras} onChange={(e) => updateFila(i, 'navieras', e.target.value)} /></td>
                  <td><input type="text" placeholder="p.ej. 28 días" value={f.tiempo_transito} onChange={(e) => updateFila(i, 'tiempo_transito', e.target.value)} /></td>
                  <td>
                    <select value={f.puerto_arribo} onChange={(e) => updateFila(i, 'puerto_arribo', e.target.value)}>
                      <option value="">— Seleccionar —</option>
                      {PUERTOS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </td>
                  <td className="num"><input type="number" min="0" step="0.01" placeholder="0.00" value={f.tarifa_20_std} onChange={(e) => updateFila(i, 'tarifa_20_std', e.target.value)} /></td>
                  <td className="num"><input type="number" min="0" step="0.01" placeholder="0.00" value={f.tarifa_40_std} onChange={(e) => updateFila(i, 'tarifa_40_std', e.target.value)} /></td>
                  <td className="num"><input type="number" min="0" step="0.01" placeholder="0.00" value={f.tarifa_40_hc} onChange={(e) => updateFila(i, 'tarifa_40_hc', e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="cond-bar">Condiciones Comerciales</div>
        <div className="cond-grid">
          <CondRow label="Vigencia del"><input type="date" value={condiciones.vigencia_del || ''} onChange={(e) => updateCond('vigencia_del', e.target.value)} /></CondRow>
          <CondRow label="Vigencia al"><input type="date" value={condiciones.vigencia_al || ''} onChange={(e) => updateCond('vigencia_al', e.target.value)} /></CondRow>
          <CondRow label="Las tarifas incluyen"><textarea rows="2" value={condiciones.tarifas_incluyen || ''} onChange={(e) => updateCond('tarifas_incluyen', e.target.value)} /></CondRow>
          <CondRow label="Las tarifas NO incluyen"><textarea rows="2" value={condiciones.tarifas_no_incluyen || ''} onChange={(e) => updateCond('tarifas_no_incluyen', e.target.value)} /></CondRow>
          <CondRow label="Herramienta seguimiento"><input type="text" value={condiciones.herramienta_seguimiento || ''} onChange={(e) => updateCond('herramienta_seguimiento', e.target.value)} /></CondRow>
          <CondRow label="Crédito (días)"><input type="number" min="0" step="1" style={{ width: 160 }} value={condiciones.credito_dias || ''} onChange={(e) => updateCond('credito_dias', e.target.value)} /></CondRow>
          <CondRow label="Observaciones"><textarea rows="2" value={condiciones.observaciones || ''} onChange={(e) => updateCond('observaciones', e.target.value)} /></CondRow>
        </div>
        <div className="cond-sub">Gastos en destino</div>
        <div className="cond-grid" style={{ marginBottom: 26 }}>
          <GastoRow label="Impresión de BL" field="g_impresion_bl" condiciones={condiciones} updateCond={updateCond} />
          <GastoRow label="Retiro de vacío" field="g_retiro_vacio" condiciones={condiciones} updateCond={updateCond} />
          <GastoRow label="Demoras contenedor por día" field="g_demora_contenedor" condiciones={condiciones} updateCond={updateCond} />
          <GastoRow label="Demoras chasis por día" field="g_demora_chasis" condiciones={condiciones} updateCond={updateCond} />
          <GastoRow label="Chasis 3 ejes" field="g_chasis_3_ejes" condiciones={condiciones} updateCond={updateCond} />
          <GastoRow label="Estadias" field="g_estadias" condiciones={condiciones} updateCond={updateCond} />
        </div>
      </section>

      {/* Actions bar */}
      <div className="actions">
        <div className="inner">
          <span className="progress-pill"><span className="dot" /><span>{cotizadas} / {ORIGENES.length} rutas cotizadas</span></span>
          <span className="usd-note">Todas las tarifas se expresan en USD.</span>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={() => setView('select')}>Volver</button>
          <button type="button" className="btn btn-primary" onClick={() => { if (validar()) setShowConfirm(true) }}>Guardar y enviar respuesta</button>
        </div>
      </div>

      {/* Confirm modal */}
      {showConfirm && (
        <div className="overlay open">
          <div className="modal">
            <div className="m-head">Enviar respuesta</div>
            <div className="m-body">
              Revisa el resumen antes de enviar.
              <div className="resumen">
                <div><span>País</span><b>{paisActual.nombre} ({paisActual.code})</b></div>
                <div><span>Oferente</span><b>{oferente}</b></div>
                <div><span>Región</span><b>{[regionCA && 'CA', regionVE && 'VE'].filter(Boolean).join(', ')}</b></div>
                <div><span>Rutas cotizadas</span><b>{cotizadas}</b></div>
              </div>
            </div>
            <div className="m-foot">
              <button type="button" className="btn btn-ghost" onClick={() => setShowConfirm(false)}>Seguir editando</button>
              <button type="button" className="btn btn-primary" disabled={enviando} onClick={enviar}>{enviando ? 'Enviando…' : 'Enviar respuesta'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Msg modal */}
      {msg && (
        <div className="overlay open">
          <div className="modal">
            <div className={`m-head ${msg.error ? 'err' : ''}`}>{msg.title}</div>
            <div className="m-body"><p>{msg.body}</p></div>
            <div className="m-foot"><button type="button" className="btn btn-primary" onClick={() => setMsg(null)}>Entendido</button></div>
          </div>
        </div>
      )}
    </div>
  )
}

function CondRow({ label, children }) {
  return (
    <div className="cond-row">
      <div className="lbl">{label}</div>
      <div className="val">{children}</div>
    </div>
  )
}

function GastoRow({ label, field, condiciones, updateCond }) {
  return (
    <div className="cond-row">
      <div className="lbl">{label}</div>
      <div className="val">
        <div className="money">
          <span className="cur">USD</span>
          <input type="number" min="0" step="0.01" value={condiciones[field] || ''} onChange={(e) => updateCond(field, e.target.value)} />
        </div>
      </div>
    </div>
  )
}
