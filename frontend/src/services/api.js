export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

/** URL absoluta para imágenes servidas en /uploads (p. ej. round.imageUrl). */
export function resolveUploadUrl(imageUrl) {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('http')) return imageUrl;
  const base = API_BASE_URL.replace(/\/$/, '');
  const p = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
  return `${base}${p}`;
}

export async function checkUploadPassword(password) {
  const res = await fetch(`${API_BASE_URL}/auth/check-upload-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    throw new Error('Contraseña incorrecta');
  }
  const data = await res.json();
  return data.token;
}

export async function uploadRound({ token, imageFile, courseName, date }) {
  const formData = new FormData();
  if (imageFile) formData.append('image', imageFile);
  formData.append('courseName', courseName);
  if (date) formData.append('date', date);

  const res = await fetch(`${API_BASE_URL}/rounds/upload`, {
    method: 'POST',
    headers: {
      'x-upload-token': token,
    },
    body: formData,
  });

  if (!res.ok) {
    throw new Error('Error subiendo la ronda');
  }
  return res.json();
}

export async function confirmRound({ token, draft }) {
  const res = await fetch(`${API_BASE_URL}/rounds/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-upload-token': token,
    },
    body: JSON.stringify(draft),
  });

  if (!res.ok) {
    let msg = 'Error guardando la ronda';
    try {
      const body = await res.json();
      if (body.error) msg = body.error;
      if (Array.isArray(body.unknownNames) && body.unknownNames.length > 0) {
        msg = `${msg}: ${body.unknownNames.join(', ')}`;
      }
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function getOverviewStats() {
  const res = await fetch(`${API_BASE_URL}/stats/overview`);
  if (!res.ok) throw new Error('Error obteniendo estadísticas');
  return res.json();
}

export async function getPlayerStats(playerId) {
  const res = await fetch(`${API_BASE_URL}/stats/player/${playerId}`);
  if (!res.ok) throw new Error('Error obteniendo estadísticas de jugador');
  return res.json();
}

export async function getCoursesStats() {
  const res = await fetch(`${API_BASE_URL}/stats/courses`);
  if (!res.ok) throw new Error('Error obteniendo estadísticas de campos');
  return res.json();
}

/** Nombres de todos los campos guardados en BD (orden alfabético). */
export async function getCourseNames() {
  const res = await fetch(`${API_BASE_URL}/stats/course-names`);
  if (!res.ok) throw new Error('Error obteniendo campos');
  return res.json();
}

export async function getRounds({ courseId, playerId } = {}) {
  const params = new URLSearchParams();
  if (courseId) params.set('courseId', courseId);
  if (playerId) params.set('playerId', playerId);
  const q = params.toString();
  const res = await fetch(`${API_BASE_URL}/rounds${q ? `?${q}` : ''}`);
  if (!res.ok) throw new Error('Error obteniendo rondas');
  return res.json();
}

export async function getRound(id) {
  const res = await fetch(`${API_BASE_URL}/rounds/${id}`);
  if (res.status === 404) throw new Error('Ronda no encontrada');
  if (!res.ok) throw new Error('Error obteniendo la ronda');
  return res.json();
}


