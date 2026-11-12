import DOMPurify from "dompurify";
import { marked } from "marked";
import mammoth from "mammoth";

export async function renderDocument(blob, type) {
  const html = type === "text/markdown"
    ? await marked.parse(await blob.text())
    : (await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() })).value;
  const content = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button"],
    FORBID_ATTR: ["style", "target"]
  });

  return `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<style>
  :root { color-scheme: light dark; font: 16px/1.65 system-ui, sans-serif; }
  body { max-width: 850px; margin: auto; padding: clamp(16px, 5vw, 56px); overflow-wrap: anywhere; }
  h1, h2, h3, h4 { line-height: 1.25; }
  pre, blockquote { margin-inline: 0; padding: 12px 16px; background: color-mix(in srgb, CanvasText 8%, Canvas); border-radius: 6px; }
  pre { overflow: auto; overflow-wrap: normal; }
  code { font-family: ui-monospace, monospace; }
  table { display: block; overflow: auto; border-collapse: collapse; }
  td, th { border: 1px solid GrayText; padding: 6px 10px; }
  img { max-width: 100%; height: auto; }
</style>
<main>${content}</main>
</html>`;
}
