import { useState, useContext } from 'react'
import { AdminContext } from '../../pages/AdminPage'
import { supabase } from '../../supabase'
import { PUERTOS_BASE_CHINA, CARGOS_FOB, CONTENEDORES_FOB } from '../../constantsR2'
import { fmtFecha, folioDe } from '../../utils/format'
import { exportarCondicionOperativa } from '../../utils/exportR2'

export default function AdminCondicionesOperativas() {
  const { condOpR2, cargarDatos } = useContext(AdminContext)
  const [fBuscar, setFBuscar] = useState('')
  const [detalle, setDetalle] = useState(null)

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

function parseJson(v) {
  if (!v) return null
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return null } }
  return v
}
