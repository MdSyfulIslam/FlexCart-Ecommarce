/**
 * Normalize a file path returned by multer to a URL-safe relative path.
 *
 * - If the path is already a full URL (Cloudinary / http/https), return it as-is.
 * - If the path is an absolute OS path produced by multer diskStorage
 *   (e.g. /opt/render/project/src/uploads/companies/logo.jpg),
 *   extract the /uploads/... portion so it can be served by express.static.
 */
const normalizeFilePath = (filePath) => {
  if (!filePath) return null;

  // Cloudinary or any external URL — keep as-is
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return filePath;
  }

  // Normalise backslashes (Windows dev environment)
  const normalized = filePath.replace(/\\/g, '/');

  // Extract from /uploads/ onwards
  const idx = normalized.indexOf('/uploads/');
  if (idx !== -1) {
    return normalized.slice(idx);
  }

  // Fallback: if none of the above matched, return as-is
  return filePath;
};

module.exports = { normalizeFilePath };
