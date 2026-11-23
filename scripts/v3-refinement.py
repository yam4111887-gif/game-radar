#!/usr/bin/env python3
"""
v3 refinement pass — game-radar style.css (+2 inline styles in index/steam html)
Fixes the three measured amateur tells:
  1. Type ladder collapse (22 sizes → 6 rungs; h2 18.5px → 25px)
  2. Radius chaos (30+ hardcodes → 8/16/999 scale)
  3. Decoration density (gradient on 27 elements → focal-only; kill glow-on-decoration)
Weights 400/500/600/700/800 → 400/600/700.
Idempotent: re-running produces no further changes.
"""
import re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
css_path = ROOT / "style.css"
css = css_path.read_text()

# ---------- 1. font-size ladder ----------
# ordered longest-first so prefixes can't collide
SIZE_MAP = [
    (".845rem", ".875rem"), (".855rem", ".875rem"),
    (".84rem", ".875rem"), (".85rem", ".875rem"), (".86rem", ".875rem"),
    (".88rem", ".875rem"), (".9rem", "1rem"),
    (".74rem", ".8125rem"), (".76rem", ".8125rem"), (".78rem", ".8125rem"),
    (".82rem", ".8125rem"), (".8rem", ".8125rem"), (".7rem", ".8125rem"),
    (".92rem", "1rem"), (".95rem", "1rem"), (".98rem", "1rem"),
    ("1.02rem", "1rem"), ("1.08rem", "1rem"),
    ("1.14rem", "1.5625rem"), ("1.16rem", "1.5625rem"),
    ("1.66rem", "1.75rem"), ("1.5rem", "1.5625rem"),
]

def map_font_sizes(text):
    out, i = [], 0
    for m in re.finditer(r"font-size:\s*([^;]+);", text):
        out.append(text[i:m.start(1)])
        val = m.group(1).strip()
        val = dict(SIZE_MAP).get(val, val)
        out.append(val)
        i = m.end(1)
    out.append(text[i:])
    return "".join(out)

css = map_font_sizes(css)

# selector-aware: h3 one full step above body (Core Rule 2)
css = css.replace(".page h3 { font-size: 1rem;", ".page h3 { font-size: 1.25rem;")

# ---------- 2. weights: kill adjacent-weight noise ----------
css = re.sub(r"font-weight:\s*500\b", "font-weight: 600", css)
css = re.sub(r"font-weight:\s*800\b", "font-weight: 700", css)

# ---------- 3. letter-spacing / line-height discipline ----------
css = css.replace("letter-spacing: .015em;", "letter-spacing: normal;")
css = css.replace("line-height: 1.85;", "line-height: 1.7;")
css = css.replace("line-height: 1.75;", "line-height: 1.7;")

# hero h1: bigger display, no CJK tracking
css = css.replace("font-size: clamp(1.75rem, 4.6vw, 2.85rem);", "font-size: clamp(2rem, 5vw, 3.25rem);")
css = css.replace("  letter-spacing: .01em;\n  text-wrap: balance;", "  letter-spacing: normal;\n  text-wrap: balance;")

# section rhythm → 8-scale
css = css.replace("padding: 78px 20px 66px;", "padding: 80px 20px 64px;")

# ---------- 4. radius scale: 8 / 16 / 999 ----------
RADIUS_MAP = {"6px": "var(--radius-sm)", "8px": "var(--radius-sm)", "9px": "var(--radius-sm)",
              "10px": "var(--radius-sm)", "11px": "var(--radius-sm)", "12px": "var(--radius-sm)",
              "13px": "var(--radius)", "14px": "var(--radius)", "18px": "var(--radius)", "20px": "var(--radius)"}

def map_radius(m):
    val = m.group(1).strip()
    if val in ("999px", "50%", "2px", "3px 0 0 3px", "0"):
        return m.group(0)
    if val == "13px 13px 0 0":
        return "border-radius: var(--radius) var(--radius) 0 0;"
    if val == "0 0 10px 10px":
        return "border-radius: 0 0 var(--radius) var(--radius);"
    return f"border-radius: {RADIUS_MAP.get(val, val)};"

css = re.sub(r"border-radius:\s*([^;]+);", map_radius, css)
css = css.replace("--radius-sm: 11px;", "--radius-sm: 8px;")

