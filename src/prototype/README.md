# Tilewright — Phase 1 Prototype (DISPOSABLE)

> **Note:** Everything in `src/prototype/` is a **disposable Phase 1 prototype** (vanilla HTML/CSS/JS, offline-bundled Gridstack v14.1.1). The Layout Lab exists to validate grid behaviour, touch ergonomics, themes, and swipe on your tablet and desktop before committing to a frontend stack. The API/Tile Harness (`harness.html`) will be kept as a dev-tools page and wired to the real .NET backend in Phase 2.

## How to Run

From this folder:

```bash
cd src/prototype
python3 -m http.server 8080
```

Then open in your browser (or on a tablet via `http://<your-lan-ip>:8080/`):

- **Layout Lab:** `http://localhost:8080/`
- **API / Tile Harness:** `http://localhost:8080/harness.html`
