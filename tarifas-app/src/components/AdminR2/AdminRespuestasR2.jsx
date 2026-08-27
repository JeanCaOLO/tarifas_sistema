import { useState, useContext } from 'react'
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

function parseJson(v) {
  if (!v) return null
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return null } }
  return v
}
