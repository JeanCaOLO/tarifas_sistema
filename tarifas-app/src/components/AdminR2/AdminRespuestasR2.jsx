import { useState, useContext } from 'react'
import { AdminContext } from '../../pages/AdminPage'
import { supabase } from '../../supabase'
import { TOTAL_RUTAS } from '../../constantsR2'
import { fmtFecha, folioDe } from '../../utils/format'

export default function AdminRespuestasR2() {
  const { respuestasR2, tarifasR2, cargarDatos } = useContext(AdminContext)
  const [fPais, setFPais] = useState('')
  const [fBuscar, setFBuscar] = useState('')
  const [fDesde, setFDesde] = useState('')
  const [fHasta, setFHasta] = useState('')

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
      </div>

      <p className="count-note">{filtradas.length} de {respuestas.length} respuestas R2 · {tarifs.length} tarifas en total</p>

      <div className="card">
        <div className="table-scroll">
          <table className="grid">
            <thead>
              <tr>
                <th>Fecha</th><th>Folio</th><th>País</th><th>Región</th><th>Oferente</th><th>Correo</th>
                <th className="th-num">Rutas</th><th className="th-num">Alloc.</th><th>Facturación</th><th style={{ textAlign: 'right' }}>Acciones</th>
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
                    <td>{r.facturacion_aplica || '—'}</td>
                    <td>
                      <div className="row-actions">
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
    </section>
  )
}
