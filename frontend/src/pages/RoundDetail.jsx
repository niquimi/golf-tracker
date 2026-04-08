import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getRound, resolveUploadUrl } from '../services/api';

function computeNineTotals(strokesPerHole) {
  const arr = Array.isArray(strokesPerHole) ? strokesPerHole : [];
  const n = arr.length;
  let inTotal = 0;
  for (let i = 0; i < Math.min(9, n); i += 1) {
    const v = arr[i];
    inTotal += Number.isFinite(v) ? v : 0;
  }
  let outTotal = 0;
  for (let i = 9; i < n; i += 1) {
    const v = arr[i];
    outTotal += Number.isFinite(v) ? v : 0;
  }
  return { inTotal, outTotal };
}

function formatOutDisplay(outTotal, holes) {
  if (holes < 10) return '—';
  return outTotal ?? '—';
}

function RoundDetail() {
  const { id } = useParams();
  const [round, setRound] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getRound(id);
        if (active) setRound(data);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="page">
        <p className="loading-screen">Cargando ronda…</p>
      </div>
    );
  }
  if (error || !round) {
    return (
      <div className="page">
        <p className="alert alert-error">{error || 'Ronda no encontrada'}</p>
        <p>
          <Link to="/rondas">Volver a rondas</Link>
        </p>
      </div>
    );
  }

  const holes = Math.max(
    ...round.players.map((p) => p.strokesPerHole?.length || 0),
    1
  );
  const imgSrc = resolveUploadUrl(round.imageUrl);

  return (
    <div className="page page--round-detail">
      <p className="section-title">
        <Link to="/rondas">Rondas</Link>
      </p>
      <h1>Ronda</h1>
      <p className="last-round-date">
        {new Date(round.date).toLocaleDateString('es', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}{' '}
        · <strong>{round.course?.name}</strong>
      </p>

      {imgSrc && (
        <div className="round-detail-image-wrap">
          <img
            src={imgSrc}
            alt=""
            className="round-detail-image"
          />
        </div>
      )}

      <section>
        <p className="section-title">Tarjeta</p>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Jugador</th>
                {Array.from({ length: holes }, (_, i) => (
                  <th key={i}>{i + 1}</th>
                ))}
                <th>In</th>
                <th>Out</th>
                <th>±Par</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {round.players.map((p) => {
                const { inTotal, outTotal } = computeNineTotals(p.strokesPerHole);
                return (
                  <tr key={String(p.player._id || p.player)}>
                    <td>{p.player?.name ?? '—'}</td>
                    {Array.from({ length: holes }, (_, hIndex) => (
                      <td key={hIndex}>{p.strokesPerHole?.[hIndex] ?? '—'}</td>
                    ))}
                    <td>{inTotal}</td>
                    <td>{formatOutDisplay(outTotal, holes)}</td>
                    <td>{p.strokesOverPar ?? '—'}</td>
                    <td>{p.totalStrokes}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default RoundDetail;
