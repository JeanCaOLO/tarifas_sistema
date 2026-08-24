import { useContext } from 'react'
import { AdminContext } from '../../pages/AdminPage'

export default function AdminTopbar() {
  const { user, logout, cargarDatos, tab, setTab } = useContext(AdminContext)

  return (
    <div className="topbar">
      <div className="inner">
        <div className="brand">Tarifas Marítimas<small>RFP 2026-2027 · Administración</small></div>
        <nav className="tabs">
          <button className={`tab ${tab === 'respuestas' ? 'active' : ''}`} onClick={() => setTab('respuestas')}>Respuestas</button>
          <button className={`tab ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>Dashboard</button>
          <button className={`tab ${tab === 'ranking' ? 'active' : ''}`} onClick={() => setTab('ranking')}>Ranking</button>
          <button className={`tab ${tab === 'ranking2' ? 'active' : ''}`} onClick={() => setTab('ranking2')}>Ranking Regional</button>
        </nav>
        <span className="spacer" />
        <span className="whoami">{user}</span>
        <button className="btn btn-ghost btn-sm" onClick={cargarDatos}>Actualizar</button>
        <button className="btn btn-ghost btn-sm" onClick={logout}>Salir</button>
      </div>
    </div>
  )
}
