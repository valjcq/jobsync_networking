// Task descriptions are Tiptap HTML, so an "empty" one is "" or "<p></p>"
const EXCERPT_MAX_LENGTH = 200;

export function toPlainText(html?: string | null): string {
  if (!html) return "";

  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasDescription(html?: string | null): boolean {
  return toPlainText(html).length > 0;
}

export function getDescriptionExcerpt(html?: string | null): string {
  const text = toPlainText(html);
  if (text.length <= EXCERPT_MAX_LENGTH) return text;

  return `${text.slice(0, EXCERPT_MAX_LENGTH).trimEnd()}…`;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Plain text in (from an MCP agent), Tiptap HTML out: one <p> per paragraph,
// single line breaks kept as <br>. Escaped, so nothing typed can inject markup.
export function plainTextToHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}