# ---------- 5. decoration diet ----------
def drop_rule(text, selector_sig):
    """Remove a full CSS rule containing selector_sig (first match)."""
    idx = text.find(selector_sig)
    if idx == -1:
        return text, False
    start = text.rfind("\n", 0, idx) + 1
    # walk back to rule start line
    while start > 0 and text[start - 1] != "\n":
        start = text.rfind("\n", 0, start - 1) + 1
    depth, i, end = 0, text.find("{", idx), None
    if i == -1:
        return text, False
    for j in range(i, len(text)):
        if text[j] == "{":
            depth += 1
        elif text[j] == "}":
            depth -= 1
            if depth == 0:
                end = j + 1
                break
    # also eat one trailing newline
    if end < len(text) and text[end] == "\n":
        end += 1
    return text[:start] + text[end:], True

for sig in [".site-header::before", "#hero::after", ".site-footer::before"]:
    css, removed = drop_rule(css, sig)
    print(f"{'removed' if removed else 'NOT FOUND':>9}: {sig}")

# badge dot: solid accent, no glow
css = css.replace("""  border-radius: 50%;
  background: var(--grad);
  box-shadow: 0 0 8px rgba(34, 211, 238, .8);
}""", """  border-radius: 50%;
  background: var(--accent);
}""")

# h2 icon seat: neutral chip, no cyan border/glow
css = css.replace("  border-radius: var(--radius-sm);\n  background: var(--grad-soft);\n  border: 1px solid rgba(34, 211, 238, .3);\n  color: var(--accent-soft);\n  box-shadow: 0 6px 16px -8px rgba(34, 211, 238, .5);\n}",
                  "  border-radius: var(--radius-sm);\n  background: rgba(148, 163, 184, .08);\n  border: 1px solid var(--line);\n  color: var(--accent-soft);\n}")
# (fallback if radius map changed the line first)
css = css.replace("background: var(--grad-soft);", "background: rgba(148, 163, 184, .08);")
css = css.replace("border: 1px solid rgba(34, 211, 238, .3);", "border: 1px solid var(--line);")
css = css.replace("box-shadow: 0 6px 16px -8px rgba(34, 211, 238, .5);\n", "")

# page lead + h2 tick + spec h4 dot: gradient → solid
css = css.replace("border-left: 3px solid;\n", "border-left: 3px solid rgba(34, 211, 238, .35);\n")
css = css.replace("  border-image: var(--grad) 1;\n", "")
css = css.replace("  height: 19px;\n  border-radius: 2px;\n  background: var(--grad);", "  height: 22px;\n  border-radius: 2px;\n  background: var(--accent);")
css = css.replace("  border-radius: 2px;\n  background: var(--grad);\n}\n.spec-col ul", "  border-radius: 2px;\n  background: var(--accent);\n}\n.spec-col ul")

# pop shadow: pure elevation, no cyan aura
css = css.replace("--shadow-pop: 0 20px 44px -20px rgba(0, 0, 0, .7), 0 0 0 1px rgba(34, 211, 238, .22), 0 12px 32px -16px rgba(34, 211, 238, .28);",
                  "--shadow-pop: 0 16px 40px -20px rgba(0, 0, 0, .7);")

# text glow + status-dot glow
css = css.replace("  text-shadow: 0 0 14px rgba(34, 211, 238, .35);\n", "")
css = css.replace("box-shadow: 0 0 6px currentColor; ", "")
css = css.replace("box-shadow: 0 0 6px currentColor;", "box-shadow: none;")

css_path.write_text(css)

# ---------- 6. the 4 inline styles in static HTML ----------
for name in ("index.html", "steam.html"):
    p = ROOT / name
    t = p.read_text()
    t = t.replace("font-size:.85rem", "font-size:.875rem").replace("font-size:.9rem", "font-size:1rem")
    p.write_text(t)

# ---------- sanity ----------
opens, closes = css.count("{"), css.count("}")
print(f"braces: {opens}/{closes} {'OK' if opens == closes else 'MISMATCH!'}")
grad_count = len(re.findall(r"gradient", css))
print(f"gradient mentions in css: {grad_count}")
sizes = sorted(set(re.findall(r"font-size:\s*([^;]+);", css)))
print("distinct font-sizes now:", sizes)
sys.exit(0 if opens == closes else 1)
