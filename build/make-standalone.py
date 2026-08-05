#!/usr/bin/env python3
"""Build `Nove PYS Prototype (standalone).html` from the DC source.

The source (`build/nove-pys-standalone-src.dc.html`) is a `<x-dc>` document that
needs the dc-runtime (`support.js`), which in turn pulls React + ReactDOM from
unpkg at runtime and the Inter webfont from Google Fonts. This script inlines all
of that so the result opens offline from `file://` with no network at all.

  python3 build/make-standalone.py

Vendored inputs live in `build/vendor/` (see build/vendor/README.md for how they
were obtained and verified).
"""

import base64
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
VENDOR = BUILD / "vendor"

SRC = BUILD / "nove-pys-standalone-src.dc.html"
SUPPORT = ROOT / "support.js"
OUT = ROOT / "Nove PYS Prototype (standalone).html"

# The exact tag in the source that pulls in the runtime; we swap the whole thing.
SUPPORT_TAG = '<script src="./support.js"></script>'

# The Google Fonts <link>s inside <helmet>. Replaced by an inlined @font-face
# block in <head> so nothing is fetched over the network.
FONT_LINKS = re.compile(
    r'[ \t]*<link rel="preconnect" href="https://fonts\.googleapis\.com"[^>]*>\n'
    r'[ \t]*<link rel="preconnect" href="https://fonts\.gstatic\.com"[^>]*>\n'
    r'[ \t]*<link href="https://fonts\.googleapis\.com/css2\?family=Inter[^"]*"[^>]*>\n'
)


def inline_js(text: str) -> str:
    """Make JS safe to embed in an inline <script>.

    `</script` inside a JS string literal would close the tag early. Escaping the
    slash is inert in JS (`"<\\/script"` == `"</script"`) but invisible to the
    HTML parser.
    """
    return text.replace("</script", r"<\/script")


def read(path: Path) -> str:
    if not path.exists():
        sys.exit(f"missing input: {path.relative_to(ROOT)}")
    return path.read_text(encoding="utf-8")


def main() -> None:
    src = read(SRC)
    support = read(SUPPORT)
    react = read(VENDOR / "react.js")
    react_dom = read(VENDOR / "react-dom.js")
    font_css = read(VENDOR / "inter-inline.css")

    if SUPPORT_TAG not in src:
        sys.exit("support.js <script> tag not found in source — did the source change?")

    # support.js can't be embedded as readable text. dc-runtime finds the root
    # template by scanning the *raw source* — first /<x-dc...>/ match to last
    # "</x-dc>" — and support.js's own error strings mention "<x-dc> block" and
    # "<helmet>". Inlined verbatim, those literals land ahead of the real <x-dc>
    # element and the runtime slices its template from the middle of its own
    # source. Base64 keeps the bytes out of the parser's way; we decode and
    # execute at load time, which matches the timing of the original
    # <script src> in <head>.
    support_b64 = base64.b64encode(support.encode("utf-8")).decode("ascii")

    # React and ReactDOM must be on `window` before support.js runs: dc-runtime's
    # loadReactUmd() short-circuits when `window.React && window.ReactDOM` are
    # already set, which is what keeps it from reaching for unpkg.
    replacement = "\n".join(
        [
            "<style>/* Inter — inlined woff2, latin + latin-ext */",
            font_css,
            "</style>",
            "<script>/* react 18.3.1 (umd, production) */",
            inline_js(react),
            "</script>",
            "<script>/* react-dom 18.3.1 (umd, production) */",
            inline_js(react_dom),
            "</script>",
            '<script id="__dc_runtime_b64" type="text/plain">',
            support_b64,
            "</script>",
            "<script>/* dc-runtime (support.js), decoded from base64 */",
            "(function () {",
            '  var b64 = document.getElementById("__dc_runtime_b64").textContent;',
            '  var bin = atob(b64.replace(/\\s+/g, ""));',
            "  var bytes = new Uint8Array(bin.length);",
            "  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);",
            '  var src = new TextDecoder("utf-8").decode(bytes);',
            '  var s = document.createElement("script");',
            "  s.textContent = src;",
            "  document.head.appendChild(s);",
            "})();",
            "</script>",
        ]
    )

    out = src.replace(SUPPORT_TAG, replacement, 1)

    out, n = FONT_LINKS.subn("", out)
    if n != 1:
        sys.exit(f"expected 1 Google Fonts link block, removed {n} — source changed?")

    # Guard the invariant the runtime depends on: the first <x-dc> in the raw
    # source must be the real element, and the last </x-dc> must be its close.
    first = re.search(r"<x-dc(?:\s[^>]*)?>", out)
    if first is None:
        sys.exit("no <x-dc> element in output")
    before = out[: first.start()]
    if "<helmet" in before or "</x-dc>" in before:
        sys.exit("a payload leaked template markup ahead of the real <x-dc> element")
    if out.count("<x-dc") != 1 or out.count("</x-dc>") != 1:
        sys.exit(
            f"expected exactly one <x-dc>…</x-dc> pair in the raw source, found "
            f"{out.count('<x-dc')} open / {out.count('</x-dc>')} close"
        )

    OUT.write_text(out, encoding="utf-8")
    print(f"wrote {OUT.name}  ({len(out.encode('utf-8')):,} bytes)")


if __name__ == "__main__":
    main()
