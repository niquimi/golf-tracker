import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import PlayerStats from './pages/PlayerStats';
import Upload from './pages/Upload';
import Rounds from './pages/Rounds';
import RoundDetail from './pages/RoundDetail';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header-inner">
            <h1 className="app-brand">Golf Tracker</h1>
            <nav aria-label="Principal">
              <ul className="app-nav">
                <li>
                  <NavLink to="/" end>
                    Dashboard
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/rondas">Rondas</NavLink>
                </li>
                <li>
                  <NavLink to="/player">Jugador</NavLink>
                </li>
                <li>
                  <NavLink to="/upload">Subir tarjeta</NavLink>
                </li>
              </ul>
            </nav>
          </div>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/rondas" element={<Rounds />} />
            <Route path="/ronda/:id" element={<RoundDetail />} />
            <Route path="/player" element={<PlayerStats />} />
            <Route path="/upload" element={<Upload />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
