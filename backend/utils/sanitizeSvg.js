/**
 * Strict SVG Sanitizer
 * Strips executable scripts, event handlers, XXE declarations, and unsafe tags from SVG XML.
 */

export function sanitizeSvg(svgContent) {
  if (typeof svgContent !== "string") {
    throw new Error("SVG content must be a string");
  }

  let cleaned = svgContent;

  // 1. Strip DOCTYPE and XML entity declarations to protect against XXE attacks
  cleaned = cleaned.replace(/<!DOCTYPE[\s\S]*?>/gi, "");
  cleaned = cleaned.replace(/<!ENTITY[\s\S]*?>/gi, "");

  // 2. Strip <script> tags and any closing tag
  cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, "");
  cleaned = cleaned.replace(/<script[\s\S]*?>/gi, "");

  // 3. Strip dangerous tags: embed, object, iframe, foreignObject, meta, link, applet
  const dangerousTags = [
    "embed",
    "object",
    "iframe",
    "foreignObject",
    "meta",
    "link",
    "applet",
    "audio",
    "video",
    "use", // Restrict arbitrary cross-origin or complex SVG use elements
  ];

  for (const tag of dangerousTags) {
    const regexPair = new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, "gi");
    const regexSelf = new RegExp(`<${tag}[^>]*\\/?>`, "gi");
    cleaned = cleaned.replace(regexPair, "");
    cleaned = cleaned.replace(regexSelf, "");
  }

  // 4. Strip inline event handlers (onload, onerror, onclick, onmouseover, etc.)
  cleaned = cleaned.replace(/\s+on[a-z]+\s*=\s*(['"]).*?\1/gi, "");
  cleaned = cleaned.replace(/\s+on[a-z]+\s*=\s*[^"'\s>]+/gi, "");

  // 5. Strip javascript: and vbscript: URIs in xlink:href or href or style
  cleaned = cleaned.replace(/(href|xlink:href)\s*=\s*(['"])\s*(?:javascript|vbscript|data):[\s\S]*?\2/gi, "");
  cleaned = cleaned.replace(/(href|xlink:href)\s*=\s*(?:javascript|vbscript|data):[^\s>]+/gi, "");

  // 6. Ensure it contains valid root <svg element
  if (!/<svg[\s\S]*?>/i.test(cleaned)) {
    throw new Error("Invalid SVG: Root <svg> element missing or corrupted after sanitization.");
  }

  return cleaned;
}

export default sanitizeSvg;
