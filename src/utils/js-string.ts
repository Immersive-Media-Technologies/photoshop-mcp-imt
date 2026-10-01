export function jsString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    // Remaining non-ASCII-printable: C0/DEL, U+2028/U+2029 (ES3 line
    // terminators), and any other non-ASCII so Windows cscript/ANSI codepages
    // cannot mangle prompts when the generated JSX is echoed or re-read.
    .replace(/[^\x20-\x7e]/g, (ch) => {
      return '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0');
    });
}

/** Complete double-quoted ExtendScript string literal. Prefer this over interpolating `jsString` raw. */
export function jsStringLiteral(value: string): string {
  return `"${jsString(value)}"`;
}
