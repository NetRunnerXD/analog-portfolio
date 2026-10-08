# Deploy runbook

The repo stays **private until the hackathon starts (Nov 14, 2026)**. Before then nothing is deployed publicly:
Pages is **not** enabled, there is no `gh-pages` branch, and nothing goes to Cloudflare or Vercel.
Everything below is prepared so that going live on Nov 14 takes about 15 minutes.

Live URL (after go-live): https://netrunnerxd.github.io/analog-portfolio/

## How the build is configured

| Thing | Where | Notes |
|---|---|---|
| Base path | `web/vite.config.ts` → `base: process.env.VITE_BASE ?? './'` | Default `./` (relative) works on any host. Pages builds set `VITE_BASE=/analog-portfolio/`. |
| Data paths | `web/src/data.ts` | Uses `import.meta.env.BASE_URL`, so the data under `/analog-portfolio/data/...` resolves correctly. |
| SPA fallback | n/a | The app has no client-side router (single view), so no `404.html` copy is needed. If a router is added later, use hash routing or copy `dist/index.html` to `dist/404.html` after the build. |
| `.nojekyll` | `web/public/.nojekyll` | Harmless with the Actions deploy (no Jekyll runs). It covers the case where a branch deploy is ever used. |
| CSP | `web/vite.config.ts` (`CSP`, injected as `<meta>` at **build** time only, so `npm run dev` is unaffected) | `default-src 'self'`, no `unsafe-inline` or `unsafe-eval`, `object-src 'none'`, `base-uri 'self'`. The only external origin is `img-src https://gibs.earthdata.nasa.gov` (basemap tiles). A meta CSP cannot set `frame-ancestors`, and GitHub Pages cannot send custom headers. |
| Full header set (mirrors) | `web/public/_headers` (Cloudflare), `web/vercel.json` (Vercel) | CSP plus `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `X-Frame-Options: DENY`, `COOP`. |
| Deploy workflow | `.github/workflows/pages.yml` | Pinned action SHAs and minimal permissions (`contents: read`; the deploy job adds `pages: write` + `id-token: write`). **Both jobs skip while the repo is private**, so merging the workflow early is harmless. |

> If you add a new external origin (another tile server, a font CDN, etc.), add it to the CSP in **all three** places (`vite.config.ts`, `_headers`, `vercel.json`) and re-run the preview check below.

## Local preview (shared box)

```bash
scripts/preview.sh              # build with VITE_BASE=/analog-portfolio/ and serve
scripts/preview.sh --no-build   # serve the existing web/dist
PORT=5000 scripts/preview.sh    # or: scripts/preview.sh --port 5000
```

It serves `http://127.0.0.1:4173/analog-portfolio/`, bound to 127.0.0.1 only. Press Ctrl-C to stop.
Quick check from another shell:

```bash
B=http://127.0.0.1:4173/analog-portfolio
for p in / data/mock/targets.json data/mock/earth_features.bin; do curl -s -o /dev/null -w "%{http_code} $p\n" "$B/$p"; done
```

## Prerequisite: `workflow` token scope (do this before Nov 14)

Pushing anything under `.github/workflows/` needs the `workflow` scope on the gh token:

```bash
gh auth refresh -h github.com -s workflow     # Sounak approves in the browser
gh auth status                                # scopes should include 'workflow'
```

After that:
1. Fast-forward push local `main` so the CI commit (`845610c`, `.github/workflows/ci.yml`) lands. Plain `git push origin main`, never force.
2. Add `.github/workflows/pages.yml` to the deploy PR branch (a ready copy was kept outside the repo, at `/workspace/space-apps-analog/pages.yml.pending` on the shared box, until the scope was granted).

## Go-live: Nov 14, 2026, morning IST

Run these from a clone with `gh` authed as NetRunnerXD:

