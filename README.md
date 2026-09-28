# Team Nostromo — portfolio site

Static site (plain HTML/CSS/JS, no build step). Dark deep-space theme with a periwinkle accent: a few distant stars (drawn once by `site.js`), a moon in the top-right corner of every page (`img/moon.webp`, set on `body::before` in `styles.css`) and HUD line details around the home hero (`.hud` in `index.html`). Two pages:

- `/` — `index.html`: team home. Opens full-screen on the giant NOSTROMO headline (letters rise after the intro, thin out near the cursor, and exhale away as you scroll). The opening is pinned while you scroll: NOSTROMO blurs away, then "AeroSense E-Nose" and a large 3D model of the reader (`showcase.js`) come into focus in a close-up with a moving highlight, pull back to the whole device and turn with the scroll, then blur away into the rest of the page. The moon (`.moon` inside the hero) is sized in `site.js` to reach down to the last letter of NOSTROMO. `hero.js` holds an alternative droplet-particle version of the opening; it isn't loaded, but you can switch to it by swapping the headline for `<canvas id="breath">` and adding `<script src="hero.js" defer></script>`.
- `/components` — `components.html`: every hardware part and software layer and what it does, the locked Random Forest classifier (and the plan to move to a 1D-CNN), TinyML on the ESP32, and the IoT companion app.
- `/aerosense` — `aerosense.html`: AeroSense concept page with three interactive pieces:
  - **3D device** (hero, scroll-driven teardown in *Anatomy*, and the *Explorer* with exploded view, part hotspots and a simulated breath test) — `device3d.js`, uses three.js from jsdelivr
  - **Impactor simulator** — `main.js`, a 2D Stokes-number particle sim with jet-speed and nozzle-width sliders

## Edit before deploying

Search for `EDIT:` comments in `index.html`:

1. **Team cards** — name, "Department · Year", project role and LinkedIn/GitHub links for each person. For photos, put portraits (4:5 works best) in `img/team/` and swap the placeholder `<span>` for the commented-out `<img>` line in that card.
2. **Contact email** — `team.nostromo@example.com` placeholder, in both `data-email` and the visible text of the copy button.

Colours and fonts live at the top of `styles.css` (`:root`).

`site.js` (shared by both pages) runs the signature layer: the intro loader (first visit per browser session), instant page changes (prefetched; a dark label screen fades over the switch without delaying it), the live IST clock, the giant NOSTROMO headline (fitted to the width and reacting to the cursor), the copy-email button, and the scroll motion: smooth scrolling (Lenis, from jsdelivr), words that light up as you scroll (`.scrub`; wrap a phrase in `<span class="bolt">` to give it a lightning strike when it lights up), the Today vs AeroSense comparison (`.compare`), the horizontal field gallery (`.hscroll`), the scroll-speed ticker (`.marquee`), parallax (`data-parallax`), magnetic buttons, and anchor links that land exactly under the top bar (also when arriving from the other page, e.g. `index.html#team`). To replay the intro while testing, open the page in a new private window.

## Swapping in the SolidWorks model

The 3D model on the site is a procedural **concept model** built in code. To use the real CAD:

1. Export from SolidWorks as STEP (or send the STEP to Claude) and convert to **GLB** (e.g. with Blender, FreeCAD, or an online STEP→GLB converter). Keep it under ~5 MB; decimate if needed.
2. Name the top-level parts so they include words like `cartridge`, `strip`, `heater`, `pressure`, `afe`, `esp`, `battery`, `front`, `back`, `pcb` — the explorer uses these names for hotspots and the exploded view.
3. Put it at `models/aerosense.glb` and set `window.AEROSENSE_MODEL = "models/aerosense.glb";` in the `<head>` of `aerosense.html`.

If the file fails to load, the site falls back to the concept model automatically.

## Preview locally

```bash
npx serve .          # then open http://localhost:3000  (needs internet for three.js + fonts)
```
(or `python -m http.server` — but then use `/aerosense.html` since clean URLs are a Vercel feature)

## Deploy to Vercel

**Option A — GitHub (recommended, auto-deploys on push)**
1. Push this repo to GitHub.
2. vercel.com → Add New → Project → import the repo.
3. If this folder lives inside the E-Nose repo, set **Root Directory** to `portfolio`.
4. Framework Preset: **Other**. Leave build command and output directory empty.
5. Deploy.

**Option B — CLI**
```bash
npm i -g vercel
cd portfolio
vercel          # first time: follow prompts
vercel --prod
```

`vercel.json` enables clean URLs (`/aerosense` instead of `/aerosense.html`) and long caching for images.

## Notes on content

- The site presents AeroSense as a **concept and build plan** (breath-aerosol capture → screen-printed electrode → potentiostat → on-device ML). Nothing on it claims measured results yet.
- The hero animation on `/aerosense` is labelled **illustrative**; the curve is schematic, not data.
- The demo section deliberately says "safe surrogates" without naming the chemistry — update it once your team has tested the proxy.
- Budget and per-test figures are estimates; revise when you have real quotes.
- `img/concept.jpg` is a concept render and is captioned that way.
- `og:image` tags use relative paths; once you know the Vercel URL, make them absolute (e.g. `https://your-site.vercel.app/img/prototype-phase2.jpg`) so link previews show the photo.
