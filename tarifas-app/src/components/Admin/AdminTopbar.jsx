import { useContext } from 'react'
import { AdminContext } from '../../pages/AdminPage'

export default function AdminTopbar() {
  const { user, logout, cargarDatos, tab, setTab, etapa, setEtapa } = useContext(AdminContext)

  return (
    <div className="topbar">
      <div className="inner">
        <div className="brand">Tarifas Marítimas<small>RFP 2026-2027 · Administración</small></div>

        {/* Selector de Etapa */}
        <div className="etapa-selector">
          <button
            className={`etapa-btn ${etapa === '1' ? 'active' : ''}`}
            onClick={() => setEtapa('1')}
          >
            Etapa 1
          </button>
          <button
            className={`etapa-btn ${etapa === '2' ? 'active' : ''}`}
            onClick={() => setEtapa('2')}
          >
            Etapa 2
          </button>
        </div>

        <nav className="tabs">
          <button className={`tab ${tab === 'respuestas' ? 'active' : ''}`} onClick={() => setTab('respuestas')}>Respuestas</button>
          <button className={`tab ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>Dashboard</button>
          <button className={`tab ${tab === 'ranking' ? 'active' : ''}`} onClick={() => setTab('ranking')}>Ranking</button>
          <button className={`tab ${tab === 'ranking2' ? 'active' : ''}`} onClick={() => setTab('ranking2')}>Ranking Regional</button>
          {etapa === '2' && (
            <button className={`tab tab-compare ${tab === 'comparativa' ? 'active' : ''}`} onClick={() => setTab('comparativa')}>
              Comparativa E1↔E2
            </button>
          )}
        </nav>
        <span className="spacer" />
        <span className="whoami">{user}</span>
        <button className="btn btn-ghost btn-sm" onClick={cargarDatos}>Actualizar</button>
        <button className="btn btn-ghost btn-sm" onClick={logout}>Salir</button>
      </div>
    </div>
  )
}
