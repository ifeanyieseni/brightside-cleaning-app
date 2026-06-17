import { Route, Routes } from 'react-router-dom'
import PublicSite from './pages/PublicSite'
import BookingPage from './pages/BookingPage'
import AdminPage from './pages/AdminPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicSite />} />
      <Route path="/booking" element={<BookingPage />} />
      <Route path="/admin/*" element={<AdminPage />} />
    </Routes>
  )
}
