export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return re.test(email);
};

export const validatePassword = (password) => {
  return password && password.length >= 6;
};

export const validatePhone = (phone) => {
  const re = /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/;
  return !phone || re.test(phone);
};

export const validateRequired = (value) => {
  return value && value.toString().trim().length > 0;
};

export const isValidPhone = (v) => /^01[3-9]\d{8}$/.test(String(v || '').trim());

export const isValidUrl = (v) => /^https?:\/\/.{3,}/.test(String(v || '').trim());

export const isValidPrice = (v) => {
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return false;
  return /^\d+(\.\d{1,2})?$/.test(String(v));
};

export const isValidQuantity = (v) => {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n >= 1 && n <= 999999;
};

export const isValidUsername = (v) => /^[a-zA-Z0-9_]{3,50}$/.test(String(v || ''));

export const isValidNid = (v) => /^(\d{10}|\d{17})$/.test(String(v || '').trim());

export const isValidZip = (v) => /^\d{4,10}$/.test(String(v || '').trim());

export const isValidDob = (v) => {
  if (!v) return false;
  const d = new Date(v);
  return !isNaN(d.getTime()) && d <= new Date();
};

export const isValidPercentage = (v) => {
  const n = Number(v);
  return isFinite(n) && n >= 0 && n <= 100;
};
