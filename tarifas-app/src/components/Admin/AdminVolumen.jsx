import { useState, useContext, useMemo } from 'react'
import { AdminContext } from '../../pages/AdminPage'
import { supabase } from '../../supabase'
import { PAISES } from '../../constants'
import {
  MESES, MES_KEYS, filasEditables, recalcularTotal,
  leerExcelVolumen, descargarPlantillaVolumen, normPuerto
} from '../../utils/volumen'
import { numOrNull } from '../../utils/format'

/**
 * Módulo para cargar/editar NUESTRO volumen (TEUs) por puerto de origen,
 * por país destino y por mes. Se importa desde Excel o se edita a mano y se
 * guarda en Supabase (tabla rfp_volumen_puerto vía RPC guardar_volumen_puertos).
 */
export default function AdminVolumen() {
  const { volumenes, cargarDatos } = useContext(AdminContext)
  const [pais, setPais] = useState(PAISES[0].code)
  const [filas, setFilas] = useState(() => filasEditables(volumenes, PAISES[0].code))
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const paisNombre = PAISES.find((p) => p.code === pais)?.nombre || pais

  function cambiarPais(nuevo) {
    setPais(nuevo)
    setFilas(filasEditables(volumenes, nuevo))
    setMsg(''); setError('')
  }

  function setCelda(i, mesKey, valor) {
    setFilas((prev) => {
      const next = prev.map((f) => ({ ...f }))
      next[i][mesKey] = numOrNull(valor) || 0
      next[i].total_general = recalcularTotal(next[i])
      return next
    })
    setMsg('')
  }

  const totalPeriodo = useMemo(
    () => filas.reduce((a, f) => a + (numOrNull(f.total_general) || 0), 0),
    [filas]
  )

  async function importarExcel(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(''); setMsg('')
    try {
      const leidas = await leerExcelVolumen(file)
      // Mezclar por puerto: partir de las filas base y sobreescribir con lo leído
      const base = filasEditables(volumenes, pais)
      const leidasIdx = new Map(leidas.map((f) => [normPuerto(f.puerto_origen), f]))
      const merged = base.map((f) => {
        const l = leidasIdx.get(normPuerto(f.puerto_origen))
        if (!l) return f
        const nf = { ...f, region: l.region || f.region }
        for (const k of MES_KEYS) nf[k] = numOrNull(l[k]) || 0
        nf.total_general = numOrNull(l.total_general) || recalcularTotal(nf)
        return nf
      })
      // Puertos del Excel que no están en el catálogo base: agregarlos igual
      const baseSet = new Set(base.map((f) => normPuerto(f.puerto_origen)))
      for (const l of leidas) {
        if (!baseSet.has(normPuerto(l.puerto_origen))) merged.push(l)
      }
      setFilas(merged)
      setMsg(`Importadas ${leidas.length} filas del Excel. Revisa y guarda.`)
    } catch (err) {
      setError(err.message || 'No se pudo leer el Excel.')
    } finally {
      e.target.value = ''
    }
  }

  async function guardar() {
    setGuardando(true); setError(''); setMsg('')
    try {
      const payload = {
        pais,
        filas: filas.map((f) => ({
          puerto_origen: f.puerto_origen,
          region: f.region || '',
          ...Object.fromEntries(MES_KEYS.map((k) => [k, numOrNull(f[k]) || 0])),
          total_general: numOrNull(f.total_general) || 0
        }))
      }
      const { error: err } = await supabase.rpc('guardar_volumen_puertos', { p: payload })
      if (err) throw err
      setMsg('Volumen guardado correctamente.')
      await cargarDatos()
    } catch (err) {
      setError(err.message || 'No se pudo guardar en la base de datos.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section>
      <div className="section-title">Nuestro Volumen por Puerto de Origen</div>
      <div className="card" style={{ padding: '12px 16px', marginBottom: 14, fontSize: 12.5, lineHeight: 1.6 }}>
        Captura los <b>TEUs que movemos</b> por puerto de origen y mes, para cada país destino.
        Este volumen se usa en el <b>Comparativo Volumen × Precio</b> con la fórmula
        <b> costo = (volumen ÷ 2) × tarifa</b> (menor costo = mejor oferente).
      </div>

      <div className="filters" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="f"><label>País destino</label>
          <select value={pais} onChange={(e) => cambiarPais(e.target.value)}>
            {PAISES.map((p) => <option key={p.code} value={p.code}>{p.nombre}</option>)}
          </select>
        </div>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => descargarPlantillaVolumen(pais, paisNombre)}>⬇ Plantilla Excel</button>
        <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
          ⬆ Importar Excel
          <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={importarExcel} />
        </label>
        <button className="btn btn-sm" onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar volumen'}
        </button>
      </div>

      {msg && <div className="card" style={{ padding: '10px 14px', margin: '10px 0', background: 'var(--mint)', color: 'var(--teal-deep)', fontSize: 12.5 }}>✓ {msg}</div>}
      {error && <div className="card" style={{ padding: '10px 14px', margin: '10px 0', background: '#fde8e8', color: '#c0392b', fontSize: 12.5 }}>⚠ {error}</div>}

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ padding: '10px 14px', background: 'var(--teal-dark)', color: '#fff', fontWeight: 700, fontSize: 13 }}>
          {paisNombre} — Total anual: <b>{totalPeriodo.toLocaleString('en-US')}</b> TEUs · {filas.length} puertos
        </div>
        <div className="table-scroll" style={{ maxHeight: 520 }}>
          <table className="grid" style={{ fontSize: 12 }}>
            <thead><tr>
              <th style={{ minWidth: 180 }}>Puerto Origen</th>
              <th>Región</th>
              {MESES.map((m) => <th key={m.key} className="th-num" title={m.label}>{m.key}</th>)}
              <th className="th-num">Total</th>
            </tr></thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={f.puerto_origen + i}>
                  <td style={{ fontWeight: 600 }}>{f.puerto_origen}</td>
                  <td><span className="badge" style={{ fontSize: 10 }}>{f.region}</span></td>
                  {MES_KEYS.map((k) => (
                    <td key={k} className="td-num">
                      <input type="number" min="0" step="1" value={f[k] || 0}
                        onChange={(e) => setCelda(i, k, e.target.value)}
                        style={{ width: 52, padding: '3px 4px', border: '1px solid #d0d7de', borderRadius: 5, textAlign: 'right', fontSize: 11.5 }} />
                    </td>
                  ))}
                  <td className="td-num num" style={{ fontWeight: 700, color: 'var(--teal-deep)' }}>{f.total_general || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
