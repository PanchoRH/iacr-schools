// Shared browser/server validation. The server always repeats these checks.
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
export const MAX_REQUEST_BYTES = MAX_TOTAL_BYTES + 256 * 1024;
export const SUPPORT_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'odt', 'ods', 'csv', 'txt'];
export const FIELDS = [
  ['organizer_name', 'Contact organizer', 200],
  ['email', 'Contact email', 254],
  ['organizer_affiliation', 'Affiliation', 300],
  ['organizers', 'Organizing team', 3000],
  ['school_name', 'School name', 200],
  ['school_website', 'School website', 1000, true],
  ['topic', 'Topic and relevance to cryptology', 4000],
  ['objectives', 'Objectives and prerequisites', 4000],
  ['start_date', 'Start date', 10],
  ['end_date', 'End date', 10],
  ['city', 'City', 120],
  ['country', 'Country', 120],
  ['attendance', 'Expected attendance', 6],
  ['logistics', 'Venue, travel and accommodation', 4000],
  ['speakers', 'Speakers and confirmation status', 4000],
  ['teaching_format', 'Teaching plan', 4000],
  ['iacr_support', 'IACR funding requested, with currency', 120],
  ['budget', 'Budget and other funding', 4000],
  ['supporting_links', 'Additional links or notes', 2000, true],
];

export class ProposalError extends Error {
  constructor(message, status = 422, field = '') {
    super(message);
    this.status = status;
    this.field = field;
  }
}

export function validateFields(form) {
  const fields = {};
  for (const [name, label, max, optional] of FIELDS) {
    const values = form.getAll(name);
    if (values.length > 1 || (values.length && typeof values[0] !== 'string')) {
      throw new ProposalError(`Check ${label.toLowerCase()}.`, 422, name);
    }
    const value = (values[0] || '').trim();
    if (!value && !optional) throw new ProposalError(`Please enter ${label.toLowerCase()}.`, 422, name);
    if (value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
      throw new ProposalError(`${label} is too long or contains unsupported characters.`, 422, name);
    }
    fields[name] = value;
  }
  if (!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/u.test(fields.email)) {
    throw new ProposalError('Enter a valid contact email address.', 422, 'email');
  }
  for (const name of ['organizer_name', 'email', 'school_name', 'city', 'country', 'iacr_support']) {
    if (/[\r\n]/.test(fields[name])) throw new ProposalError('Use a single line here.', 422, name);
  }
  if (fields.school_website) {
    let url;
    try { url = new URL(fields.school_website); } catch { /* Report below. */ }
    if (!url || !['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
      throw new ProposalError('Use a complete http:// or https:// school website address.', 422, 'school_website');
    }
  }
  for (const name of ['start_date', 'end_date']) {
    const date = fields[name];
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date) {
      throw new ProposalError('Enter a valid school date.', 422, name);
    }
  }
  if (fields.end_date < fields.start_date) throw new ProposalError('The end date must be on or after the start date.', 422, 'end_date');
  if (!/^[1-9]\d{0,5}$/.test(fields.attendance)) throw new ProposalError('Enter a positive whole number for attendance.', 422, 'attendance');
  if (form.getAll('confirmation').length !== 1 || form.get('confirmation') !== 'yes') {
    throw new ProposalError('Please confirm that you have read the official policy and are ready to submit.', 422, 'confirmation');
  }
  return fields;
}

export function validateFiles(form) {
  const proposals = form.getAll('proposal_pdf').filter(file => typeof file !== 'string' && file.name);
  const supporting = form.getAll('supporting_documents').filter(file => typeof file !== 'string' && file.name);
  if (proposals.length !== 1) throw new ProposalError('Attach one proposal PDF.', 422, 'proposal_pdf');
  if (supporting.length > 4) throw new ProposalError('Choose at most four supporting documents.', 422, 'supporting_documents');
  const files = [...proposals, ...supporting];
  const names = new Set();
  let total = 0;
  for (const [index, file] of files.entries()) {
    const field = index === 0 ? 'proposal_pdf' : 'supporting_documents';
    const ext = file.name.split('.').pop().toLowerCase();
    if ((index === 0 && ext !== 'pdf') || !SUPPORT_EXTENSIONS.includes(ext)) {
      throw new ProposalError('Use a PDF for the proposal. Supporting files may be PDF, DOCX, XLSX, ODT, ODS, CSV or TXT.', 422, field);
    }
    if (file.name.length > 150 || /[\u0000-\u001f\u007f/\\\u202a-\u202e\u2066-\u2069]/u.test(file.name)) {
      throw new ProposalError('Give each attachment a short filename without slashes or control characters.', 422, field);
    }
    if (!file.size || file.size > MAX_FILE_BYTES) throw new ProposalError('Each document must be nonempty and no larger than 5 MiB.', 422, field);
    if (names.has(file.name.toLowerCase())) throw new ProposalError('Give each attachment a different filename.', 422, field);
    names.add(file.name.toLowerCase());
    total += file.size;
  }
  if (total > MAX_TOTAL_BYTES) throw new ProposalError('Keep all attachments together within 10 MiB, or submit by email.', 422, 'supporting_documents');
  return files;
}

export async function documentBytes(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = file.name.split('.').pop().toLowerCase();
  const ascii = new TextDecoder().decode(bytes.subarray(0, 5));
  if (ext === 'pdf' && ascii !== '%PDF-') throw new ProposalError(`${file.name} does not appear to be a PDF.`);
  if (['docx', 'xlsx', 'odt', 'ods'].includes(ext) &&
      !(bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4)) {
    throw new ProposalError(`${file.name} does not appear to be a supported office document.`);
  }
  if (['txt', 'csv'].includes(ext)) {
    try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new ProposalError(`Save ${file.name} as UTF-8 text, or attach it as a PDF.`); }
    if (bytes.includes(0)) throw new ProposalError(`${file.name} does not appear to be a text document.`);
  }
  // These are format checks, not malware scanning or full document parsing.
  return bytes;
}

export async function digest(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
}
