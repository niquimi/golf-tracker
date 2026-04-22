import { useState, useEffect, useMemo } from 'react';
import {
  checkUploadPassword,
  uploadRound,
  confirmRound,
  getCourseNames,
  getOverviewStats,
} from '../services/api';

/** In = hoyos 1–9, Out = hoyos 10–18 (misma convención que Gemini/backend). */
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

function normalizeDraftPlayers(players, holes) {
  return players.map((p) => {
    const strokesPerHole = Array.from({ length: holes }, (_, i) =>
      Number.isFinite(p.strokesPerHole?.[i]) ? p.strokesPerHole[i] : 0
    );
    const { inTotal, outTotal } = computeNineTotals(strokesPerHole);
    const totalStrokes = strokesPerHole.reduce(
      (sum, v) => sum + (Number.isFinite(v) ? v : 0),
      0
    );
    return {
      ...p,
      strokesPerHole,
      totalStrokes,
      inTotal,
      outTotal,
    };
  });
}

function formatOutDisplay(outTotal, holes) {
  if (holes < 10) return '—';
  return outTotal ?? '';
}

function createEmptyDraftPlayerRow(holes) {
  const strokesPerHole = Array.from({ length: holes }, () => 0);
  const { inTotal, outTotal } = computeNineTotals(strokesPerHole);
  return {
    name: '',
    playerId: '',
    strokesPerHole,
    totalStrokes: 0,
    inTotal,
    outTotal,
    strokesOverPar: null,
  };
}

