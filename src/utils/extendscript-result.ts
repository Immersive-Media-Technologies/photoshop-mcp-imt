/**
 * Normalize values returned from ExtendScript via AppleScript stdout.
 * Objects are serialized with toSource() (e.g. "({ok:true,summary:\"...\"})"),
 * which is not valid JSON but is valid JavaScript object literal syntax.
 */
export function parseExtendScriptPayload(raw: unknown): unknown {
  if (raw === null || raw === undefined) return raw;
  if (typeof raw !== 'string') return raw;

  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    // Fall through to toSource parsing.
  }

  if (looksLikeExtendScriptObjectLiteral(trimmed)) {
    try {
      return new Function(`return ${trimmed}`)() as unknown;
    } catch {
      if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
        try {
          return new Function(`return ${trimmed.slice(1, -1)}`)() as unknown;
        } catch {
          // Keep raw string below.
        }
      }
    }
  }

  return trimmed;
}

function looksLikeExtendScriptObjectLiteral(value: string): boolean {
  return (
    (value.startsWith('(') && value.endsWith(')')) ||
    (value.startsWith('{') && value.endsWith('}')) ||
    (value.startsWith('[') && value.endsWith(']'))
  );
}
