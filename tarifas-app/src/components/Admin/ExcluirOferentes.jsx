import { useContext, useMemo } from 'react'
import { AdminContext } from '../../pages/AdminPage'

/**
 * Clave normalizada de un oferente (consistente con los cálculos de ranking).
 */
export function oferKey(nombre) {
  return (nombre || '').trim().toLowerCase()
}

/**
 * Filtra respuestas y tarifas quitando los oferentes excluidos.
 * Devuelve { respuestas, tarifas } listos para pasar a las funciones de ranking.
 */
export function aplicarExclusion(respuestas, tarifas, excluidos) {
  if (!excluidos || excluidos.size === 0) return { respuestas, tarifas }

  const respFiltradas = (respuestas || []).filter((r) => !excluidos.has(oferKey(r.oferente)))
  const idsPermitidos = new Set(respFiltradas.map((r) => r.id))
  const tarFiltradas = (tarifas || []).filter((t) => {
    // La tarifa puede traer el nombre del oferente (vistas planas) o solo submission_id
    if (t.oferente != null && excluidos.has(oferKey(t.oferente))) return false
    if (t.submission_id != null) return idsPermitidos.has(t.submission_id)
    return true
  })
  return { respuestas: respFiltradas, tarifas: tarFiltradas }
}

/**
 * Panel para excluir oferentes del cálculo de rankings.
 * La selección es compartida entre todas las vistas de ranking (vive en AdminContext).
 */
export default function ExcluirOferentes({ respuestas }) {
  const { oferentesExcluidos, toggleOferenteExcluido, limpiarExcluidos } = useContext(AdminContext)

  // Lista única de oferentes (por nombre) presentes en las respuestas
  const oferentes = useMemo(() => {
    const map = new Map()
    for (const r of respuestas || []) {
      const key = oferKey(r.oferente)
      if (key && !map.has(key)) map.set(key, r.oferente.trim())
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [respuestas])

  if (!oferentes.length) return null

  const nExcluidos = oferentes.filter(([key]) => oferentesExcluidos.has(key)).length

  return (
    <details className="card" style={{ marginBottom: 16, padding: 0 }}>
      <summary style={{ padding: '10px 14px', background: nExcluidos ? '#b45309' : 'var(--teal-dark)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
        🚫 Excluir oferentes del cálculo {nExcluidos ? `(${nExcluidos} excluido${nExcluidos !== 1 ? 's' : ''})` : ''}
      </summary>
      <div style={{ padding: '12px 16px' }}>
        <p style={{ marginTop: 0, fontSize: 12.5, color: 'var(--muted)' }}>
          Marca los oferentes que quieres omitir. El ranking, el ranking regional y el comparativo se recalculan automáticamente sin esos oferentes. La selección se comparte entre todas las vistas.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', margin: '10px 0' }}>
          {oferentes.map(([key, nombre]) => (
            <label key={key} className="cb-label" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
              <input
                type="checkbox"
                checked={oferentesExcluidos.has(key)}
                onChange={() => toggleOferenteExcluido(nombre)}
              />
              <span style={{ textDecoration: oferentesExcluidos.has(key) ? 'line-through' : 'none', color: oferentesExcluidos.has(key) ? 'var(--muted)' : 'inherit' }}>
                {nombre}
              </span>
            </label>
          ))}
        </div>
        {nExcluidos > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={limpiarExcluidos}>Incluir todos de nuevo</button>
        )}
      </div>
    </details>
  )
}