function Upload() {
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [courseName, setCourseName] = useState('');
  const [date, setDate] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null);
  const [geminiRaw, setGeminiRaw] = useState('');
  /** Nombres leídos en la tarjeta que no coinciden con jugadores dados de alta */
  const [skippedNames, setSkippedNames] = useState([]);
  const [courseNames, setCourseNames] = useState([]);
  const [playersCatalog, setPlayersCatalog] = useState([]);
  const [loadingStep, setLoadingStep] = useState('idle');
  const [entryMode, setEntryMode] = useState('photo'); // 'photo' | 'manual'

  const busy = loadingStep !== 'idle';

  useEffect(() => {
    if (!token) {
      setCourseNames([]);
      return;
    }
    let cancelled = false;
    getCourseNames()
      .then((names) => {
        if (!cancelled && Array.isArray(names)) setCourseNames(names);
      })
      .catch(() => {
        if (!cancelled) setCourseNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const overview = await getOverviewStats();
        if (!active) return;
        const list = overview?.playersAverage || [];
        const mapped = list
          .map((p) => ({
            playerId: String(p?._id || ''),
            playerName: String(p?.playerName || '').trim(),
          }))
          .filter((p) => p.playerId && p.playerName);
        mapped.sort((a, b) => a.playerName.localeCompare(b.playerName, 'es', { sensitivity: 'base' }));
        setPlayersCatalog(mapped);
      } catch {
        if (active) setPlayersCatalog([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const uniqueCourseNames = useMemo(() => {
    const seen = new Map();
    for (const n of courseNames) {
      const raw = typeof n === 'string' ? n.trim() : '';
      if (!raw) continue;
      const key = raw.toLocaleLowerCase('es');
      if (!seen.has(key)) seen.set(key, raw);
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b, 'es'));
  }, [courseNames]);

  const courseNameSuggestions = useMemo(() => {
    const q = courseName.trim().toLocaleLowerCase('es');
    if (!q) return uniqueCourseNames.slice(0, 120);
    return uniqueCourseNames
      .filter((n) => n.toLocaleLowerCase('es').includes(q))
      .slice(0, 80);
  }, [uniqueCourseNames, courseName]);

  const handleCheckPassword = async (e) => {
    e.preventDefault();
    setError('');
    setLoadingStep('password');
    setStatus('Comprobando contraseña...');
    try {
      const t = await checkUploadPassword(password);
      setToken(t);
      setStatus('Contraseña correcta. Ya puedes subir la tarjeta.');
    } catch (err) {
      setError(err.message);
      setStatus('');
    } finally {
      setLoadingStep('idle');
    }
  };

  const handleUploadRound = async (e) => {
    e.preventDefault();
    if (!token) {
      setError('Primero introduce la contraseña correcta.');
      return;
    }
    if (!courseName) {
      setError('Introduce el nombre del campo.');
      return;
    }
    setError('');
    setLoadingStep('upload');
    setStatus('Subiendo imagen y analizando la tarjeta con Gemini...');
    try {
      const res = await uploadRound({ token, imageFile, courseName, date });
      const d = res.draft;
      setSkippedNames(res.gemini?.skippedNames || []);
      setDraft({
        ...d,
        players: normalizeDraftPlayers(d.players || [], d.holes || 18),
      });
      setGeminiRaw(res.gemini?.rawText || '');
      setEntryMode('photo');
      const n = (d.players || []).length;
      if (n === 0) {
        setStatus(
          'No hay jugadores reconocidos: ningún nombre de la tarjeta coincide con un usuario registrado.'
        );
      } else {
        setStatus('Revisa y edita la tarjeta antes de guardar.');
      }
    } catch (err) {
      setError(err.message);
      setStatus('');
    } finally {
      setLoadingStep('idle');
    }
  };

  const handleCreateManualDraft = () => {
    if (!token) {
      setError('Primero introduce la contraseña correcta.');
      return;
    }
    if (!courseName) {
      setError('Introduce el nombre del campo.');
      return;
    }
    setError('');
    setSkippedNames([]);
    setGeminiRaw('');
    const holes = 18;
    setDraft({
      courseName,
      date: date || '',
      imagePath: null,
      holes,
      players: [createEmptyDraftPlayerRow(holes)],
    });
    setStatus('Borrador manual creado. Selecciona jugador(es) y rellena los golpes.');
    setEntryMode('manual');
  };

  const handleChangeStroke = (playerIndex, holeIndex, value) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const updated = { ...prev };
      const players = [...updated.players];
      const player = { ...players[playerIndex] };
      const strokesPerHole = [...player.strokesPerHole];
      const num = Number(value);
      strokesPerHole[holeIndex] = Number.isFinite(num) ? num : 0;
      player.strokesPerHole = strokesPerHole;
      player.totalStrokes = strokesPerHole.reduce(
        (sum, v) => sum + (Number.isFinite(v) ? v : 0),
        0
      );
      const { inTotal, outTotal } = computeNineTotals(strokesPerHole);
      player.inTotal = inTotal;
      player.outTotal = outTotal;
      players[playerIndex] = player;
      updated.players = players;
      return updated;
    });
  };

  const handleChangePlayer = (playerIndex, selectedPlayerId) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const updated = { ...prev };
      const players = [...(updated.players || [])];
      const player = { ...players[playerIndex] };
      const found = playersCatalog.find((p) => p.playerId === selectedPlayerId) || null;
      player.playerId = found?.playerId || '';
      player.name = found?.playerName || '';
      players[playerIndex] = player;
      updated.players = players;
      return updated;
    });
  };

  const handleAddPlayerRow = () => {
    setDraft((prev) => {
      if (!prev) return prev;
      const holes = prev.holes || 18;
      return {
        ...prev,
        players: [...(prev.players || []), createEmptyDraftPlayerRow(holes)],
      };
    });
  };

  const handleRemovePlayerRow = (playerIndex) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const nextPlayers = [...(prev.players || [])];
      nextPlayers.splice(playerIndex, 1);
      return { ...prev, players: nextPlayers };
    });
  };

  const handleConfirm = async () => {
    if (!draft) return;
    setError('');
    setLoadingStep('confirm');
    setStatus('Guardando ronda...');
    try {
      const payload = {
        courseName: draft.courseName,
        date: draft.date,
        imagePath: draft.imagePath,
        holes: draft.holes,
        players: draft.players,
      };
      await confirmRound({ token, draft: payload });
      setStatus('Ronda guardada correctamente.');
    } catch (err) {
      setError(err.message);
      setStatus('');
    } finally {
      setLoadingStep('idle');
    }
  };

  const confirming = loadingStep === 'confirm';
  const validPlayersCount = (draft?.players || []).filter((p) => (p?.name || '').trim()).length;
  const hasDraftPlayers = validPlayersCount > 0;
  const hasDraftRows = Boolean(draft?.players?.length);

  return (
    <div className="page page--upload">
      <h1>Subir tarjeta de puntuación</h1>

      <section className="upload-section">
        <p className="section-title">Acceso</p>
        <form
          onSubmit={handleCheckPassword}
          aria-busy={loadingStep === 'password'}
        >
          <label>
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={loadingStep === 'password'}
            />
          </label>
          <button type="submit" disabled={busy}>
            {loadingStep === 'password' ? (
              <>
                <span className="spinner spinner--on-primary" aria-hidden />
                Comprobando…
              </>
            ) : (
              'Entrar'
            )}
          </button>
        </form>
        {token && (
          <p className="upload-session-hint" role="status">
            Sesión iniciada: puedes completar la ronda abajo.
          </p>
        )}
      </section>

      {token && (
        <>
          <hr className="divider" />

          <section className="upload-section">
            <p className="section-title">Nueva ronda</p>
            <div className="field-row">
              <label>
                Modo
                <select
                  value={entryMode}
                  onChange={(e) => setEntryMode(e.target.value)}
                  disabled={busy}
                >
                  <option value="photo">Desde foto (Gemini)</option>
                  <option value="manual">Manual</option>
                </select>
              </label>
            </div>
            <form
              onSubmit={(e) => {
                if (entryMode !== 'photo') {
                  e.preventDefault();
                  return;
                }
                handleUploadRound(e);
              }}
              aria-busy={loadingStep === 'upload'}
            >
              <label>
                Campo
                <input
                  type="text"
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                  placeholder="Nombre del campo"
                  disabled={loadingStep === 'upload'}
                  list="upload-course-datalist"
                  autoComplete="off"
                  spellCheck={false}
                />
                <datalist id="upload-course-datalist">
                  {courseNameSuggestions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </label>

              <label>
                Fecha
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  disabled={loadingStep === 'upload'}
                />
              </label>

              <label>
                Foto de la tarjeta
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  disabled={loadingStep === 'upload' || entryMode !== 'photo'}
                />
              </label>

              {entryMode === 'photo' ? (
                <button type="submit" disabled={busy}>
                  {loadingStep === 'upload' ? (
                    <>
                      <span className="spinner spinner--on-primary" aria-hidden />
                      Subiendo…
                    </>
                  ) : (
                    'Subir ronda'
                  )}
                </button>
              ) : (
                <button type="button" disabled={busy} onClick={handleCreateManualDraft}>
                  Crear borrador manual
                </button>
              )}
            </form>
          </section>
        </>
      )}

      {draft && (
        <section className="upload-section upload-section--draft">
          <h2>Borrador de tarjeta</h2>
          <p className="last-round-date">
            Campo: <strong>{draft.courseName || courseName}</strong> · Fecha:{' '}
            <strong>{draft.date || date || '—'}</strong>
          </p>
          <p className="upload-draft-hint">
            Solo se incluyen jugadores dados de alta en la aplicación (el nombre de la tarjeta debe
            coincidir).
          </p>
          {skippedNames.length > 0 && (
            <p className="alert alert-info" role="status">
              No se han importado filas no reconocidas:{' '}
              <strong>{skippedNames.join(', ')}</strong>. Añade esos jugadores en la base de datos o
              corrige el nombre en la tarjeta y vuelve a subirla.
            </p>
          )}
          {!hasDraftPlayers && entryMode === 'photo' && (
            <p className="alert alert-info" role="status">
              No hay jugadores reconocidos en esta tarjeta. Comprueba que los nombres coincidan con
              los usuarios registrados.
            </p>
          )}
          {hasDraftRows && (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Jugador</th>
                  {Array.from({ length: draft.holes }, (_, i) => (
                    <th key={i}>{i + 1}</th>
                  ))}
                  <th>In</th>
                  <th>Out</th>
                  <th>±Par</th>
                  <th>Total</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {draft.players.map((p, pIndex) => (
                  <tr key={`row-${pIndex}-${p.playerId || p.name || 'new'}`}>
                    <td>
                      {entryMode === 'manual' ? (
                        <select
                          value={p.playerId || ''}
                          onChange={(e) => handleChangePlayer(pIndex, e.target.value)}
                          disabled={confirming}
                        >
                          <option value="">Selecciona…</option>
                          {playersCatalog.map((opt) => (
                            <option key={opt.playerId} value={opt.playerId}>
                              {opt.playerName}
                            </option>
                          ))}
                        </select>
                      ) : (
                        p.name
                      )}
                    </td>
                    {p.strokesPerHole.map((v, hIndex) => (
                      <td key={hIndex}>
                        <input
                          type="number"
                          min="1"
                          value={v}
                          onChange={(e) =>
                            handleChangeStroke(pIndex, hIndex, e.target.value)
                          }
                          disabled={confirming}
                        />
                      </td>
                    ))}
                    <td>{p.inTotal ?? ''}</td>
                    <td>{formatOutDisplay(p.outTotal, draft.holes)}</td>
                    <td>{p.strokesOverPar ?? ''}</td>
                    <td>{p.totalStrokes}</td>
                    <td>
                      {entryMode === 'manual' && (
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => handleRemovePlayerRow(pIndex)}
                          disabled={confirming || draft.players.length <= 1}
                        >
                          Quitar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}

          {draft && entryMode === 'manual' && (
            <div className="field-row">
              <button type="button" onClick={handleAddPlayerRow} disabled={confirming}>
                Añadir fila
              </button>
              {validPlayersCount === 0 && (
                <span className="inline-hint">Selecciona al menos un jugador para poder guardar.</span>
              )}
            </div>
          )}

          {geminiRaw && (
            <details className="raw-gemini">
              <summary>Ver respuesta en bruto de Gemini (TSV)</summary>
              <pre>{geminiRaw}</pre>
            </details>
          )}

          <button
            type="button"
            className="upload-confirm-btn"
            onClick={handleConfirm}
            disabled={busy || !hasDraftPlayers}
          >
            {loadingStep === 'confirm' ? (
              <>
                <span className="spinner spinner--on-primary" aria-hidden />
                Guardando…
              </>
            ) : (
              'Confirmar y guardar ronda'
            )}
          </button>
        </section>
      )}

      {status && <p className="status-msg">{status}</p>}
      {error && <p className="alert alert-error">{error}</p>}
    </div>
  );
}

export default Upload;
