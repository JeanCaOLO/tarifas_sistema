import { useState, useEffect, createContext, useContext } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import AdminLogin from '../components/Admin/AdminLogin'
import AdminTopbar from '../components/Admin/AdminTopbar'
import AdminRespuestas from '../components/Admin/AdminRespuestas'
import AdminDashboard from '../components/Admin/AdminDashboard'
import AdminRanking from '../components/Admin/AdminRanking'
import AdminRankingRegional from '../components/Admin/AdminRankingRegional'

export const AdminContext = createContext(null)

export default function AdminPage() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [respuestas, setRespuestas] = useState([])
  const [tarifas, setTarifas] = useState([])
  const [tab, setTab] = useState('respuestas')

  async function fetchAll(vista, orden) {
    const out = []
    const paso = 1000
    for (let desde = 0; ; desde += paso) {
      let q = supabase.from(vista).select('*').range(desde, desde + paso - 1)
      if (orden) q = q.order(orden.col, { ascending: orden.asc })
      const { data, error } = await q
      if (error) throw error
      out.push(...(data || []))
      if (!data || data.length < paso) break
    }
    return out
  }

  async function cargarDatos() {
    setLoading(true)
    try {
      const [subs, rates] = await Promise.all([
        fetchAll('v_rfp_respuestas', { col: 'created_at', asc: false }),
        fetchAll('v_rfp_tarifas', { col: 'id', asc: true })
      ])
      setRespuestas(subs)
      setTarifas(rates)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function login(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const { data: esAdmin } = await supabase.rpc('is_rfp_admin')
    if (!esAdmin) {
      await supabase.auth.signOut()
      throw new Error('Usuario no autorizado.')
    }
    setUser(email)
    await cargarDatos()
  }

  async function logout() {
    await supabase.auth.signOut()
    setUser(null)
    setRespuestas([])
    setTarifas([])
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user.email)
        cargarDatos()
      }
      setLoading(false)
    })
  }, [])

  if (!user) return <AdminLogin onLogin={login} />

  const ctx = { user, respuestas, tarifas, loading, cargarDatos, logout, tab, setTab }

  return (
    <AdminContext.Provider value={ctx}>
      <AdminTopbar />
      <div className="page">
        {loading && <div className="loading"><span className="spin" /><br />Cargando respuestas…</div>}
        {!loading && tab === 'respuestas' && <AdminRespuestas />}
        {!loading && tab === 'dashboard' && <AdminDashboard />}
        {!loading && tab === 'ranking' && <AdminRanking />}
        {!loading && tab === 'ranking2' && <AdminRankingRegional />}
      </div>
    </AdminContext.Provider>
  )
}
