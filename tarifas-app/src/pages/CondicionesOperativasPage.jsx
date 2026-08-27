import { useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { PUERTOS_BASE_CHINA, CARGOS_FOB, CONTENEDORES_FOB, FACTURACION_OPCIONES } from '../constantsR2'
import { numOrNull } from '../utils/format'
import { descargarPlantillaFobR2, leerGastosFobR2 } from '../utils/excelR2'
import { useAutoSave, loadDraft, clearDraft } from '../hooks/useAutoSave'

const DRAFT_KEY = 'r2_condop'

export default function CondicionesOperativasPage() {
  const [view, setView] = useState('form') // form | success
  const [oferente, setOferente] = useState('')
  const [email, setEmail] = useState('')
  const [regionCA, setRegionCA] = useState(false)
  const [regionVE, setRegionVE] = useState(false)
  const [condiciones, setCondiciones] = useState({})
  const [gastosFob, setGastosFob] = useState({})
  const [facturacion, setFacturacion] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [folio, setFolio] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [msg, setMsg] = useState(null)
  const [errors, setErrors] = useState({})
  const fobFileRef = useRef(null)

  const getData = useCallback(() => ({
    oferente, email, regionCA, regionVE, condiciones, gastosFob, facturacion
  }), [oferente, email, regionCA, regionVE, condiciones, gastosFob, facturacion])

  const { scheduleSave } = useAutoSave(DRAFT_KEY, getData)

  // Restaurar borrador al montar
  useState(() => {
    const draft = loadDraft(DRAFT_KEY)
    if (draft) {
      const hace = Math.round((Date.now() - draft.timestamp) / 60000)
      const tiempo = hace < 1 ? 'hace menos de un minuto' : hace < 60 ? `hace ${hace} min` : `hace ${Math.round(hace / 60)}h`
      if (window.confirm(`Se encontró un borrador de Condiciones Operativas${draft.oferente ? ` (${draft.oferente})` : ''} — ${tiempo}.\n\n¿Deseas restaurar los datos?`)) {
        setOferente(draft.oferente || '')
        setEmail(draft.email || '')
        setRegionCA(!!draft.regionCA)
        setRegionVE(!!draft.regionVE)
        setCondiciones(draft.condiciones || {})
        setGastosFob(draft.gastosFob || {})
        setFacturacion(draft.facturacion || '')
      } else {
        clearDraft(DRAFT_KEY)
      }
    }
  })

  function updateCond(key, value) {
    setCondiciones((prev) => ({ ...prev, [key]: value }))
    scheduleSave()
  }

  function updateFob(puerto, cargoKey, contenedor, value) {
    setGastosFob((prev) => {
      const copy = { ...prev }
      if (!copy[puerto]) copy[puerto] = {}
      if (!copy[puerto][cargoKey]) copy[puerto][cargoKey] = {}
      copy[puerto][cargoKey][contenedor] = value
      return copy
    })
    scheduleSave()
  }

  async function handleCargarFob(e) {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    try {
      const fobImport = await leerGastosFobR2(file)
      if (!fobImport) {
        setMsg({ title: 'Sin datos', body: 'No se encontró la hoja "Gastos FOB" o está vacía.', error: true })
        return
      }
      setGastosFob(fobImport)
      scheduleSave()
      const nPuertos = Object.keys(fobImport).length
      setMsg({ title: 'Gastos FOB cargados', body: `Se importaron datos de ${nPuertos} puerto(s) base.`, error: false })
    } catch (err) {
      setMsg({ title: 'Error', body: err.message, error: true })
    }
  }

  function validar() {
    const errs = {}
    if (!oferente.trim()) errs.oferente = true
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = true
    if (!regionCA && !regionVE) errs.region = true
    setErrors(errs)
    if (Object.keys(errs).length) {
      setMsg({ title: 'Faltan datos', body: 'Revisa los campos marcados en rojo.', error: true })
      return false
    }
    return true
  }

  async function enviar() {
    if (enviando) return
    setEnviando(true)
    try {
      const regionArr = []
      if (regionCA) regionArr.push('CA')
      if (regionVE) regionArr.push('VE')

      const payload = {
        oferente: oferente.trim(),
        email_contacto: email.trim() || null,
        region: regionArr,
        credito_dias: numOrNull(condiciones.credito_dias),
        facturacion_aplica: facturacion || null,
        herramienta_seguimiento: condiciones.herramienta_seguimiento?.trim() || null,
        herramienta_descripcion: condiciones.herramienta_descripcion?.trim() || null,
        integracion_api: condiciones.integracion_api?.trim() || null,
        recursos_operativos: condiciones.recursos_operativos?.trim() || null,
        gastos_fob: gastosFob,
        obs_fob: condiciones.obs_fob?.trim() || null
      }

      const { data, error } = await supabase.rpc('submit_condiciones_operativas_r2', { p: payload })
      if (error) throw error
      setFolio(String(data).slice(0, 8).toUpperCase())
      clearDraft(DRAFT_KEY)
      setShowConfirm(false)
      setView('success')
    } catch (err) {
      setMsg({ title: 'Error al enviar', body: err.message || 'Inténtalo de nuevo.', error: true })
    } finally {
      setEnviando(false)
    }
  }

  // --- SUCCESS ---
  if (view === 'success') return (
    <div className="wrap">
      <section className="doc">
        <div className="success">
          <div className="check" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <path d="M4 12.5l5 5L20 6.5" stroke="#007A63" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2>Condiciones Operativas enviadas</h2>
          <p>{oferente}</p>
          <div className="folio">Folio {folio}</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
            <Link to="/ronda2" className="btn btn-primary">Volver a formularios R2</Link>
          </div>
        </div>
      </section>
    </div>
  )

  // --- FORM ---
  return (
    <div className="wrap">
      <section className="doc">
        <div className="banner">
          <h1>Condiciones Operativas y Cargos Locales en Origen</h1>
        </div>
        <div className="subbar">
          <span>RFP 2026-2027 · Segunda Ronda</span>
          <span className="r2-badge">ETAPA 2</span>
        </div>

        <div style={{ padding: '12px 28px 0' }}>
          <Link to="/ronda2" className="back-link">← Volver a formularios R2</Link>
        </div>

        <div style={{ padding: '10px 28px 0', fontSize: 13.5, color: 'var(--muted)' }}>
          Este formulario se completa una única vez por oferente. Incluye condiciones operativas,
          crédito/facturación y gastos FOB.
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

        {/* CRÉDITO Y FACTURACIÓN */}
        <div className="cond-bar">Crédito y Facturación</div>
        <div className="cond-grid">
          <div className="cond-row"><div className="lbl">Crédito (días)</div><div className="val"><input type="number" min="0" value={condiciones.credito_dias || ''} onChange={(e) => updateCond('credito_dias', e.target.value)} /></div></div>
          <div className="cond-row"><div className="lbl">Facturación aplica a partir de</div><div className="val">
            <select className="inline-select" value={facturacion} onChange={(e) => { setFacturacion(e.target.value); scheduleSave() }}>
              <option value="">— Seleccionar —</option>
              {FACTURACION_OPCIONES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div></div>
        </div>

        {/* CONDICIONES OPERATIVAS */}
        <div className="cond-bar">Condiciones Operativas</div>
        <div className="cond-grid">
          <div className="cond-row"><div className="lbl">Herramienta para seguimiento (nombre)</div><div className="val"><input type="text" value={condiciones.herramienta_seguimiento || ''} onChange={(e) => updateCond('herramienta_seguimiento', e.target.value)} placeholder="Nombre de la herramienta" /></div></div>
          <div className="cond-row"><div className="lbl">¿En qué consiste la herramienta? ¿Cómo agrega valor?</div><div className="val"><textarea value={condiciones.herramienta_descripcion || ''} onChange={(e) => updateCond('herramienta_descripcion', e.target.value)} placeholder="Descripción y cómo podría agregar valor a nuestra operación" /></div></div>
          <div className="cond-row"><div className="lbl">¿Es posible la integración vía API u otro?</div><div className="val"><input type="text" value={condiciones.integracion_api || ''} onChange={(e) => updateCond('integracion_api', e.target.value)} placeholder="Sí / No / Descripción" /></div></div>
          <div className="cond-row"><div className="lbl">Recursos operativos — Estrategia de control en origen y destino</div><div className="val"><textarea value={condiciones.recursos_operativos || ''} onChange={(e) => updateCond('recursos_operativos', e.target.value)} placeholder="Defina cuál es su estrategia para el control de nuestra operación tanto en origen como en destino" /></div></div>
          <div className="cond-row"><div className="lbl">Observaciones</div><div className="val"><textarea value={condiciones.observaciones || ''} onChange={(e) => updateCond('observaciones', e.target.value)} /></div></div>
        </div>

        {/* GASTOS FOB */}
        <div className="cond-bar">Cargos Locales Puertos Base de China — FOB (CNY)</div>
        <div className="section-head" style={{ paddingTop: 10, paddingBottom: 4 }}>
          <span className="note" style={{ color: 'var(--muted)', fontSize: 12.5 }}>Complétalo a mano o carga un Excel con la plantilla</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={descargarPlantillaFobR2}>
              Descargar plantilla FOB
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => fobFileRef.current?.click()}>
              Cargar Excel FOB
            </button>
            <input ref={fobFileRef} type="file" accept=".xlsx,.xls" hidden onChange={handleCargarFob} />
          </div>
        </div>
        <div className="cond-sub">Completar por cada puerto base los cargos locales en términos FOB</div>
        {PUERTOS_BASE_CHINA.map((puerto) => (
          <div key={puerto} className="fob-puerto-section">
            <div className="fob-puerto-header">{puerto}, China</div>
            <div className="table-scroll">
              <table className="matriz fob-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 180 }}>Cargo</th>
                    <th className="num">20GP (CNY)</th>
                    <th className="num">40GP (CNY)</th>
                    <th className="num">40HQ (CNY)</th>
                    <th>Unidad</th>
                    <th>Observación</th>
                  </tr>
                </thead>
                <tbody>
                  {CARGOS_FOB.map((cargo) => (
                    <tr key={cargo.key}>
                      <td className="fix">{cargo.label}</td>
                      {CONTENEDORES_FOB.map((cont) => (
                        <td key={cont} className="num">
                          <input
                            type="number" min="0" step="0.01"
                            value={(gastosFob[puerto]?.[cargo.key]?.[cont]) || ''}
                            onChange={(e) => updateFob(puerto, cargo.key, cont, e.target.value)}
                            placeholder="0"
                          />
                        </td>
                      ))}
                      <td>
                        <input
                          type="text"
                          value={(gastosFob[puerto]?.[cargo.key]?.unidad) || ''}
                          onChange={(e) => updateFob(puerto, cargo.key, 'unidad', e.target.value)}
                          placeholder="—"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={(gastosFob[puerto]?.[cargo.key]?.observacion) || ''}
                          onChange={(e) => updateFob(puerto, cargo.key, 'observacion', e.target.value)}
                          placeholder="—"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {/* Observaciones FOB */}
        <div className="cond-bar">Observaciones Gastos FOB</div>
        <div className="cond-grid">
          <div className="cond-row"><div className="lbl">Observaciones</div><div className="val"><textarea value={condiciones.obs_fob || ''} onChange={(e) => updateCond('obs_fob', e.target.value)} /></div></div>
        </div>

      </section>

      {/* Actions bar */}
      <div className="actions">
        <div className="inner">
          <span className="r2-badge">ETAPA 2</span>
          <span className="usd-note" style={{ marginLeft: 12 }}>Condiciones Operativas · FOB en CNY</span>
          <span className="spacer" />
          <Link to="/ronda2" className="btn btn-ghost">Cancelar</Link>
          <button type="button" className="btn btn-primary" disabled={enviando} onClick={() => { if (validar()) setShowConfirm(true) }}>
            {enviando ? 'Enviando…' : 'Enviar condiciones'}
          </button>
        </div>
      </div>

      {/* Confirm modal */}
      {showConfirm && (
        <div className="overlay open" onClick={() => setShowConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="m-head">Confirmar envío — Condiciones Operativas</div>
            <div className="m-body">
              <p>¿Estás seguro de enviar las condiciones operativas?</p>
              <div className="resumen">
                <div><span>Oferente</span><b>{oferente}</b></div>
                <div><span>Región</span><b>{[regionCA && 'CA', regionVE && 'VE'].filter(Boolean).join(', ')}</b></div>
                <div><span>Facturación</span><b>{facturacion || '—'}</b></div>
                <div><span>Herramienta</span><b>{condiciones.herramienta_seguimiento || '—'}</b></div>
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
