const REGIONES_ORIGEN = ['America', 'Europa', 'Asia Puertos Base', 'Asia']
const REG_LABELS = { America: 'América', Europa: 'Europa', 'Asia Puertos Base': 'Asia PB', Asia: 'Asia' }

/**
 * Filtro de regiones tipo "chips" seleccionables (multi-selección).
 * Props:
 *   - seleccionadas: Set de regiones activas
 *   - onToggle: (reg) => void
 *   - onTodas / onSoloPB: helpers rápidos (opcionales)
 *   - label: título del filtro
 */
export default function FiltroRegiones({ seleccionadas, onToggle, onTodas, onSoloPB, label = 'Regiones de origen' }) {
  const total = REGIONES_ORIGEN.length
  const nSel = REGIONES_ORIGEN.filter((r) => seleccionadas.has(r)).length

  return (
    <div style={{ width: '100%', margin: '4px 0 2px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal-deep)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {label}
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          {nSel === total ? 'Todas' : `${nSel} de ${total}`}
        </span>
        <span style={{ flex: 1 }} />
        {onTodas && (
          <button type="button" onClick={onTodas}
            style={linkBtn}>Todas</button>
        )}
        {onSoloPB && (
          <button type="button" onClick={onSoloPB}
            style={linkBtn}>Solo Asia PB</button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {REGIONES_ORIGEN.map((reg) => {
          const activo = seleccionadas.has(reg)
          return (
            <button
              key={reg}
              type="button"
              onClick={() => onToggle(reg)}
              aria-pressed={activo}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 999, cursor: 'pointer',
                fontSize: 12.5, fontWeight: 600,
                border: activo ? '1.5px solid var(--teal-deep)' : '1.5px solid #d0d7de',
                background: activo ? 'var(--teal-deep)' : '#fff',
                color: activo ? '#fff' : '#57606a',
                transition: 'all .12s ease',
                boxShadow: activo ? '0 1px 3px rgba(15,95,87,.25)' : 'none'
              }}
            >
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 15, height: 15, borderRadius: '50%', fontSize: 10, fontWeight: 800,
                border: activo ? '1.5px solid rgba(255,255,255,.8)' : '1.5px solid #c0c7ce',
                color: activo ? '#fff' : 'transparent',
                background: activo ? 'rgba(255,255,255,.15)' : 'transparent'
              }}>
                {activo ? '✓' : ''}
              </span>
              {REG_LABELS[reg] || reg}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const linkBtn = {
  background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer',
  fontSize: 11.5, fontWeight: 600, padding: '2px 4px', textDecoration: 'underline'
}

export { REGIONES_ORIGEN, REG_LABELS }
