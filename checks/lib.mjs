// Shared utilities for the deterministic check registry. No dependencies.

/** Convert a boundaries-style glob to an anchored RegExp. Supports **, *, ? */
export function globToRegExp(glob) {
  let re = '';
  let i = 0;
  while (i < glob.length) {
    if (glob.startsWith('**/', i)) { re += '(?:.*/)?'; i += 3; continue; }
    if (glob.startsWith('**', i)) { re += '.*'; i += 2; continue; }
    const ch = glob[i];
    if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else if ('.+^$()[]{}|\\'.includes(ch)) re += '\\' + ch;
    else re += ch;
    i += 1;
  }
  return new RegExp(`^${re}$`);
}

export function matchesAny(path, globs) {
  const clean = path.replace(/^\.\//, '');
  return globs.some((g) => globToRegExp(g).test(clean));
}

/**
 * Minimal JSON Schema validator covering the subset used by schemas/:
 * type, const, enum, required, properties, items, minItems, minLength, pattern.
 * Returns an array of error strings (empty = valid).
 */
export function validate(value, schema, path = '$') {
  const errors = [];
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
    return errors;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: ${JSON.stringify(value)} not in enum [${schema.enum.join(', ')}]`);
    return errors;
  }
  if (schema.type) {
    const t = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
    if (t !== schema.type) {
      errors.push(`${path}: expected ${schema.type}, got ${t}`);
      return errors;
    }
  }
  if (schema.type === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: shorter than minLength ${schema.minLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: does not match pattern ${schema.pattern}`);
    }
  }
  if (schema.type === 'array') {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path}: fewer than minItems ${schema.minItems}`);
    }
    if (schema.items) {
      value.forEach((v, i) => errors.push(...validate(v, schema.items, `${path}[${i}]`)));
    }
  }
  if (schema.type === 'object') {
    for (const key of schema.required ?? []) {
      if (value[key] === undefined) errors.push(`${path}: missing required property "${key}"`);
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (value[key] !== undefined) errors.push(...validate(value[key], sub, `${path}.${key}`));
    }
  }
  return errors;
}

/** Parse a JSONL string into an array of events, skipping blank lines. */
export function parseEvents(text) {
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l, i) => {
      try { return JSON.parse(l); }
      catch { throw new Error(`events.jsonl line ${i + 1} is not valid JSON`); }
    });
}

/** Slice events to one stage's window, or return all when stage is undefined. */
export function stageSlice(events, stage) {
  if (!stage) return events;
  const start = events.findIndex((e) => e.type === 'stage_start' && e.stage === stage);
  if (start === -1) return [];
  const end = events.findIndex((e, i) => i > start && e.type === 'stage_end' && e.stage === stage);
  return events.slice(start, end === -1 ? undefined : end + 1);
}

export const pass = (reason = 'ok') => ({ passed: true, reason });
export const fail = (reason) => ({ passed: false, reason });
