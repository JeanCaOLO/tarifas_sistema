import { Routes, Route } from 'react-router-dom'
import FormularioPage from './pages/FormularioPage'
import AdminPage from './pages/AdminPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<FormularioPage />} />
      <Route path="/admin/*" element={<AdminPage />} />
    </Routes>
  )
}
