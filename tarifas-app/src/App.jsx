import { Routes, Route } from 'react-router-dom'
import FormularioPage from './pages/FormularioPage'
import FormularioR2Page from './pages/FormularioR2Page'
import AdminPage from './pages/AdminPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<FormularioPage />} />
      <Route path="/ronda2" element={<FormularioR2Page />} />
      <Route path="/admin/*" element={<AdminPage />} />
    </Routes>
  )
}