```bash
R=NetRunnerXD/analog-portfolio

# 1. Merge the deploy/security PR (after review), then update local main.
gh pr merge <PR#> --repo $R --squash        # or merge via the web UI

# 2. Make the repo public.
gh repo edit $R --visibility public --accept-visibility-change-consequences

# 3. Enable Pages with GitHub Actions as the source.
gh api -X POST repos/$R/pages -f build_type=workflow
#    (if it already exists: gh api -X PUT repos/$R/pages -f build_type=workflow)

# 4. Trigger the deploy and watch it.
gh workflow run pages.yml --repo $R --ref main
gh run watch --repo $R "$(gh run list --repo $R --workflow pages.yml --limit 1 --json databaseId --jq '.[0].databaseId')"

# 5. Verify (expect 200 for every line).
B=https://netrunnerxd.github.io/analog-portfolio
curl -s -o /dev/null -w "%{http_code} index\n" "$B/"
for a in $(curl -s "$B/" | grep -oE 'assets/[^"]+\.(js|css)'); do curl -s -o /dev/null -w "%{http_code} $a\n" "$B/$a"; done
curl -s -o /dev/null -w "%{http_code} data\n" "$B/data/mock/targets.json"   # or data/targets.json once real data ships
#    Then open it in a fresh browser: the map tiles load, there are no CSP errors in the console, and the portfolio panel fills in.

# 6. Set the repo homepage.
gh repo edit $R --homepage https://netrunnerxd.github.io/analog-portfolio/

# 7. Turn on secret scanning + push protection (free once public; returned 422 while private).
gh api -X PATCH repos/$R --input - <<'JSON'
{"security_and_analysis":{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"}}}
JSON
gh api repos/$R --jq .security_and_analysis    # both should read "enabled"

# 8. Protect main (free once public; returned 403 while private).
#    Light protection that blocks force-push and deletion:
gh api -X POST repos/$R/rulesets --input - <<'JSON'
{"name":"main: no force-push or deletion","target":"branch","enforcement":"active",
 "conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},
 "rules":[{"type":"non_fast_forward"},{"type":"deletion"}]}
JSON
#    Once CI (ci.yml) has run on main at least once, also require PRs + CI checks:
gh api -X POST repos/$R/rulesets --input - <<'JSON'
{"name":"main: PR + CI required","target":"branch","enforcement":"active",
 "conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},
 "bypass_actors":[{"actor_id":5,"actor_type":"RepositoryRole","bypass_mode":"always"}],
 "rules":[
  {"type":"pull_request","parameters":{"required_approving_review_count":0,"dismiss_stale_reviews_on_push":false,
    "require_code_owner_review":false,"require_last_push_approval":false,"required_review_thread_resolution":false}},
  {"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,
    "required_status_checks":[{"context":"Python pipeline (pytest)"},{"context":"Web (vitest + build)"}]}}]}
JSON
#    (actor_id 5 = the repo Admin role, so the owner can still bypass in an emergency during the 36-hour sprint.)
```

**Rollback** (take the site down fast): `gh api -X DELETE repos/$R/pages`. If needed, also `gh repo edit $R --visibility private --accept-visibility-change-consequences`.

## Backup hosts (documentation only; nothing set up)

Both need an account (a decision for Sounak) and are **not** set up. Only use them after the repo is public on Nov 14, and only if GitHub Pages has trouble.
For both, serve at the domain root, so build with the default relative base (don't set `VITE_BASE`, or set `VITE_BASE=/`).

**Cloudflare Pages (free plan)**: Dashboard → Workers & Pages → Create → Pages → Connect to Git → `NetRunnerXD/analog-portfolio`.
- Root directory: `web`
- Build command: `npm ci && npm run build`
- Build output directory: `dist`
- Env vars: `NODE_VERSION=22` (do not set `VITE_BASE`)
- `web/public/_headers` is copied into `dist/` and applied automatically (full CSP incl. `frame-ancestors`).
- CLI alternative: `cd web && npm run build && npx wrangler pages deploy dist --project-name analog-portfolio`

**Vercel (Hobby, free, non-commercial)**: New Project → import `NetRunnerXD/analog-portfolio`.
- Root directory: `web` (`web/vercel.json` sets build `npm run build`, output `dist`, framework `vite`, and the security headers)
- No env vars needed.
- CLI alternative: `cd web && npx vercel --prod`
