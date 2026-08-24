import { useState } from 'react'

export default function AdminLogin({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || !password) { setError('Escribe tu correo y contraseña.'); return }
    setLoading(true)
    setError('')
    try {
      await onLogin(email, password)
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="banner">
          <h1>Panel Administrativo</h1>
          <p>RFP 2026-2027 · Matriz de Tarifas Marítimas</p>
        </div>
        <form className="login-body" onSubmit={handleSubmit}>
          {error && <div className="login-err" style={{ display: 'block' }}>{error}</div>}
          <label>Correo</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@tuempresa.com" />
          <label>Contraseña</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Verificando…' : 'Ingresar'}
          </button>
          <p className="login-note">Acceso solo para usuarios autorizados.</p>
        </form>
      </div>
    </div>
  )
}
