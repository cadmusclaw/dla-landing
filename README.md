# The Toota Group — Website

A modern, fast, static website for **The Toota Group LLC** (tootaautogroup.com replacement), emphasizing composite RunFlats, RunFlat lubricant, complete wheel assemblies, and tires for government fleets.

## Pages

| Page | Purpose |
|---|---|
| `index.html` | Home — hero, stats, capabilities, composite-vs-rubber comparison, install teaser, govcon strip |
| `runflats.html` | Composite RunFlat systems + RunFlat lubricant (`#lubricant` anchor) |
| `installation.html` | **Interactive animated installation walkthrough** (step-through / auto-play) + slot for a real install video |
| `wheel-assemblies.html` | Wheel assemblies with **interactive exploded-view slider** |
| `tires.html` | General & Continental tire distribution |
| `government.html` | Contracting page — CAGE 93ST9, competencies, how to buy |
| `contact.html` | Contact info + quote request form |

Plain HTML/CSS/JS — no build step, no WordPress, no plugins to maintain. Shared styles in `css/styles.css`, shared behavior in `js/main.js`.

## Preview locally

Open `index.html` in a browser, or run:

```bash
python3 -m http.server 8080
# then visit http://localhost:8080
```

## Before launch — checklist

1. **Quote form**: wire the form to Google so submissions email contact@tootagroup.com — full step-by-step instructions in `GOOGLE-FORM-SETUP.md`. Until then, submitting opens a pre-filled email (still functional).
2. **Verify registration data**: CAGE **93ST9** and establishment year were taken from public listings — confirm before launch. NAICS codes are intentionally listed as "available on request" on the Government page.
3. **Install video**: when you film the RunFlat install, drop the YouTube embed into the marked slot in `installation.html` (instructions are in an HTML comment there).
4. **Photos**: real facility photos are in `assets/img/` and placed throughout the site. Swap or add more anytime — keep them ~1600px wide, JPEG.

## Deploying (replacing the WordPress site)

A GitHub Actions workflow (`.github/workflows/deploy.yml`) is already included. To go live free on GitHub Pages:

1. Merge this branch to `main`.
2. In the GitHub repo: **Settings → Pages → Source → GitHub Actions** (one dropdown).
3. Done — the site publishes at `https://cadmusclaw.github.io/dla-landing/` and republishes on every push to `main`.

Alternatively, **Cloudflare Pages / Netlify / Vercel** (also free): connect this repo and every push auto-deploys.

To move the domain: once deployed, add `thetootagroup.com` (and/or `tootaautogroup.com`) as a custom domain in the host's settings and update the domain's DNS per their instructions. Keep the WordPress site up until DNS switches over — zero downtime.

## Notes

- All product claims (100 km run-flat range, ~20% weight savings, 3-segment hand-tool install, high-temp synthetic lubricant) reflect segmented composite RunFlat systems of the type supplied via Runflat International. The site intentionally does not name suppliers or competitors.
- Colors/typography: desert-gold on tactical dark; headings in Barlow Condensed, body in Inter. Fonts are self-hosted in `assets/fonts/` — no external font requests, no layout shift.
