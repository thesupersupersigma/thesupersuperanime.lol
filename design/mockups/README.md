# Approved mockups (v2 design)

These are the design mockups the user approved on 2026-11-24. They are the **visual target** for the site; the
real pages are built in 0.6 (home, anime page, watch page, schedule). Live interactive version (owner only):
https://claude.ai/artifact/4JSbXkouShvtCJn2NFBqwq

The files were made in a design canvas tool, so they don't open on their own in a browser:
- `<x-dc>` wrappers, `sc-for` / `sc-if` attributes and `{{ … }}` bindings are the canvas runtime's templating.
  Read them as "repeat this", "show this if" and "insert this value".
- `<script src="./support.js">` is the canvas runtime and `/_blob/a4377a07…` is three.js 0.149 (UMD).
  Neither is in this folder; the site uses the `three` npm package instead.
- `data-props` / "Motion" tweaks are canvas controls; on the real site the reduced-motion version is driven by
  `prefers-reduced-motion`.
- All titles, posters, numbers and comments are sample data.

What to take from them: layout, spacing, the monochrome palette, Syne + Inter type, component shapes, the
animations and their timings, and every QoL behaviour (see `brainstorm.md` 1.28 for the full list).

| File | Page |
| --- | --- |
| `Main.dc.html` | Home |
| `Anime.dc.html` | Anime details |
| `Watch.dc.html` | Watch page (simulated player) |
| `Schedule.dc.html` | Airing schedule (modelled on miruro.tv/schedule) |
| `Waves.dc.html` | three.js particle wave used behind the home hero and the schedule header |
| `canvas.json` | Canvas board layout (not needed for the site) |

## Tokens

| Token | Value |
| --- | --- |
| Background | `#0E0E0E` (rgb 14,14,14) |
| Surfaces | `#151515`, `#1C1C1C`, `#232323` |
| Borders | `#1F1F1F`, `#262626`, `#333333` |
| Text | `#F5F5F5` (whitesmoke) |
| Secondary text | `#C9C9C9`, `#B5B5B5` |
| Muted text | `#9A9A9A` |
| Headings | Syne 600 / 700 / 800 |
| Body | Inter 400 / 500 / 600 / 700 |
| SUB badge | filled whitesmoke, dark text |
| DUB badge | outlined whitesmoke |
| Entrances | 300–450 ms, staggered |
| Hover | 150–300 ms |
| Touch targets | at least 44 px |

No accent color: colour comes from the anime artwork.
