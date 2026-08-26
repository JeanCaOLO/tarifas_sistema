import { useState, useEffect, createContext } from 'react'
import { supabase } from '../supabase'
import AdminLogin from '../components/Admin/AdminLogin'
import AdminTopbar from '../components/Admin/AdminTopbar'
import AdminRespuestas from '../components/Admin/AdminRespuestas'
import AdminDashboard from '../components/Admin/AdminDashboard'
import AdminRanking from '../components/Admin/AdminRanking'
import AdminRankingRegional from '../components/Admin/AdminRankingRegional'
import AdminRespuestasR2 from '../components/AdminR2/AdminRespuestasR2'
import AdminDashboardR2 from '../components/AdminR2/AdminDashboardR2'
import AdminRankingR2 from '../components/AdminR2/AdminRankingR2'
import AdminRankingRegionalR2 from '../components/AdminR2/AdminRankingRegionalR2'
import AdminComparativa from '../components/AdminR2/AdminComparativa'

export const AdminContext = createContext(null)

export default function AdminPage() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [respuestas, setRespuestas] = useState([])
  const [tarifas, setTarifas] = useState([])
  const [respuestasR2, setRespuestasR2] = useState([])
  const [tarifasR2, setTarifasR2] = useState([])
  const [etapa, setEtapa] = useState('1') // '1' | '2'
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
      const [subs, rates, subsR2, ratesR2] = await Promise.all([
        fetchAll('v_rfp_respuestas', { col: 'created_at', asc: false }),
        fetchAll('v_rfp_tarifas', { col: 'id', asc: true }),
        fetchAll('v_rfp_respuestas_r2', { col: 'created_at', asc: false }).catch(() => []),
        fetchAll('v_rfp_tarifas_r2', { col: 'id', asc: true }).catch(() => [])
      ])
      setRespuestas(subs)
      setTarifas(rates)
      setRespuestasR2(subsR2)
      setTarifasR2(ratesR2)
    } catch (e) {
      console.error('Error cargando datos:', e)
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
    setRespuestasR2([])
    setTarifasR2([])
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user.email)
        cargarDatos()
      }
      setChecking(false)
    }).catch(() => {
      setChecking(false)
    })
  }, [])

  // Reset tab when switching etapa if tab doesn't exist in that etapa
  function handleEtapaChange(newEtapa) {
    setEtapa(newEtapa)
    // comparativa is only available in etapa '2'
    if (newEtapa === '1' && tab === 'comparativa') {
      setTab('respuestas')
    }
  }

  // Still checking session
  if (checking) return <div className="loading"><span className="spin" /><br />Verificando sesión…</div>

  // Not logged in
  if (!user) return <AdminLogin onLogin={login} />

  const ctx = {
    user, respuestas, tarifas, respuestasR2, tarifasR2,
    loading, cargarDatos, logout, tab, setTab, etapa, setEtapa: handleEtapaChange
  }

  return (
    <AdminContext.Provider value={ctx}>
      <AdminTopbar />
      <div className="page">
        {loading && <div className="loading"><span className="spin" /><br />Cargando respuestas…</div>}

        {/* Etapa 1 tabs */}
        {!loading && etapa === '1' && tab === 'respuestas' && <AdminRespuestas />}
        {!loading && etapa === '1' && tab === 'dashboard' && <AdminDashboard />}
        {!loading && etapa === '1' && tab === 'ranking' && <AdminRanking />}
        {!loading && etapa === '1' && tab === 'ranking2' && <AdminRankingRegional />}

        {/* Etapa 2 tabs */}
        {!loading && etapa === '2' && tab === 'respuestas' && <AdminRespuestasR2 />}
        {!loading && etapa === '2' && tab === 'dashboard' && <AdminDashboardR2 />}
        {!loading && etapa === '2' && tab === 'ranking' && <AdminRankingR2 />}
        {!loading && etapa === '2' && tab === 'ranking2' && <AdminRankingRegionalR2 />}
        {!loading && etapa === '2' && tab === 'comparativa' && <AdminComparativa />}
      </div>
    </AdminContext.Provider>
  )
}
