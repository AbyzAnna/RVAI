/**
 * Deterministic pieces of the App Rebuilder: how to open the finished file on each system, the
 * notice at the top of every file, and the offline templates used when no model can write the file.
 * The templates are original: a generic workspace with one working panel per chosen feature.
 */

export type Os = "macos" | "windows" | "linux" | "chromeos" | "other";
export type Arch = "arm64" | "x64" | "unknown";
export type Format = "html" | "python";

export interface TemplateInput {
  appName: string;
  target: string;
  summary: string;
  features: Array<{ label: string; description: string }>;
}

const OS_NAMES: Record<Os, string> = { macos: "macOS", windows: "Windows", linux: "Linux", chromeos: "ChromeOS", other: "your computer" };
export const osName = (os: Os) => OS_NAMES[os];

/** Step-by-step instructions to open the file on the chosen system. Nothing to build or install for HTML. */
export function runInstructions(format: Format, os: Os, arch: Arch, filename: string): string[] {
  if (format === "html") {
    const open: Record<Os, string> = {
      macos: `Double-click ${filename} in Downloads. It opens in Safari or your default browser.`,
      windows: `Double-click ${filename} in Downloads. It opens in Edge or your default browser.`,
      linux: `Double-click ${filename}, or run: xdg-open ~/Downloads/${filename}`,
      chromeos: `Open the Files app, go to Downloads and double-click ${filename}. It opens in Chrome.`,
      other: `Open ${filename} in any modern web browser.`,
    };
    return [open[os], "Nothing to install and no internet needed. Your data stays in this browser on this computer."];
  }
  const steps: Record<Os, string[]> = {
    macos: [
      "Check Python 3 in Terminal: python3 --version. If it is missing, install it from python.org (it includes Tkinter).",
      ...(arch === "arm64" ? ["On Apple Silicon, the python.org universal installer runs natively."] : []),
      `Run it: python3 ~/Downloads/${filename}`,
    ],
    windows: [
      "Install Python 3 from python.org or the Microsoft Store and tick \"Add python.exe to PATH\".",
      `Double-click ${filename}, or run in a terminal: py %USERPROFILE%\\Downloads\\${filename}`,
    ],
    linux: [
      "Install Tkinter if needed: sudo apt install python3-tk (Debian/Ubuntu) or sudo dnf install python3-tkinter (Fedora).",
      `Run it: python3 ~/Downloads/${filename}`,
    ],
    chromeos: [
      "Turn on Linux in Settings > Advanced > Developers, then in the Linux terminal: sudo apt install python3-tk",
      `Move ${filename} into "Linux files" and run: python3 ${filename}`,
    ],
    other: ["Install Python 3 with Tkinter.", `Run it: python3 ${filename}`],
  };
  return [...steps[os], "Only the Python standard library is used, so there is nothing else to install."];
}

/** The plain-text notice placed at the top of every file. */
export function notice(appName: string, target: string, steps: string[]): string[] {
  return [
    `${appName}: made with RVAI (https://github.com/AbyzAnna/RVAI).`,
    `Original code, written from a public description of what apps like ${target} do.`,
    `Not affiliated with or endorsed by the owner of ${target}; that name belongs to its owner.`,
    "How to run:",
    ...steps.map((s) => `  - ${s}`),
  ];
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** JSON that is safe inside an inline <script>. */
const scriptJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028|\u2029/g, " ");

