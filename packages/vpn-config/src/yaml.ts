/**
 * Minimal YAML emitter for the simple config objects we render (Hysteria2 reads
 * YAML). Handles nested objects, arrays, strings, numbers and booleans — which
 * is everything our renderers produce. Avoids pulling a YAML dependency.
 */
export function toYaml(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);

  if (value === null || value === undefined) return 'null';

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value
      .map((item) => {
        if (isScalar(item)) return `${pad}- ${scalar(item)}`;
        const body = toYaml(item, indent + 1).replace(/^\s+/, '');
        return `${pad}- ${body}`;
      })
      .join('\n');
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    return entries
      .map(([k, v]) => {
        if (isScalar(v)) return `${pad}${k}: ${scalar(v)}`;
        if (Array.isArray(v) && v.length === 0) return `${pad}${k}: []`;
        if (typeof v === 'object' && v !== null && Object.keys(v).length === 0) return `${pad}${k}: {}`;
        return `${pad}${k}:\n${toYaml(v, indent + 1)}`;
      })
      .join('\n');
  }

  return scalar(value);
}

function isScalar(v: unknown): boolean {
  return v === null || ['string', 'number', 'boolean'].includes(typeof v);
}

function scalar(v: unknown): string {
  if (typeof v === 'string') {
    if (v === '' || /[:#{}\[\],&*?|<>=!%@`"']/.test(v) || /^\s|\s$/.test(v)) {
      return JSON.stringify(v);
    }
    return v;
  }
  return String(v);
}
