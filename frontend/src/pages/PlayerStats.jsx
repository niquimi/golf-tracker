import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPlayerStats, getOverviewStats } from '../services/api';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function fmtNum(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toFixed(digits);
}

/** Escala fija del gráfico «Media por número de hoyo» (golpes de media). */
const HOLE_CHART_Y_MIN = 1;
const HOLE_CHART_Y_MAX = 10;

function holeBarHeightPercent(avgStrokes) {
  const v = Math.min(
    HOLE_CHART_Y_MAX,
    Math.max(HOLE_CHART_Y_MIN, Number(avgStrokes) || HOLE_CHART_Y_MIN)
  );
  return ((v - HOLE_CHART_Y_MIN) / (HOLE_CHART_Y_MAX - HOLE_CHART_Y_MIN)) * 100;
}

function PlayerStats() {
  const navigate = useNavigate();
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [playerList, setPlayerList] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [courseId, setCourseId] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const overview = await getOverviewStats();
        if (!active) return;
        const list = overview.playersAverage || [];
        const sorted = [...list].sort((a, b) =>
          (a.playerName || '').localeCompare(b.playerName || '', 'es', { sensitivity: 'base' })
        );
        setPlayerList(sorted);
        if (sorted.length > 0) {
          setSelectedPlayerId(String(sorted[0]._id));
        }
      } catch {
        // sin datos de overview
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedPlayerId) return;
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getPlayerStats(selectedPlayerId);
        if (active) setData(res);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedPlayerId]);

  const analytics = data?.analytics;

  useEffect(() => {
    if (!analytics?.courses?.length) {
      setCourseId('');
      return;
    }
    const preferred = [...analytics.courses].sort((a, b) => b.roundsOnCourse - a.roundsOnCourse)[0];
    setCourseId(preferred.courseId);
  }, [analytics, selectedPlayerId]);

  const sortedPlayers = useMemo(
    () =>
      [...playerList].sort((a, b) =>
        (a.playerName || '').localeCompare(b.playerName || '', 'es', { sensitivity: 'base' })
      ),
    [playerList]
  );

  const selectedName =
    sortedPlayers.find((p) => String(p._id) === selectedPlayerId)?.playerName || null;

  const selectedCourse = useMemo(() => {
    if (!analytics?.courses?.length || !courseId) return null;
    return analytics.courses.find((c) => c.courseId === courseId) || null;
  }, [analytics, courseId]);

  const movingChart = useMemo(() => {
    const pts = analytics?.movingAveragePoints || [];
    if (pts.length < 2) return null;
    const totals = pts.map((p) => p.totalStrokes);
    const mas = pts.map((p) => p.movingAvg).filter((x) => x != null);
    const hi = Math.max(...totals, ...mas, 1);
    const lo = Math.min(...totals, ...mas);
    const pad = Math.max(1, (hi - lo) * 0.08);
    return { pts, yMin: lo - pad, yMax: hi + pad };
  }, [analytics]);

  return (
    <div className="page">
      <h1>Estadísticas por jugador</h1>

      <div className="field-row">
        <label htmlFor="player-select">
          Jugador
          <select
            id="player-select"
            value={selectedPlayerId}
            onChange={(e) => setSelectedPlayerId(e.target.value)}
          >
            <option value="">Selecciona un jugador</option>
            {sortedPlayers.map((p) => (
              <option key={String(p._id)} value={String(p._id)}>
                {p.playerName || String(p._id)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedName && (
        <p className="status-msg">
          Mostrando estadísticas de <strong>{selectedName}</strong>
        </p>
      )}

      {loading && <p className="status-msg">Cargando…</p>}
      {error && <p className="alert alert-error">Error: {error}</p>}

      {data && !loading && data.rounds.length > 0 && (
        <>
          {analytics ? (
            <>
              <section>
                <p className="section-title">Rendimiento</p>
                <div className="stat-grid-rendimiento">
                  <div className="stat-chip">
                    <span className="stat-chip-label">Media global</span>
                    <span className="stat-chip-value">{fmtNum(analytics.globalMean)}</span>
                  </div>
                  <div className="stat-chip">
                    <span className="stat-chip-label">Media golpes/hoyo</span>
                    <span className="stat-chip-value">{fmtNum(analytics.avgStrokesPerHole)}</span>
                  </div>
                  <div className="stat-chip">
                    <span className="stat-chip-label">Dispersión (σ)</span>
                    <span className="stat-chip-value">{fmtNum(analytics.stdDevTotals)}</span>
                  </div>
                  <div className="stat-chip">
                    <span className="stat-chip-label">Media móvil</span>
                    <span className="stat-chip-value">{fmtNum(analytics.movingAverageLast)}</span>
                  </div>
                  <div className="stat-chip">
                    <span className="stat-chip-label">Racha</span>
                    <span className="stat-chip-value">{analytics.streakBelowPersonalMean}</span>
                  </div>
                </div>
              </section>

          <section>
            <p className="section-title">Mejor y peor ronda</p>
            <div className="best-worst-grid">
              <div className="bw-card bw-card--best">
                <p className="bw-title">Mejor</p>
                {analytics.bestRound ? (
                  <>
                    <p className="bw-score">{analytics.bestRound.totalStrokes} golpes</p>
                    <p className="bw-meta">{fmtDate(analytics.bestRound.date)}</p>
                    <p className="bw-meta">{analytics.bestRound.courseName || '—'}</p>
                  </>
                ) : (
                  <p className="empty-hint">—</p>
                )}
              </div>
              <div className="bw-card bw-card--worst">
                <p className="bw-title">Peor</p>
                {analytics.worstRound ? (
                  <>
                    <p className="bw-score">{analytics.worstRound.totalStrokes} golpes</p>
                    <p className="bw-meta">{fmtDate(analytics.worstRound.date)}</p>
                    <p className="bw-meta">{analytics.worstRound.courseName || '—'}</p>
                  </>
                ) : (
                  <p className="empty-hint">—</p>
                )}
              </div>
            </div>
          </section>

          <section>
            <p className="section-title">Salida y vuelta</p>
            <p className="split-line">
              <strong>Media salida:</strong> {fmtNum(analytics.splitAverages.out)} ·{' '}
              <strong>Media vuelta:</strong> {fmtNum(analytics.splitAverages.in)}
            </p>
          </section>

          <section>
            <p className="section-title">Golpes bajo par</p>
            <div className="stat-grid-2">
              <div className="stat-chip">
                <span className="stat-chip-label">Birdies</span>
                <span className="stat-chip-value">{analytics.par3Assumed.birdiesTotal}</span>
              </div>
              <div className="stat-chip">
                <span className="stat-chip-label">Hoyos en uno</span>
                <span className="stat-chip-value">{analytics.par3Assumed.holesInOneTotal}</span>
              </div>
            </div>
          </section>

          <section>
            <p className="section-title">Top 3 hoyos más caros y más baratos</p>
            {(analytics.top3HolesMostExpensive?.length || analytics.top3HolesMostCheapest?.length) ? (
              <div className="holes-rank-grid">
                <div className="holes-rank-col">
                  <p className="holes-rank-subtitle">Más caros</p>
                  <div className="table-scroll">
                    <table className="data-table data-table--wide data-table--holes-rank">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Campo</th>
                          <th>Hoyo</th>
                          <th>Media</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(analytics.top3HolesMostExpensive || []).map((h, idx) => (
                          <tr key={`e-${h.courseId}-${h.hole}-${idx}`}>
                            <td>{idx + 1}</td>
                            <td>{h.courseName}</td>
                            <td>{h.hole}</td>
                            <td>
                              {fmtNum(h.avgStrokes)}{' '}
                              <span className="hole-n-samples">({h.count})</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="holes-rank-col">
                  <p className="holes-rank-subtitle">Más baratos</p>
                  <div className="table-scroll">
                    <table className="data-table data-table--wide data-table--holes-rank">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Campo</th>
                          <th>Hoyo</th>
                          <th>Media</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(analytics.top3HolesMostCheapest || []).map((h, idx) => (
                          <tr key={`c-${h.courseId}-${h.hole}-${idx}`}>
                            <td>{idx + 1}</td>
                            <td>{h.courseName}</td>
                            <td>{h.hole}</td>
                            <td>
                              {fmtNum(h.avgStrokes)}{' '}
                              <span className="hole-n-samples">({h.count})</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <p className="empty-hint">Sin datos de golpes por hoyo.</p>
            )}
          </section>

          <section>
            <p className="section-title">Por campo: curva, nemesis y aliado</p>
            {analytics.courses.length === 0 ? (
              <p className="empty-hint">Sin datos por campo.</p>
            ) : (
              <>
                <div className="field-row">
                  <label htmlFor="course-select">
                    Campo
                    <select
                      id="course-select"
                      value={courseId}
                      onChange={(e) => setCourseId(e.target.value)}
                    >
                      {analytics.courses.map((c) => (
                        <option key={c.courseId} value={c.courseId}>
                          {c.courseName} ({c.roundsOnCourse} rondas)
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {selectedCourse && (
                  <>
                    <div className="nemesis-row">
                      <div className="nemesis-card">
                        <span className="nemesis-label">Hoyo nemesis</span>
                        {selectedCourse.nemesis ? (
                          <p className="nemesis-body">
                            Hoyo <strong>{selectedCourse.nemesis.hole}</strong> · media{' '}
                            {fmtNum(selectedCourse.nemesis.avgStrokes)} (
                            {selectedCourse.nemesis.diffFromCourseMean >= 0 ? '+' : ''}
                            {fmtNum(selectedCourse.nemesis.diffFromCourseMean)} vs media del campo)
                          </p>
                        ) : (
                          <p className="empty-hint">—</p>
                        )}
                      </div>
                      <div className="nemesis-card nemesis-card--ally">
                        <span className="nemesis-label">Hoyo aliado</span>
                        {selectedCourse.ally ? (
                          <p className="nemesis-body">
                            Hoyo <strong>{selectedCourse.ally.hole}</strong> · media{' '}
                            {fmtNum(selectedCourse.ally.avgStrokes)} (
                            {selectedCourse.ally.diffFromCourseMean >= 0 ? '+' : ''}
                            {fmtNum(selectedCourse.ally.diffFromCourseMean)} vs media del campo)
                          </p>
                        ) : (
                          <p className="empty-hint">—</p>
                        )}
                      </div>
                    </div>

                    <p className="section-sub">Media por número de hoyo en este campo</p>
                    {selectedCourse.holeCurve.length === 0 ? (
                      <p className="empty-hint">Sin datos de golpes por hoyo en este campo.</p>
                    ) : (
                      <div
                        className="hole-bar-chart-block"
                        role="img"
                        aria-label={`Media de golpes por hoyo, escala ${HOLE_CHART_Y_MIN} a ${HOLE_CHART_Y_MAX}`}
                      >
                        <div className="hole-bar-y-axis" aria-hidden="true">
                          {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => (
                            <span key={n} className="hole-bar-y-tick">
                              {n}
                            </span>
                          ))}
                        </div>
                        <div className="hole-bar-chart-main">
                          <div className="hole-bar-chart">
                            {selectedCourse.holeCurve.map((h) => (
                              <div key={h.hole} className="hole-bar-wrap">
                                <div className="hole-bar-area">
                                  <div
                                    className="hole-bar"
                                    style={{
                                      height: `${holeBarHeightPercent(h.avgStrokes)}%`,
                                    }}
                                    title={`Hoyo ${h.hole}: ${fmtNum(h.avgStrokes)} golpes (media)`}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="hole-bar-x-labels">
                            {selectedCourse.holeCurve.map((h) => (
                              <span key={h.hole} className="hole-bar-label">
                                {h.hole}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </section>

          <section>
            <p className="section-title">Índice de dificultad relativa (por campo)</p>
            <div className="table-scroll">
              <table className="data-table data-table--wide">
                <thead>
                  <tr>
                    <th>Campo</th>
                    <th>Media campo (todos)</th>
                    <th>Tu media global</th>
                    <th>Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.courses.map((c) => (
                    <tr key={c.courseId}>
                      <td>{c.courseName}</td>
                      <td>
                        {c.relativeDifficulty?.fieldAvgOnCourse != null
                          ? fmtNum(c.relativeDifficulty.fieldAvgOnCourse)
                          : '—'}
                      </td>
                      <td>
                        {c.relativeDifficulty?.playerGlobalAvg != null
                          ? fmtNum(c.relativeDifficulty.playerGlobalAvg)
                          : '—'}
                      </td>
                      <td>
                        {c.relativeDifficulty?.difference != null
                          ? `${c.relativeDifficulty.difference >= 0 ? '+' : ''}${fmtNum(c.relativeDifficulty.difference)}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

              {movingChart && (
                <section>
                  <p className="section-title">Tendencia: golpes y media móvil</p>
                  <div className="ma-chart-wrap">
                    <svg
                      className="ma-chart"
                      viewBox="0 0 100 40"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <polyline
                        className="ma-line ma-line--total"
                        fill="none"
                        strokeWidth="0.6"
                        points={movingChart.pts
                          .map((p, i) => {
                            const x = (i / (movingChart.pts.length - 1)) * 100;
                            const y =
                              40 -
                              ((p.totalStrokes - movingChart.yMin) /
                                (movingChart.yMax - movingChart.yMin || 1)) *
                                36 -
                              2;
                            return `${x},${y}`;
                          })
                          .join(' ')}
                      />
                      <polyline
                        className="ma-line ma-line--ma"
                        fill="none"
                        strokeWidth="0.5"
                        points={movingChart.pts
                          .map((p, i) => {
                            const x = (i / (movingChart.pts.length - 1)) * 100;
                            const v = p.movingAvg ?? p.totalStrokes;
                            const y =
                              40 -
                              ((v - movingChart.yMin) / (movingChart.yMax - movingChart.yMin || 1)) *
                                36 -
                              2;
                            return `${x},${y}`;
                          })
                          .join(' ')}
                      />
                    </svg>
                    <div className="ma-legend">
                      <span className="ma-legend-item">
                        <span className="ma-dot ma-dot--total" /> Golpes
                      </span>
                      <span className="ma-legend-item">
                        <span className="ma-dot ma-dot--ma" /> Media móvil
                      </span>
                    </div>
                  </div>
                </section>
              )}
            </>
          ) : (
            <section>
              <p className="alert alert-error">
                No se pudieron calcular las estadísticas avanzadas para este jugador.
              </p>
            </section>
          )}

          <section>
            <h2>Rondas</h2>
            <p className="rounds-hint">
              <button
                type="button"
                className="link-button"
                onClick={() =>
                  navigate(`/rondas?playerId=${encodeURIComponent(selectedPlayerId)}`)
                }
              >
                Ver todas en calendario / lista
              </button>
            </p>
            <div className="rounds-table-wrap">
              <table className="rounds-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Campo</th>
                    <th>Golpes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rounds.map((r) => {
                    const row = r.players.find((p) => String(p.player._id) === selectedPlayerId);
                    return (
                      <tr
                        key={r._id}
                        className="rounds-table__click-row"
                        onClick={() => navigate(`/ronda/${r._id}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            navigate(`/ronda/${r._id}`);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                      >
                        <td>
                          {new Date(r.date).toLocaleDateString('es', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td>{r.course?.name}</td>
                        <td>{row?.totalStrokes ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {data && !loading && data.rounds.length === 0 && (
        <section>
          <h2>Rondas</h2>
          <p className="empty-hint">Este jugador aún no tiene rondas.</p>
        </section>
      )}
    </div>
  );
}

export default PlayerStats;
