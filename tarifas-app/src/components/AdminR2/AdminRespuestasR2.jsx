import { useState, useContext, useEffect } from 'react'
import { AdminContext } from '../../pages/AdminPage'
import { supabase } from '../../supabase'
import { TOTAL_RUTAS, PUERTOS_BASE_CHINA } from '../../constantsR2'
import { fmtFecha, folioDe, fmtMoney } from '../../utils/format'
import { exportarOfertaR2, exportarTodasR2 } from '../../utils/exportR2'

export default function AdminRespuestasR2() {
  const { respuestasR2, tarifasR2, cargarDatos } = useContext(AdminContext)
  const [fPais, setFPais] = useState('')
  const [fBuscar, setFBuscar] = useState('')
  const [fDesde, setFDesde] = useState('')
  const [fHasta, setFHasta] = useState('')
  const [detalle, setDetalle] = useState(null)
  const [editar, setEditar] = useState(null)

  const respuestas = respuestasR2 || []
  const tarifs = tarifasR2 || []

  const filtradas = respuestas.filter((r) => {
    if (fPais && r.pais !== fPais) return false
    if (fBuscar && !`${r.oferente} ${r.email_contacto || ''}`.toLowerCase().includes(fBuscar.toLowerCase())) return false
    const dia = r.created_at.slice(0, 10)
    if (fDesde && dia < fDesde) return false
    if (fHasta && dia > fHasta) return false
    return true
  })

  async function eliminar(id) {
    const r = respuestas.find((x) => x.id === id)
    if (!r) return
    if (!window.confirm(`¿Eliminar respuesta R2 de "${r.oferente}"? Esta acción no se puede deshacer.`)) return
    await supabase.from('rfp_submissions_r2').delete().eq('id', id)
    cargarDatos()
  }

  function tarifasDe(subId) {
    return tarifs.filter((t) => t.submission_id === subId)
  }

  function descargarUna(r) {
    exportarOfertaR2(r, tarifasDe(r.id))
  }

  function descargarTodas() {
    const idsFiltrados = new Set(filtradas.map((r) => r.id))
    const tarifasFiltradas = tarifs.filter((t) => idsFiltrados.has(t.submission_id))
    exportarTodasR2(filtradas, tarifasFiltradas)
  }

  return (
    <section>
      <div className="filters">
        <div className="f">
          <label>País</label>
          <select value={fPais} onChange={(e) => setFPais(e.target.value)}>
            <option value="">Todos</option>
            <option value="CR">Costa Rica</option>
            <option value="SV">El Salvador</option>
            <option value="GT">Guatemala</option>
            <option value="VNZ">Venezuela</option>
          </select>
        </div>
        <div className="f">
          <label>Oferente</label>
          <input type="search" value={fBuscar} onChange={(e) => setFBuscar(e.target.value)} placeholder="Buscar..." />
        </div>
        <div className="f"><label>Desde</label><input type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} /></div>
        <div className="f"><label>Hasta</label><input type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} /></div>
        <span className="spacer" />
        <button className="btn btn-ghost" onClick={() => { setFPais(''); setFBuscar(''); setFDesde(''); setFHasta('') }}>Limpiar filtros</button>
        <button className="btn btn-primary" onClick={descargarTodas} disabled={!filtradas.length}>Descargar todo (Excel)</button>
      </div>

      <p className="count-note">{filtradas.length} de {respuestas.length} respuestas R2 · {tarifs.length} tarifas en total</p>

      <div className="card">
        <div className="table-scroll">
          <table className="grid">
            <thead>
              <tr>
                <th>Fecha</th><th>Folio</th><th>País</th><th>Región</th><th>Oferente</th><th>Correo</th>
                <th className="th-num">Rutas</th><th className="th-num">Alloc.</th><th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((r) => {
                const allocTotal = (Number(r.allocation_america) || 0) + (Number(r.allocation_europa) || 0) +
                  (Number(r.allocation_asia_pb) || 0) + (Number(r.allocation_asia_restante) || 0)
                return (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtFecha(r.created_at)}</td>
                    <td><span className="folio">{folioDe(r.id)}</span></td>
                    <td><span className="badge">{r.pais_nombre}</span></td>
                    <td>{r.region ? (Array.isArray(r.region) ? r.region.join(', ') : r.region) : '—'}</td>
                    <td style={{ fontWeight: 600 }}>{r.oferente}</td>
                    <td>{r.email_contacto || '—'}</td>
                    <td className="td-num num">{r.rutas_cotizadas} / {TOTAL_RUTAS}</td>
                    <td className="td-num num">{allocTotal > 0 ? allocTotal : '—'}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => setDetalle(r)}>Ver</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditar(r)}>Editar</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => descargarUna(r)}>Excel</button>
                        <button className="btn btn-danger btn-sm" onClick={() => eliminar(r.id)}>Eliminar</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!filtradas.length && <div className="empty">No hay respuestas R2 que coincidan con los filtros.</div>}
      </div>

      {detalle && (
        <DetalleModal
          submission={detalle}
          tarifas={tarifasDe(detalle.id)}
          onClose={() => setDetalle(null)}
          onExport={() => descargarUna(detalle)}
        />
      )}

      {editar && (
        <EditarModal
          submission={editar}
          tarifas={tarifasDe(editar.id)}
          onClose={() => setEditar(null)}
          onSaved={() => { setEditar(null); cargarDatos() }}
        />
      )}
    </section>
  )
}

