import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOverviewStats, getCoursesStats } from '../services/api';

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function playerLabel(p) {
  return p.playerName || String(p._id);
}

function courseLabel(c) {
  return c.courseName || String(c._id);
}

function Dashboard() {
  const [data, setData] = useState(null);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([getOverviewStats(), getCoursesStats()])
      .then(([overview, coursesStats]) => {
        setData(overview);
        setCourses(coursesStats);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const lastRoundPodium = useMemo(() => {
    if (!data?.lastRound?.players?.length) return [];
    return [...data.lastRound.players].sort((a, b) => a.totalStrokes - b.totalStrokes);
  }, [data]);

  if (loading) {
    return (
      <div className="page">
        <p className="loading-screen">Cargando estadísticas…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="page">
        <p className="alert alert-error">Error: {error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="page">
        <p className="empty-hint">Sin datos todavía.</p>
      </div>
    );
  }

  const { totalRounds, lastRound, playersAverage } = data;

  return (
    <div className="page">
      <h1>Dashboard</h1>

      <section>
        <p className="section-title">Resumen</p>
        <div className="stat-hero">
          <span className="stat-hero-value">{totalRounds}</span>
          <span className="stat-hero-label">rondas registradas en total</span>
        </div>
      </section>

      {lastRound && (
        <section>
          <p className="section-title">
            Última ronda{' '}
            <Link to={`/ronda/${lastRound._id}`} className="section-title-link">
              Ver detalle
            </Link>
          </p>
          <p className="last-round-date">
            {new Date(lastRound.date).toLocaleDateString('es', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}{' '}
            · <strong>{lastRound.course?.name}</strong>
          </p>
          {lastRoundPodium.length >= 2 ? (
            <>
              <div className="score-rows score-rows--podium">
                {lastRoundPodium.map((p, idx) => (
                  <div key={p.player._id} className="score-row score-row--podium">
                    <span className="podium-rank" aria-label={`Puesto ${idx + 1}`}>
                      {idx + 1}
                    </span>
                    <span className="score-row-name">{p.player.name}</span>
                    <span className="score-row-val">{p.totalStrokes} golpes</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="score-rows">
              {lastRoundPodium.map((p) => (
                <div key={p.player._id} className="score-row">
                  <span className="score-row-name">{p.player.name}</span>
                  <span className="score-row-val">{p.totalStrokes} golpes</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <p className="section-title">Media de golpes por jugador</p>
        {playersAverage.length === 0 ? (
          <p className="empty-hint">Aún no hay jugadores con rondas.</p>
        ) : (
          <div className="card-grid">
            {playersAverage.map((p) => (
              <div key={p._id} className="player-card">
                <div className="avatar" aria-hidden="true">
                  {initials(playerLabel(p))}
                </div>
                <div className="card-body">
                  <p className="card-name">{playerLabel(p)}</p>
                  <p className="card-meta">{p.rounds} rondas contadas</p>
                  <p className="card-stat">
                    {p.avgStrokes != null ? p.avgStrokes.toFixed(1) : '—'} media
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <p className="section-title">Campos</p>
        {courses.length === 0 ? (
          <p className="empty-hint">Todavía no hay estadísticas de campos.</p>
        ) : (
          <div className="card-grid">
            {courses.map((c) => (
              <div key={c._id} className="course-card">
                <div className="avatar" aria-hidden="true">
                  {initials(courseLabel(c))}
                </div>
                <div className="card-body">
                  <p className="card-name">{courseLabel(c)}</p>
                  <p className="card-meta">{c.rounds} rondas</p>
                  <p className="card-stat">
                    {c.avgStrokes != null ? c.avgStrokes.toFixed(1) : '—'} media
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default Dashboard;
