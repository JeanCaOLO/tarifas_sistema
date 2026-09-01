import { useState, useContext, useEffect } from 'react'
import { AdminContext } from '../../pages/AdminPage'
import { supabase } from '../../supabase'
import { PUERTOS_BASE_CHINA, CARGOS_FOB, CONTENEDORES_FOB } from '../../constantsR2'
import { fmtFecha, folioDe } from '../../utils/format'
import { exportarCondicionOperativa } from '../../utils/exportR2'

export default function AdminCondicionesOperativas() {
  const { condOpR2, cargarDatos } = useContext(AdminContext)
  const [fBuscar, setFBuscar] = useState('')
  const [detalle, setDetalle] = useState(null)
  const [editar, setEditar] = useState(null)

  const items = condOpR2 || []

  const filtradas = items.filter((c) =>
    !fBuscar || `${c.oferente} ${c.email_contacto || ''}`.toLowerCase().includes(fBuscar.toLowerCase())
  )

  async function eliminar(id) {
    const c = items.find((x) => x.id === id)
    if (!c) return
    if (!window.confirm(`¿Eliminar condiciones operativas de "${c.oferente}"? Esta acción no se puede deshacer.`)) return
    await supabase.from('rfp_condiciones_operativas_r2').delete().eq('id', id)
    cargarDatos()
  }

  return (
    <section>
      <div className="filters">
        <div className="f">
          <label>Oferente</label>
          <input type="search" value={fBuscar} onChange={(e) => setFBuscar(e.target.value)} placeholder="Buscar..." />
        </div>
        <span className="spacer" />
        <span className="count-note">{filtradas.length} de {items.length} condiciones operativas</span>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="grid">
            <thead>
              <tr>
                <th>Fecha</th><th>Folio</th><th>Oferente</th><th>Correo</th><th>Región</th>
                <th className="th-num">Crédito (días)</th><th>Facturación</th><th>Herramienta</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((c) => (
                <tr key={c.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtFecha(c.created_at)}</td>
                  <td><span className="folio">{folioDe(c.id)}</span></td>
                  <td style={{ fontWeight: 600 }}>{c.oferente}</td>
                  <td>{c.email_contacto || '—'}</td>
                  <td>{c.region ? (Array.isArray(c.region) ? c.region.join(', ') : c.region) : '—'}</td>
                  <td className="td-num num">{c.credito_dias ?? '—'}</td>
                  <td>{c.facturacion_aplica || '—'}</td>
                  <td>{c.herramienta_seguimiento || '—'}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => setDetalle(c)}>Ver</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditar(c)}>Editar</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => exportarCondicionOperativa(c)}>Excel</button>
                      <button className="btn btn-danger btn-sm" onClick={() => eliminar(c.id)}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtradas.length && <div className="empty">No hay condiciones operativas cargadas.</div>}
      </div>

      {detalle && <DetalleModal condOp={detalle} onClose={() => setDetalle(null)} onExport={() => exportarCondicionOperativa(detalle)} />}

      {editar && (
        <EditarModal
          condOp={editar}
          onClose={() => setEditar(null)}
          onSaved={() => { setEditar(null); cargarDatos() }}
        />
      )}
    </section>
  )
}