/** A working single-page workspace: one panel per feature, each a list you can add to, tick and delete. */
export function htmlTemplate(input: TemplateInput): string {
  const key = `rvai:${input.appName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.appName)}</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#0f1416;color:#e8f1ee;display:flex;min-height:100vh}
nav{width:240px;background:#151d20;border-right:1px solid #24323a;padding:18px 12px;flex-shrink:0}
nav h1{font-size:18px;margin:0 6px 4px}nav p{font-size:12px;color:#8fa6a0;margin:0 6px 16px}
nav button{display:block;width:100%;text-align:left;background:none;border:0;color:#cfe0da;padding:9px 10px;border-radius:8px;font:inherit;cursor:pointer}
nav button[aria-current=true]{background:#1f6f5a;color:#fff}
main{flex:1;padding:28px;max-width:860px}h2{margin:0 0 6px}.desc{color:#9db3ad;margin:0 0 18px}
form{display:flex;gap:8px;margin-bottom:14px}input[type=text]{flex:1;padding:10px 12px;border-radius:8px;border:1px solid #2c3d45;background:#121a1d;color:inherit;font:inherit}
button.add,button.tool{padding:10px 14px;border-radius:8px;border:0;background:#2bb37f;color:#04110c;font-weight:600;cursor:pointer}
button.tool{background:#24323a;color:#e8f1ee;font-weight:500}
ul{list-style:none;padding:0;margin:0}li{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #24323a;border-radius:8px;margin-bottom:8px;background:#141c1f}
li.done span{text-decoration:line-through;color:#7d918b}li span{flex:1}li button{background:none;border:0;color:#d98c8c;cursor:pointer}
.bar{display:flex;gap:8px;margin-top:18px}footer{margin-top:28px;font-size:12px;color:#748a84}
@media (max-width:640px){body{flex-direction:column}nav{width:auto}}
</style>
</head>
<body>
<nav><h1>${escapeHtml(input.appName)}</h1><p>${escapeHtml(input.summary)}</p><div id="tabs"></div></nav>
<main><h2 id="title"></h2><p class="desc" id="desc"></p>
<form id="add"><input type="text" id="text" placeholder="Add an item and press Enter" aria-label="New item"><button class="add">Add</button></form>
<ul id="list"></ul>
<div class="bar"><button class="tool" id="export">Export data</button><label class="tool" style="padding:10px 14px;border-radius:8px;background:#24323a;cursor:pointer">Import data<input type="file" id="import" accept="application/json" hidden></label></div>
<footer>Starter workspace from RVAI. Everything is saved in this browser only.</footer></main>
<script>
const FEATURES = ${scriptJson(input.features)};
const KEY = ${scriptJson(key)};
let data = {}; try { data = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}
let current = 0;
const $ = (id) => document.getElementById(id);
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} };
function render() {
  $("tabs").replaceChildren(...FEATURES.map((f, i) => { const b = document.createElement("button"); b.textContent = f.label; b.setAttribute("aria-current", String(i === current)); b.onclick = () => { current = i; render(); }; return b; }));
  const f = FEATURES[current]; $("title").textContent = f.label; $("desc").textContent = f.description;
  const items = data[f.label] || [];
  $("list").replaceChildren(...items.map((it, i) => { const li = document.createElement("li"); li.className = it.done ? "done" : "";
    const c = document.createElement("input"); c.type = "checkbox"; c.checked = it.done; c.onchange = () => { it.done = c.checked; save(); render(); };
    const s = document.createElement("span"); s.textContent = it.text;
    const d = document.createElement("button"); d.textContent = "Delete"; d.onclick = () => { items.splice(i, 1); save(); render(); };
    li.append(c, s, d); return li; }));
}
$("add").onsubmit = (e) => { e.preventDefault(); const t = $("text").value.trim(); if (!t) return; const f = FEATURES[current].label; (data[f] = data[f] || []).push({ text: t, done: false }); $("text").value = ""; save(); render(); };
$("export").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); a.download = KEY.replace(":", "-") + ".json"; a.click(); };
$("import").onchange = async (e) => { const file = e.target.files[0]; if (!file) return; try { data = JSON.parse(await file.text()); save(); render(); } catch (err) { alert("That file is not valid JSON."); } };
render();
</script>
</body>
</html>
`;
}

/** The same workspace as a Tkinter window: one tab per feature, saved to a JSON file in the home folder. */
export function pythonTemplate(input: TemplateInput): string {
  const file = `.${input.appName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
  return `import json
import os
import tkinter as tk
from tkinter import ttk

APP_NAME = ${JSON.stringify(input.appName)}
FEATURES = ${JSON.stringify(input.features)}
DATA_FILE = os.path.join(os.path.expanduser("~"), ${JSON.stringify(file)})


def load():
    try:
        with open(DATA_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save(data):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def feature_tab(parent, feature, data):
    frame = ttk.Frame(parent, padding=12)
    ttk.Label(frame, text=feature["description"], wraplength=520).pack(anchor="w", pady=(0, 8))
    row = ttk.Frame(frame)
    row.pack(fill="x")
    entry = ttk.Entry(row)
    entry.pack(side="left", fill="x", expand=True)
    items = tk.Listbox(frame, height=14)
    items.pack(fill="both", expand=True, pady=8)
    stored = data.setdefault(feature["label"], [])
    for text in stored:
        items.insert("end", text)

    def add(_event=None):
        text = entry.get().strip()
        if text:
            stored.append(text)
            items.insert("end", text)
            entry.delete(0, "end")
            save(data)

    def delete():
        for index in reversed(items.curselection()):
            items.delete(index)
            del stored[index]
        save(data)

    entry.bind("<Return>", add)
    ttk.Button(row, text="Add", command=add).pack(side="left", padx=(8, 0))
    ttk.Button(frame, text="Delete selected", command=delete).pack(anchor="e")
    return frame


def main():
    data = load()
    root = tk.Tk()
    root.title(APP_NAME)
    root.geometry("640x480")
    tabs = ttk.Notebook(root)
    tabs.pack(fill="both", expand=True)
    for feature in FEATURES:
        tabs.add(feature_tab(tabs, feature, data), text=feature["label"])
    root.mainloop()


if __name__ == "__main__":
    main()
`;
}
