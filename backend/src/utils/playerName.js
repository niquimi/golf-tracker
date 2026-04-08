/**
 * Clave estable para identificar al mismo jugador sin importar mayúsculas/minúsculas.
 */
function normalizePlayerName(name) {
  if (typeof name !== 'string') return '';
  return name.trim().normalize('NFC').toLocaleLowerCase('es');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { normalizePlayerName, escapeRegex };
