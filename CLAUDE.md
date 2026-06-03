# CLAUDE.md

Guidance for working in this repository.

## What this is

A browser-based SVG editor written in vanilla JavaScript. No build step, no
package manager, no framework — just static files served as-is. You draw lines,
circles, rectangles and freehand scribbles on a canvas, restyle them, move and
delete them, and import/export SVG.

## Layout

- `index.html` — markup + panels; loads the scripts and the Snap.svg CDN.
- `css/style.css` — all styling ("Soft Studio" theme, CSS variables at the top).
- `js/app.js` — entry point. Global `editorState`, `init()`, tool switching,
  mouse handlers (`mousedown`/`mousemove`/`mouseup` drive drawing), keyboard
  shortcuts, status bar.
- `js/shapes.js` — shape creation/update helpers (`drawLine`, `drawCircle`,
  `drawRect`, `drawScribble`, `getDefaultAttributes`, ...).
- `js/dragHandler.js` — selection, move-by-drag, selection boxes.
- `js/fileHandler.js` — SVG import/export.

There is no test suite or linter. Verify changes by running the app.

## Critical dependency: Snap.svg

The editor depends on **Snap.svg**, loaded from a CDN in `index.html`:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/snap.svg/0.5.1/snap.svg-min.js"></script>
```

`init()` calls `Snap('#svg-canvas')`. If `Snap` is undefined (CDN blocked,
offline, outage), initialization aborts. As of now `init()` detects this and
shows a visible red error banner (`#fatal-error`) with a Reload button instead
of failing silently — see `showFatalError()` in `js/app.js`. If you change init
ordering, keep that guard first.

## Running the app

It's static, so any static server works:

```bash
python3 -m http.server 8080
# open http://localhost:8080/index.html
```

## Driving / testing it headlessly (rodney + Chrome)

`uvx rodney` is a Chrome-automation CLI. Useful gotchas learned the hard way:

1. **The headless browser's network may block the Snap.svg CDN even when the
   shell can reach it.** Symptom: the UI renders but nothing is interactive,
   `typeof Snap === 'undefined'`, and the status bar still shows the raw HTML
   default `"Ready"` (instead of init's `"Ready - Select a tool..."`). Confirm
   with `curl -I https://cdnjs.cloudflare.com/.../snap.svg-min.js` — if curl
   gets 200 but the page doesn't, it's the browser, not your connection.

   Workaround for a session: download the library and serve a local copy, then
   inject it and re-run init:

   ```bash
   curl -so snap.svg-min.js https://cdnjs.cloudflare.com/ajax/libs/snap.svg/0.5.1/snap.svg-min.js
   # served from the same http.server root as the app
   uvx rodney js "(function(){var s=document.createElement('script');s.src='http://localhost:8080/snap.svg-min.js';document.head.appendChild(s);return 'injecting';})()" --local
   # wait briefly, then:
   uvx rodney js "(init(), document.getElementById('status-text').textContent)" --local
   ```

   Clean up the temp `snap.svg-min.js` and `.rodney/` afterward — they should
   not be committed.

2. **`rodney js` evaluates a single expression, not statements.** Multiple
   statements separated by `;` fail with `Unexpected token ';'`. Chain with the
   comma operator instead, and wrap assignments in parentheses:

   ```bash
   uvx rodney js "(document.getElementById('tool-rect').click(), editorState.activeTool)" --local
   ```

3. **There is no drag primitive.** Drawing needs a mouse drag, so dispatch the
   events yourself on `#svg-canvas` with `clientX/clientY`:

   ```js
   var c = document.getElementById('svg-canvas');
   function ev(t,x,y){ c.dispatchEvent(new MouseEvent(t,{bubbles:true,clientX:x,clientY:y})); }
   ev('mousedown',x1,y1); ev('mousemove',x2,y2); ev('mouseup',x2,y2);
   ```

4. **The canvas is small and centered**, not full-window. Read its real bounds
   with `getBoundingClientRect()` and draw inside them, or coordinates land
   outside the canvas and nothing is drawn.

5. **`rodney wait <sel>` waits for *visibility*** and times out on non-visible
   nodes like `<script>` tags — don't use it to wait for an injected script;
   poll `typeof Snap` instead.

6. Drive tools/inputs through the real DOM so the app's listeners fire:
   `document.getElementById('tool-circle').click()`, and for sliders/colors set
   `.value` then `dispatchEvent(new Event('input'|'change',{bubbles:true}))`.

## Conventions

- Vanilla JS, no dependencies beyond Snap.svg. Keep it that way unless asked.
- Match the existing comment density and JSDoc-style function headers.
- Reflect user-facing actions in the status bar via `updateStatus(...)`.
