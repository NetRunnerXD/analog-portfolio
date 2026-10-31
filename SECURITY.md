# Security Policy

## Supported versions

Only the latest commit on `main` (and the site deployed from it) is supported. There are no maintained release branches.

## Scope

- The static web app in `web/` (React + Vite + OpenLayers), served from static hosting (GitHub Pages; Cloudflare Pages / Vercel as optional mirrors).
- The offline Python data pipeline in `pipeline/` and the precomputed data it publishes to `web/public/data/`.
- Repository configuration: GitHub Actions workflows, Dependabot config, security headers (`web/vite.config.ts` CSP meta, `web/public/_headers`, `web/vercel.json`).

There is no backend, no user accounts, no cookies, and no server-side data collection. The only third-party origins the site contacts are NASA GIBS (`gibs.earthdata.nasa.gov`) and NASA Solar System Treks (`trek.nasa.gov`), for imagery tiles in the twin viewer and story mode (images only; nothing is sent but the tile request).

Out of scope: vulnerabilities in third-party services (GitHub, NASA GIBS, hosting providers), and issues that need a compromised user device or browser.

## No secrets in this repo

This project needs no API keys or credentials, at build time or at runtime. Nothing secret may be committed: `.env*`, `*.pem`, and `.netrc` are git-ignored. Raw and intermediate datasets stay out of git too (`data/` is ignored except its README). If you spot something that looks like a credential in the code or the history, please report it as described below.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

- Preferred: use GitHub's private vulnerability reporting ("Security" tab → "Report a vulnerability") when it is enabled for this repository.
- Otherwise: contact the maintainer, [@NetRunnerXD](https://github.com/NetRunnerXD), through GitHub and ask for a private channel.

Include what you found, steps to reproduce, and the impact you expect. You should get an acknowledgement within 72 hours. Fixes for confirmed issues ship as soon as practical. Please give us reasonable time to fix an issue before disclosing it.
