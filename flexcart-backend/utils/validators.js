'use strict';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const BD_PHONE_RE = /^01[3-9]\d{8}$/;
const URL_RE = /^https?:\/\/.{3,}/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,50}$/;
const NID_RE = /^(\d{10}|\d{17})$/;
const PRICE_RE = /^\d+(\.\d{1,2})?$/;

function isValidEmail(v) {
  return typeof v === 'string' && EMAIL_RE.test(v.trim());
}

function isValidPhone(v) {
  return typeof v === 'string' && BD_PHONE_RE.test(v.trim());
}

function isValidUrl(v) {
  if (typeof v !== 'string') return false;
  return URL_RE.test(v.trim());
}

function isValidPrice(v) {
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return false;
  return PRICE_RE.test(String(v));
}

function isValidQuantity(v) {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n >= 0 && n <= 999999;
}

function isValidSalary(v) {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n > 0;
}

function isValidUsername(v) {
  return typeof v === 'string' && USERNAME_RE.test(v);
}

function isValidNid(v) {
  return typeof v === 'string' && NID_RE.test(v.trim());
}

function isValidPercentage(v) {
  const n = Number(v);
  return isFinite(n) && n >= 0 && n <= 100;
}

function sanitizeString(v) {
  if (typeof v !== 'string') return '';
  return v.trim().replace(/\s+/g, ' ');
}

module.exports = {
  isValidEmail,
  isValidPhone,
  isValidUrl,
  isValidPrice,
  isValidQuantity,
  isValidSalary,
  isValidUsername,
  isValidNid,
  isValidPercentage,
  sanitizeString,
};
