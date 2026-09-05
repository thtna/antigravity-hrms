/**
 * Security Sanitizer Utilities for XSS Defense, Input Normalization, and PII Masking
 */

const HTML_ENTITY_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
};

/**
 * Escapes HTML characters in untrusted strings to prevent XSS.
 */
export function escapeHtml(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input.replace(/[&<>"'`/]/g, (char) => HTML_ENTITY_MAP[char] || char);
}

/**
 * Strips script tags, iframe, object, embed, and javascript: pseudo-protocols
 */
export function stripDangerousTags(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, ''); // Strips inline handlers like onload=, onerror=
}

/**
 * Normalizes input string by trimming whitespace and removing control characters
 */
export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') return '';
  // Remove ASCII control characters except tab and newline
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

/**
 * PII Masking: Masks citizen ID (CCCD/CMND) - keeps first 3 and last 3 characters
 * Example: 001234567890 -> 001******890
 */
export function maskIdentityCard(idCard?: string | null): string {
  if (!idCard) return '';
  const clean = idCard.trim();
  if (clean.length <= 6) return '******';
  const prefix = clean.substring(0, 3);
  const suffix = clean.substring(clean.length - 3);
  const stars = '*'.repeat(clean.length - 6);
  return `${prefix}${stars}${suffix}`;
}

/**
 * PII Masking: Masks Bank Account Number - keeps last 4 digits
 * Example: 19034567890123 -> **********0123
 */
export function maskBankAccount(bankAccount?: string | null): string {
  if (!bankAccount) return '';
  const clean = bankAccount.trim();
  if (clean.length <= 4) return '****';
  const suffix = clean.substring(clean.length - 4);
  const stars = '*'.repeat(clean.length - 4);
  return `${stars}${suffix}`;
}

/**
 * PII Masking: Masks Phone Number - keeps first 3 and last 2 digits
 * Example: 0901234567 -> 090*****67
 */
export function maskPhoneNumber(phone?: string | null): string {
  if (!phone) return '';
  const clean = phone.trim();
  if (clean.length <= 5) return '*****';
  const prefix = clean.substring(0, 3);
  const suffix = clean.substring(clean.length - 2);
  const stars = '*'.repeat(clean.length - 5);
  return `${prefix}${stars}${suffix}`;
}
