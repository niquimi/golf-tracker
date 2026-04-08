import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getCoursesStats, getOverviewStats, getRounds } from '../services/api';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function toDateKey(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateKey(key) {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Celda del calendario: mes mostrado o día fantasma (mes anterior/siguiente). Semana empieza lunes. */
function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const cells = [];

  for (let i = 0; i < startPad; i += 1) {
    const day = daysInPrevMonth - startPad + 1 + i;
    cells.push({
      kind: 'ghost',
      date: new Date(year, month - 1, day),
    });
  }
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push({
      kind: 'current',
      date: new Date(year, month, d),
    });
  }
  let nextTrailing = 1;
  /** Solo completar la última semana; no forzar 6 filas (evita muchos días fantasma al final). */
  while (cells.length % 7 !== 0) {
    cells.push({
      kind: 'ghost',
      date: new Date(year, month + 1, nextTrailing),
    });
    nextTrailing += 1;
  }
  return cells;
}

function Rounds() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const courseId = searchParams.get('courseId') || '';
  const playerId = searchParams.get('playerId') || '';
  const dateFilter = searchParams.get('date') || '';

  const [view, setView] = useState('calendar');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const p = parseDateKey(dateFilter);
    if (p) return new Date(p.getFullYear(), p.getMonth(), 1);
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  });

  const [rounds, setRounds] = useState([]);
  const [players, setPlayers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const setFilters = useCallback(
    (next) => {
      const p = new URLSearchParams(searchParams);
      if (next.courseId !== undefined) {
        if (next.courseId) p.set('courseId', next.courseId);
        else p.delete('courseId');
      }
      if (next.playerId !== undefined) {
        if (next.playerId) p.set('playerId', next.playerId);
        else p.delete('playerId');
      }
      if (next.date !== undefined) {
        if (next.date) p.set('date', next.date);
        else p.delete('date');
      }
      setSearchParams(p, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  useEffect(() => {
    let active = true;
    Promise.all([getOverviewStats(), getCoursesStats()])
      .then(([overview, coursesStats]) => {
        if (!active) return;
        const list = overview.playersAverage || [];
        setPlayers(
          [...list].sort((a, b) =>
            (a.playerName || '').localeCompare(b.playerName || '', 'es', { sensitivity: 'base' })
          )
        );
        setCourses(
          [...coursesStats].sort((a, b) =>
            (a.courseName || '').localeCompare(b.courseName || '', 'es', { sensitivity: 'base' })
          )
        );
      })
      .catch(() => {
        if (active) {
          setPlayers([]);
          setCourses([]);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getRounds({
          courseId: courseId || undefined,
          playerId: playerId || undefined,
        });
        if (active) setRounds(data);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [courseId, playerId]);

  const countsByDay = useMemo(() => {
    const map = new Map();
    for (const r of rounds) {
      const k = toDateKey(r.date);
      map.set(k, (map.get(k) || 0) + 1);
    }
    return map;
  }, [rounds]);

  const displayedRounds = useMemo(() => {
    if (!dateFilter) return rounds;
    return rounds.filter((r) => toDateKey(r.date) === dateFilter);
  }, [rounds, dateFilter]);

  /** En calendario: si la URL trae un día con una sola ronda, ir al detalle. */
  useEffect(() => {
    if (view !== 'calendar' || !dateFilter || rounds.length === 0) return;
    const list = rounds.filter((r) => toDateKey(r.date) === dateFilter);
    if (list.length === 1) {
      navigate(`/ronda/${list[0]._id}`, { replace: true });
      setFilters({ date: '' });
    }
  }, [view, dateFilter, rounds, navigate, setFilters]);

  const y = calendarMonth.getFullYear();
  const m = calendarMonth.getMonth();
  const grid = useMemo(() => buildMonthGrid(y, m), [y, m]);

  const goMonth = (delta) => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const handleDayClick = (date) => {
    if (!date) return;
    const key = toDateKey(date);
    const n = countsByDay.get(key) || 0;
    if (n === 0) return;
    if (n === 1) {
      const round = rounds.find((r) => toDateKey(r.date) === key);
      if (round) navigate(`/ronda/${round._id}`);
      return;
    }
    setFilters({ date: dateFilter === key ? '' : key });
  };

  const openRound = (id) => {
    navigate(`/ronda/${id}`);
  };

  return (
    <div className="page page--rounds">
      <h1>Rondas</h1>

      <div className="rounds-toolbar">
        <div className="field-row field-row--inline">
          <label htmlFor="filter-course">
            Campo
            <select
              id="filter-course"
              value={courseId}
              onChange={(e) => setFilters({ courseId: e.target.value })}
            >
              <option value="">Todos</option>
              {courses.map((c) => (
                <option key={String(c._id)} value={String(c._id)}>
                  {c.courseName || c._id}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="filter-player">
            Jugador
            <select
              id="filter-player"
              value={playerId}
              onChange={(e) => setFilters({ playerId: e.target.value })}
            >
              <option value="">Todos</option>
              {players.map((p) => (
                <option key={String(p._id)} value={String(p._id)}>
                  {p.playerName || p._id}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="view-toggle-wrap">
          <span className="view-toggle-label" id="rounds-view-label">
            Vista
          </span>
          <div
            className="view-toggle"
            role="group"
            aria-labelledby="rounds-view-label"
          >
            <button
              type="button"
              className={`view-toggle-btn${view === 'calendar' ? ' is-active' : ''}`}
              aria-pressed={view === 'calendar'}
              onClick={() => setView('calendar')}
            >
              Calendario
            </button>
            <button
              type="button"
              className={`view-toggle-btn${view === 'list' ? ' is-active' : ''}`}
              aria-pressed={view === 'list'}
              onClick={() => {
                setView('list');
                setFilters({ date: '' });
              }}
            >
              Lista
            </button>
          </div>
        </div>
      </div>

      {view === 'calendar' && dateFilter && displayedRounds.length > 1 && (
        <p className="rounds-date-filter-msg">
          {displayedRounds.length} rondas el{' '}
          <strong>
            {parseDateKey(dateFilter)?.toLocaleDateString('es', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </strong>
          . Elige una fila abajo o{' '}
          <button type="button" className="link-button" onClick={() => setFilters({ date: '' })}>
            quitar filtro
          </button>
        </p>
      )}

      {loading && <p className="status-msg">Cargando…</p>}
      {error && <p className="alert alert-error">Error: {error}</p>}

      {!loading && view === 'calendar' && (
        <section className="rounds-calendar-section">
          <div className="calendar-nav">
            <button type="button" className="secondary" onClick={() => goMonth(-1)}>
              ← Mes anterior
            </button>
            <span className="calendar-month-title">
              {calendarMonth.toLocaleDateString('es', { month: 'long', year: 'numeric' })}
            </span>
            <button type="button" className="secondary" onClick={() => goMonth(1)}>
              Mes siguiente →
            </button>
          </div>
          <div className="calendar-sheet">
            <div className="calendar-weekdays">
              {WEEKDAYS.map((d) => (
                <div key={d} className="calendar-wd">
                  {d}
                </div>
              ))}
            </div>
            <div className="calendar-grid">
              {grid.map((cell, idx) => {
                const { date, kind } = cell;
                const key = toDateKey(date);
                const n = countsByDay.get(key) || 0;
                const isSelected = dateFilter === key;
                const isGhost = kind === 'ghost';
                return (
                  <button
                    key={`${key}-${idx}`}
                    type="button"
                    className={`calendar-cell${isGhost ? ' calendar-cell--ghost' : ''}${n ? ' calendar-cell--has-rounds' : ''}${isSelected ? ' calendar-cell--selected' : ''}`}
                    onClick={() => handleDayClick(date)}
                    disabled={n === 0}
                    title={n ? `${n} ronda(s)` : 'Sin rondas'}
                  >
                    <span className="calendar-day-num">{date.getDate()}</span>
                    {n > 0 && <span className="calendar-dot">{n}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="calendar-hint">
            Un día con una sola ronda abre el detalle. Si hay varias el mismo día, elige abajo.
          </p>
        </section>
      )}

      {!loading && view === 'list' && (
        <section>
          <p className="section-title">Todas las rondas</p>
          {rounds.length === 0 ? (
            <p className="empty-hint">No hay rondas que mostrar.</p>
          ) : (
            <div className="rounds-table-wrap">
              <table className="rounds-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Campo</th>
                    <th>Jugadores</th>
                  </tr>
                </thead>
                <tbody>
                  {rounds.map((r) => (
                    <tr
                      key={r._id}
                      className="rounds-table__click-row"
                      onClick={() => openRound(r._id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openRound(r._id);
                        }
                      }}
                      tabIndex={0}
                      role="link"
                    >
                      <td>
                        {new Date(r.date).toLocaleDateString('es', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td>{r.course?.name ?? '—'}</td>
                      <td>
                        {r.players?.map((p) => p.player?.name).filter(Boolean).join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {!loading && view === 'calendar' && dateFilter && displayedRounds.length > 1 && (
        <section>
          <p className="section-title">Varias rondas este día</p>
          <div className="rounds-table-wrap">
            <table className="rounds-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Campo</th>
                  <th>Jugadores</th>
                </tr>
              </thead>
              <tbody>
                {displayedRounds.map((r) => (
                  <tr
                    key={r._id}
                    className="rounds-table__click-row"
                    onClick={() => openRound(r._id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openRound(r._id);
                      }
                    }}
                    tabIndex={0}
                    role="link"
                  >
                    <td>
                      {new Date(r.date).toLocaleDateString('es', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td>{r.course?.name ?? '—'}</td>
                    <td>
                      {r.players?.map((p) => p.player?.name).filter(Boolean).join(', ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

export default Rounds;
