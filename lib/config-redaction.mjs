// Mask sensitive configuration values before presenting revision snapshots.
// The stored revision remains intact so a restore can still use the original data.
const sensitive = /password|passwd|passphrase|secret|credential|token|authorization|(?:^|[_-])(?:api|access|private)[_-]?key(?:$|[_-])/i;
export function redactConfiguration(value) {
  if (Array.isArray(value)) return value.map(redactConfiguration);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([name, content]) => [
    name, sensitive.test(name) ? '[REDACTED]' : redactConfiguration(content)
  ]));
}