function DetalleModal({ condOp: c, onClose, onExport }) {
  const region = Array.isArray(c.region) ? c.region.join(', ') : (c.region || '—')
  const fob = parseJson(c.gastos_fob)

  return (
    <div className="overlay open" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 940, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <div className="m-head">Condiciones Operativas — {c.oferente}</div>
        <div className="m-body" style={{ maxHeight: '70vh', overflow: 'auto' }}>
          <div className="detail-meta">
            <div><b>Oferente</b>{c.oferente}</div>
            <div><b>Correo</b>{c.email_contacto || '—'}</div>
            <div><b>Región</b>{region}</div>
            <div><b>Folio</b>{folioDe(c.id)}</div>
            <div><b>Fecha</b>{fmtFecha(c.created_at)}</div>
          </div>

          <div className="cond-list">
            <div className="cbar">Crédito y Facturación</div>
            <div className="crow"><div className="l">Crédito (días)</div><div className="v">{c.credito_dias ?? '—'}</div></div>
            <div className="crow"><div className="l">Facturación aplica a partir de</div><div className="v">{c.facturacion_aplica || '—'}</div></div>
          </div>

          <div className="cond-list" style={{ marginTop: 14 }}>
            <div className="cbar">Condiciones Operativas</div>
            <div className="crow"><div className="l">Herramienta seguimiento</div><div className="v">{c.herramienta_seguimiento || '—'}</div></div>
            <div className="crow"><div className="l">Descripción herramienta</div><div className="v">{c.herramienta_descripcion || '—'}</div></div>
            <div className="crow"><div className="l">Integración API</div><div className="v">{c.integracion_api || '—'}</div></div>
            <div className="crow"><div className="l">Recursos operativos</div><div className="v">{c.recursos_operativos || '—'}</div></div>
            <div className="crow"><div className="l">Observaciones</div><div className="v">{c.observaciones || '—'}</div></div>
          </div>

          <div className="section-title" style={{ marginTop: 18 }}>Cargos Locales FOB (CNY)</div>
          {PUERTOS_BASE_CHINA.map((puerto) => {
            const pData = fob?.[puerto]
            const hasData = pData && Object.values(pData).some((cargo) =>
              typeof cargo === 'object' && Object.values(cargo).some((v) => v !== '' && v != null)
            )
            if (!hasData) return null
            return (
              <div key={puerto} className="card" style={{ marginBottom: 12 }}>
                <div style={{ padding: '8px 12px', background: 'var(--teal-dark)', color: '#fff', fontWeight: 700, fontSize: 12.5 }}>{puerto}, China</div>
                <div className="table-scroll">
                  <table className="grid">
                    <thead><tr>
                      <th>Cargo</th><th className="th-num">20GP</th><th className="th-num">40GP</th><th className="th-num">40HQ</th>
                      <th>Unidad</th><th>Observación</th>
                    </tr></thead>
                    <tbody>
                      {CARGOS_FOB.map((cargo) => {
                        const cData = pData[cargo.key] || {}
                        return (
                          <tr key={cargo.key}>
                            <td>{cargo.label}</td>
                            <td className="td-num num">{cData['20GP'] || '—'}</td>
                            <td className="td-num num">{cData['40GP'] || '—'}</td>
                            <td className="td-num num">{cData['40HQ'] || '—'}</td>
                            <td>{cData.unidad || '—'}</td>
                            <td>{cData.observacion || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
          {!fob && <div className="empty">Sin gastos FOB cargados.</div>}

          {c.obs_fob && (
            <div className="cond-list" style={{ marginTop: 14 }}>
              <div className="cbar">Observaciones FOB</div>
              <div className="crow"><div className="l">Observaciones</div><div className="v">{c.obs_fob}</div></div>
            </div>
          )}
        </div>
        <div className="m-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
          <button className="btn btn-primary" onClick={onExport}>Descargar Excel</button>
        </div>
      </div>
    </div>
  )
}

function numOrNull(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function EditarModal({ condOp, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({ ...condOp }))
  const [fob, setFob] = useState(() => parseJson(condOp.gastos_fob) || {})
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setForm({ ...condOp })
    setFob(parseJson(condOp.gastos_fob) || {})
  }, [condOp])

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function setFobCell(puerto, cargoKey, campo, value) {
    setFob((prev) => {
      const next = { ...prev }
      const pData = { ...(next[puerto] || {}) }
      const cData = { ...(pData[cargoKey] || {}) }
      cData[campo] = value
      pData[cargoKey] = cData
      next[puerto] = pData
      return next
    })
  }

  async function guardar() {
    setError('')
    if (!form.oferente || !String(form.oferente).trim()) {
      setError('El nombre del oferente es obligatorio.')
      return
    }
    setGuardando(true)
    try {
      const payload = {
        oferente: form.oferente.trim(),
        email_contacto: form.email_contacto?.trim() || null,
        credito_dias: numOrNull(form.credito_dias),
        facturacion_aplica: form.facturacion_aplica || null,
        herramienta_seguimiento: form.herramienta_seguimiento?.trim() || null,
        herramienta_descripcion: form.herramienta_descripcion?.trim() || null,
        integracion_api: form.integracion_api?.trim() || null,
        recursos_operativos: form.recursos_operativos?.trim() || null,
        observaciones: form.observaciones?.trim() || null,
        gastos_fob: fob,
        obs_fob: form.obs_fob?.trim() || null,
      }

      const { error: e1 } = await supabase
        .from('rfp_condiciones_operativas_r2')
        .update(payload)
        .eq('id', condOp.id)
      if (e1) throw e1

      onSaved()
    } catch (err) {
      setError(err?.message || 'Error al guardar los cambios.')
      setGuardando(false)
    }
  }

  return (
    <div className="overlay open" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 1000, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <div className="m-head">Editar Condiciones Operativas — {condOp.oferente}</div>
        <div className="m-body" style={{ maxHeight: '72vh', overflow: 'auto' }}>
          {error && <div className="empty" style={{ color: '#b91c1c', marginBottom: 12 }}>{error}</div>}

          <div className="cond-list">
            <div className="cbar">Datos generales</div>
            <EditRow label="Oferente"><input type="text" value={form.oferente || ''} onChange={(e) => setField('oferente', e.target.value)} /></EditRow>
            <EditRow label="Correo"><input type="email" value={form.email_contacto || ''} onChange={(e) => setField('email_contacto', e.target.value)} /></EditRow>
          </div>

          <div className="cond-list" style={{ marginTop: 14 }}>
            <div className="cbar">Crédito y Facturación</div>
            <EditRow label="Crédito (días)"><input type="number" min="0" step="1" value={form.credito_dias ?? ''} onChange={(e) => setField('credito_dias', e.target.value)} /></EditRow>
            <EditRow label="Facturación aplica a partir de">
              <select value={form.facturacion_aplica || ''} onChange={(e) => setField('facturacion_aplica', e.target.value)}>
                <option value="">— Seleccionar —</option>
                <option value="arribo">Arribo</option>
                <option value="salida">Salida</option>
              </select>
            </EditRow>
          </div>

          <div className="cond-list" style={{ marginTop: 14 }}>
            <div className="cbar">Condiciones Operativas</div>
            <EditRow label="Herramienta seguimiento"><input type="text" value={form.herramienta_seguimiento || ''} onChange={(e) => setField('herramienta_seguimiento', e.target.value)} /></EditRow>
            <EditRow label="Descripción herramienta"><textarea rows="2" value={form.herramienta_descripcion || ''} onChange={(e) => setField('herramienta_descripcion', e.target.value)} /></EditRow>
            <EditRow label="Integración API"><input type="text" value={form.integracion_api || ''} onChange={(e) => setField('integracion_api', e.target.value)} /></EditRow>
            <EditRow label="Recursos operativos"><textarea rows="2" value={form.recursos_operativos || ''} onChange={(e) => setField('recursos_operativos', e.target.value)} /></EditRow>
            <EditRow label="Observaciones"><textarea rows="2" value={form.observaciones || ''} onChange={(e) => setField('observaciones', e.target.value)} /></EditRow>
          </div>

          <div className="section-title" style={{ marginTop: 18 }}>Cargos Locales FOB (CNY)</div>
          {PUERTOS_BASE_CHINA.map((puerto) => {
            const pData = fob[puerto] || {}
            return (
              <div key={puerto} className="card" style={{ marginBottom: 12 }}>
                <div style={{ padding: '8px 12px', background: 'var(--teal-dark)', color: '#fff', fontWeight: 700, fontSize: 12.5 }}>{puerto}, China</div>
                <div className="table-scroll">
                  <table className="grid">
                    <thead><tr>
                      <th>Cargo</th>
                      {CONTENEDORES_FOB.map((cont) => <th key={cont} className="th-num">{cont}</th>)}
                      <th>Unidad</th><th>Observación</th>
                    </tr></thead>
                    <tbody>
                      {CARGOS_FOB.map((cargo) => {
                        const cData = pData[cargo.key] || {}
                        return (
                          <tr key={cargo.key}>
                            <td>{cargo.label}</td>
                            {CONTENEDORES_FOB.map((cont) => (
                              <td key={cont} className="num">
                                <input type="number" min="0" step="0.01" value={cData[cont] ?? ''}
                                  onChange={(e) => setFobCell(puerto, cargo.key, cont, e.target.value)} />
                              </td>
                            ))}
                            <td><input type="text" value={cData.unidad ?? ''} onChange={(e) => setFobCell(puerto, cargo.key, 'unidad', e.target.value)} /></td>
                            <td><input type="text" value={cData.observacion ?? ''} onChange={(e) => setFobCell(puerto, cargo.key, 'observacion', e.target.value)} /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}

          <div className="cond-list" style={{ marginTop: 14 }}>
            <div className="cbar">Observaciones FOB</div>
            <EditRow label="Observaciones"><textarea rows="2" value={form.obs_fob || ''} onChange={(e) => setField('obs_fob', e.target.value)} /></EditRow>
          </div>
        </div>
        <div className="m-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
        </div>
      </div>
    </div>
  )
}

function EditRow({ label, children }) {
  return (
    <div className="crow">
      <div className="l">{label}</div>
      <div className="v">{children}</div>
    </div>
  )
}

function parseJson(v) {
  if (!v) return null
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return null } }
  return v
}