function DetalleModal({ submission: r, tarifas, onClose, onExport }) {
  const region = Array.isArray(r.region) ? r.region.join(', ') : (r.region || '—')
  const rep = parseJson(r.representacion)
  const repSies = rep ? Object.entries(rep).filter(([, v]) => v === true).map(([k]) =>
    k.startsWith('china_') ? k.replace('china_', '').replace(/^\w/, (c) => c.toUpperCase()) : (k === 'destino' ? 'Destino' : k)
  ) : []

  return (
    <div className="overlay open" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 900, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <div className="m-head">Detalle de oferta — {r.oferente}</div>
        <div className="m-body" style={{ maxHeight: '70vh', overflow: 'auto' }}>
          <div className="detail-meta">
            <div><b>Oferente</b>{r.oferente}</div>
            <div><b>Correo</b>{r.email_contacto || '—'}</div>
            <div><b>País</b>{r.pais_nombre || r.pais}</div>
            <div><b>Región</b>{region}</div>
            <div><b>Folio</b>{folioDe(r.id)}</div>
            <div><b>Fecha</b>{fmtFecha(r.created_at)}</div>
            <div><b>Rutas cotizadas</b>{r.rutas_cotizadas} / {TOTAL_RUTAS}</div>
          </div>

          <div className="cond-list">
            <div className="cbar">Gastos en Destino (USD)</div>
            <div className="crow"><div className="l">Impresión de BL</div><div className="v">{fmtMoney(r.gasto_impresion_bl)}</div></div>
            <div className="crow"><div className="l">Retiro de vacío</div><div className="v">{fmtMoney(r.gasto_retiro_vacio)}</div></div>
            <div className="crow"><div className="l">Demoras contenedor/día</div><div className="v">{fmtMoney(r.gasto_demora_contenedor_dia)}</div></div>
            <div className="crow"><div className="l">Demoras chasis/día</div><div className="v">{fmtMoney(r.gasto_demora_chasis_dia)}</div></div>
            <div className="crow"><div className="l">Chasis 3 ejes</div><div className="v">{fmtMoney(r.gasto_chasis_3_ejes)}</div></div>
            <div className="crow"><div className="l">Estadías</div><div className="v">{fmtMoney(r.gasto_estadias)}</div></div>
          </div>

          <div className="cond-list" style={{ marginTop: 14 }}>
            <div className="cbar">Allocation Mensual (TEUS)</div>
            <div className="crow"><div className="l">América</div><div className="v">{r.allocation_america ?? '—'}</div></div>
            <div className="crow"><div className="l">Europa</div><div className="v">{r.allocation_europa ?? '—'}</div></div>
            <div className="crow"><div className="l">Asia Puertos Base</div><div className="v">{r.allocation_asia_pb ?? '—'}</div></div>
            <div className="crow"><div className="l">Asia (restante)</div><div className="v">{r.allocation_asia_restante ?? '—'}</div></div>
          </div>

          <div className="cond-list" style={{ marginTop: 14 }}>
            <div className="cbar">Representación / Oficinas</div>
            <div className="crow"><div className="l">Oficinas propias (Sí)</div><div className="v">{repSies.length ? repSies.join(', ') : '—'}</div></div>
          </div>

          <div className="cond-list" style={{ marginTop: 14 }}>
            <div className="cbar">Condiciones Comerciales</div>
            <div className="crow"><div className="l">Vigencia</div><div className="v">{r.vigencia_del || '—'} al {r.vigencia_al || '—'}</div></div>
            <div className="crow"><div className="l">Tarifas incluyen</div><div className="v">{r.tarifas_incluyen || '—'}</div></div>
            <div className="crow"><div className="l">Tarifas NO incluyen</div><div className="v">{r.tarifas_no_incluyen || '—'}</div></div>
            <div className="crow"><div className="l">Observaciones</div><div className="v">{r.observaciones || '—'}</div></div>
          </div>

          <div className="section-title" style={{ marginTop: 18 }}>Tarifas cotizadas ({tarifas.length})</div>
          <div className="table-scroll" style={{ maxHeight: 320 }}>
            <table className="grid">
              <thead><tr>
                <th>Origen</th><th>Región</th><th>Puerto</th>
                <th className="th-num">20" STD</th><th className="th-num">40" STD</th><th className="th-num">40" HC</th>
                <th className="th-num">D.Libres Dest.</th>
              </tr></thead>
              <tbody>
                {tarifas.map((t, i) => (
                  <tr key={i}>
                    <td>{t.origen}</td>
                    <td>{t.region}</td>
                    <td>{t.puerto_arribo || '—'}</td>
                    <td className="td-num num">{t.tarifa_20_std != null ? '$' + fmtMoney(t.tarifa_20_std) : '—'}</td>
                    <td className="td-num num">{t.tarifa_40_std != null ? '$' + fmtMoney(t.tarifa_40_std) : '—'}</td>
                    <td className="td-num num">{t.tarifa_40_hc != null ? '$' + fmtMoney(t.tarifa_40_hc) : '—'}</td>
                    <td className="td-num num">{t.dias_libres_destino ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!tarifas.length && <div className="empty">Sin tarifas cargadas.</div>}
          </div>
        </div>
        <div className="m-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
          <button className="btn btn-primary" onClick={onExport}>Descargar Excel</button>
        </div>
      </div>
    </div>
  )
}

// Campos numéricos de la submission que se pueden editar
const SUB_NUM_FIELDS = [
  'gasto_impresion_bl', 'gasto_retiro_vacio', 'gasto_demora_contenedor_dia',
  'gasto_demora_chasis_dia', 'gasto_chasis_3_ejes', 'gasto_estadias',
  'allocation_america', 'allocation_europa', 'allocation_asia_pb', 'allocation_asia_restante',
]
// Campos de texto/fecha editables
const SUB_TEXT_FIELDS = [
  'oferente', 'email_contacto', 'vigencia_del', 'vigencia_al',
  'tarifas_incluyen', 'tarifas_no_incluyen', 'observaciones',
]
// Campos numéricos editables por tarifa
const TAR_NUM_FIELDS = [
  'dias_libres_origen', 'dias_libres_destino',
  'tarifa_20_std', 'tarifa_40_std', 'tarifa_40_hc',
]

function numOrNull(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function EditarModal({ submission, tarifas, onClose, onSaved }) {
  const [sub, setSub] = useState(() => ({ ...submission }))
  const [rows, setRows] = useState(() => tarifas.map((t) => ({ ...t })))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setSub({ ...submission })
    setRows(tarifas.map((t) => ({ ...t })))
  }, [submission])

  function setSubField(field, value) {
    setSub((prev) => ({ ...prev, [field]: value }))
  }
  function setRowField(idx, field, value) {
    setRows((prev) => {
      const copy = [...prev]
      copy[idx] = { ...copy[idx], [field]: value }
      return copy
    })
  }

  async function guardar() {
    setError('')
    if (!sub.oferente || !String(sub.oferente).trim()) {
      setError('El nombre del oferente es obligatorio.')
      return
    }
    setGuardando(true)
    try {
      // 1. Actualizar submission (tabla base)
      const subPayload = {}
      for (const f of SUB_TEXT_FIELDS) {
        const v = sub[f]
        subPayload[f] = v === '' || v == null ? null : (typeof v === 'string' ? v.trim() : v)
      }
      for (const f of SUB_NUM_FIELDS) {
        subPayload[f] = numOrNull(sub[f])
      }

      const { error: e1 } = await supabase
        .from('rfp_submissions_r2')
        .update(subPayload)
        .eq('id', submission.id)
      if (e1) throw e1

      // 2. Actualizar cada tarifa (tabla base)
      for (const row of rows) {
        if (row.id == null) continue
        const tarPayload = {
          puerto_arribo: row.puerto_arribo === '' || row.puerto_arribo == null ? null : row.puerto_arribo,
          navieras: row.navieras === '' || row.navieras == null ? null : row.navieras,
          tiempo_transito: row.tiempo_transito === '' || row.tiempo_transito == null ? null : row.tiempo_transito,
        }
        for (const f of TAR_NUM_FIELDS) {
          tarPayload[f] = numOrNull(row[f])
        }
        const { error: e2 } = await supabase
          .from('rfp_tarifas_r2')
          .update(tarPayload)
          .eq('id', row.id)
        if (e2) throw e2
      }

      onSaved()
    } catch (err) {
      setError(err?.message || 'Error al guardar los cambios.')
      setGuardando(false)
    }
  }

  return (
    <div className="overlay open" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 1000, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <div className="m-head">Editar oferta — {submission.oferente}</div>
        <div className="m-body" style={{ maxHeight: '72vh', overflow: 'auto' }}>
          {error && <div className="empty" style={{ color: '#b91c1c', marginBottom: 12 }}>{error}</div>}

          <div className="cond-list">
            <div className="cbar">Datos generales</div>
            <EditRow label="Oferente"><input type="text" value={sub.oferente || ''} onChange={(e) => setSubField('oferente', e.target.value)} /></EditRow>
            <EditRow label="Correo"><input type="email" value={sub.email_contacto || ''} onChange={(e) => setSubField('email_contacto', e.target.value)} /></EditRow>
          </div>

          <div className="cond-list" style={{ marginTop: 14 }}>
            <div className="cbar">Condiciones Comerciales</div>
            <EditRow label="Vigencia del"><input type="date" value={sub.vigencia_del || ''} onChange={(e) => setSubField('vigencia_del', e.target.value)} /></EditRow>
            <EditRow label="Vigencia al"><input type="date" value={sub.vigencia_al || ''} onChange={(e) => setSubField('vigencia_al', e.target.value)} /></EditRow>
            <EditRow label="Tarifas incluyen"><textarea rows="2" value={sub.tarifas_incluyen || ''} onChange={(e) => setSubField('tarifas_incluyen', e.target.value)} /></EditRow>
            <EditRow label="Tarifas NO incluyen"><textarea rows="2" value={sub.tarifas_no_incluyen || ''} onChange={(e) => setSubField('tarifas_no_incluyen', e.target.value)} /></EditRow>
            <EditRow label="Observaciones"><textarea rows="2" value={sub.observaciones || ''} onChange={(e) => setSubField('observaciones', e.target.value)} /></EditRow>
          </div>

          <div className="cond-list" style={{ marginTop: 14 }}>
            <div className="cbar">Gastos en Destino (USD)</div>
            <EditRow label="Impresión de BL"><input type="number" min="0" step="0.01" value={sub.gasto_impresion_bl ?? ''} onChange={(e) => setSubField('gasto_impresion_bl', e.target.value)} /></EditRow>
            <EditRow label="Retiro de vacío"><input type="number" min="0" step="0.01" value={sub.gasto_retiro_vacio ?? ''} onChange={(e) => setSubField('gasto_retiro_vacio', e.target.value)} /></EditRow>
            <EditRow label="Demoras contenedor/día"><input type="number" min="0" step="0.01" value={sub.gasto_demora_contenedor_dia ?? ''} onChange={(e) => setSubField('gasto_demora_contenedor_dia', e.target.value)} /></EditRow>
            <EditRow label="Demoras chasis/día"><input type="number" min="0" step="0.01" value={sub.gasto_demora_chasis_dia ?? ''} onChange={(e) => setSubField('gasto_demora_chasis_dia', e.target.value)} /></EditRow>
            <EditRow label="Chasis 3 ejes"><input type="number" min="0" step="0.01" value={sub.gasto_chasis_3_ejes ?? ''} onChange={(e) => setSubField('gasto_chasis_3_ejes', e.target.value)} /></EditRow>
            <EditRow label="Estadías"><input type="number" min="0" step="0.01" value={sub.gasto_estadias ?? ''} onChange={(e) => setSubField('gasto_estadias', e.target.value)} /></EditRow>
          </div>

          <div className="cond-list" style={{ marginTop: 14 }}>
            <div className="cbar">Allocation Mensual (TEUS)</div>
            <EditRow label="América"><input type="number" min="0" step="1" value={sub.allocation_america ?? ''} onChange={(e) => setSubField('allocation_america', e.target.value)} /></EditRow>
            <EditRow label="Europa"><input type="number" min="0" step="1" value={sub.allocation_europa ?? ''} onChange={(e) => setSubField('allocation_europa', e.target.value)} /></EditRow>
            <EditRow label="Asia Puertos Base"><input type="number" min="0" step="1" value={sub.allocation_asia_pb ?? ''} onChange={(e) => setSubField('allocation_asia_pb', e.target.value)} /></EditRow>
            <EditRow label="Asia (restante)"><input type="number" min="0" step="1" value={sub.allocation_asia_restante ?? ''} onChange={(e) => setSubField('allocation_asia_restante', e.target.value)} /></EditRow>
          </div>

          <div className="section-title" style={{ marginTop: 18 }}>Tarifas cotizadas ({rows.length})</div>
          <div className="table-scroll" style={{ maxHeight: 360 }}>
            <table className="grid">
              <thead><tr>
                <th>Origen</th><th>Región</th><th>Puerto</th>
                <th className="th-num">20" STD</th><th className="th-num">40" STD</th><th className="th-num">40" HC</th>
                <th className="th-num">D.L. Origen</th><th className="th-num">D.L. Destino</th>
              </tr></thead>
              <tbody>
                {rows.map((t, i) => (
                  <tr key={t.id ?? i}>
                    <td>{t.origen}</td>
                    <td>{t.region}</td>
                    <td><input type="text" value={t.puerto_arribo || ''} onChange={(e) => setRowField(i, 'puerto_arribo', e.target.value)} /></td>
                    <td className="num"><input type="number" min="0" step="0.01" value={t.tarifa_20_std ?? ''} onChange={(e) => setRowField(i, 'tarifa_20_std', e.target.value)} /></td>
                    <td className="num"><input type="number" min="0" step="0.01" value={t.tarifa_40_std ?? ''} onChange={(e) => setRowField(i, 'tarifa_40_std', e.target.value)} /></td>
                    <td className="num"><input type="number" min="0" step="0.01" value={t.tarifa_40_hc ?? ''} onChange={(e) => setRowField(i, 'tarifa_40_hc', e.target.value)} /></td>
                    <td className="num"><input type="number" min="0" step="1" value={t.dias_libres_origen ?? ''} onChange={(e) => setRowField(i, 'dias_libres_origen', e.target.value)} /></td>
                    <td className="num"><input type="number" min="0" step="1" value={t.dias_libres_destino ?? ''} onChange={(e) => setRowField(i, 'dias_libres_destino', e.target.value)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <div className="empty">Sin tarifas cargadas.</div>}
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
