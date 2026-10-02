/**
 * A Canvas description as the text a person would have typed.
 *
 * Canvas stores every description as rich-editor HTML — `<p>`, `&nbsp;`, file
 * links carrying a dozen `data-` attributes — and this app stores and shows a
 * description as plain text. Passed through unchanged, it reached the card and
 * the edit form as markup.
 *
 * A string pass rather than `DOMParser`, because this runs in both places the
 * importer does: the browser for a file, and the server for a sync, which has
 * no DOM to parse with.
 *
 * Links keep their address. A Canvas description is very often "the handout is
 * attached", and the attachment link is the one part of it the student needs.
 */

/** Text with no tag in it is somebody's own words, not markup, and is left alone. */
const LOOKS_LIKE_HTML = /<\/?[a-z][^>]*>/i;

/** Elements that start a new paragraph. Lists and table rows are handled on their own, below. */
const BLOCK =
  "address|article|aside|blockquote|dd|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|main|nav|p|pre|section|table|tbody|tfoot|thead|ul";

const BLOCK_TAG = new RegExp(`</?(?:${BLOCK})\\b[^>]*>`, "gi");

/**
 * What the Canvas rich editor actually produces. Anything else is left as
 * written. A `Map` rather than an object literal, so `&constructor;` is not
 * looked up on `Object.prototype`.
 */
const NAMED_ENTITIES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "],
  ["ndash", "–"],
  ["mdash", "—"],
  ["hellip", "…"],
  ["lsquo", "‘"],
  ["rsquo", "’"],
  ["ldquo", "“"],
  ["rdquo", "”"],
  ["bull", "•"],
  ["middot", "·"],
  ["deg", "°"],
  ["times", "×"],
  ["divide", "÷"],
  ["copy", "©"],
  ["reg", "®"],
  ["trade", "™"],
]);

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (!name.startsWith("#")) return NAMED_ENTITIES.get(name) ?? entity;

    const code = /^#x/i.test(name) ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);

    // `fromCodePoint` throws past the last code point, and a description is not
    // worth failing an import over.
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
}

/** An address written the way a person would compare it: no scheme, no trailing slash. */
const bareAddress = (address: string) =>
  decodeEntities(address)
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");

/**
 * A link's text, followed by where it goes.
 *
 * Only a web address is printed. A relative link means nothing outside Canvas,
 * and a link whose text already is its address would only say it twice.
 */
function withAddress(inner: string, href: string): string {
  if (!/^https?:\/\//i.test(href.trim())) return inner;

  const label = inner.replace(/<[^>]*>/g, "").trim();

  if (!label) return href;
  if (bareAddress(label) === bareAddress(href)) return inner;
  return `${inner} (${href})`;
}

export function plainDescription(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!LOOKS_LIKE_HTML.test(raw)) return raw.trim() || null;

  const text = raw
    // Contents and all: none of these are prose.
    .replace(/<(script|style|head|iframe|object|noscript)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    // Line breaks in HTML source mean nothing. The tags below say where lines go.
    .replace(/\s+/g, " ")
    .replace(/<a\b[^>]*?\shref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi, (_link, _quote, href, inner) =>
      withAddress(inner, href),
    )
    .replace(/<br\b[^>]*>/gi, "\n")
    // Numbered before the bullets below, so an ordered list keeps its order.
    // Lazy, so a list nested inside another numbers along with its parent —
    // rare in a description, and still readable when it happens.
    .replace(/<ol\b[^>]*>([\s\S]*?)<\/ol\s*>/gi, (_list, items: string) => {
      let number = 0;
      const numbered = items.replace(/<li\b[^>]*>/gi, () => {
        number += 1;
        return `\n${number}. `;
      });
      return `\n\n${numbered}\n\n`;
    })
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<\/t[dh]\s*>/gi, " ")
    .replace(/<tr\b[^>]*>/gi, "\n")
    .replace(BLOCK_TAG, "\n\n")
    // Whatever is left — spans, bold, images — goes, keeping its text.
    .replace(/<[^>]*>/g, "");

  return (
    decodeEntities(text)
      // `[^\S\n]` rather than a space, to catch the non-breaking ones `&#160;`
      // decodes to — the rich editor puts two after every full stop.
      .replace(/[^\S\n]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() || null
  );
}
