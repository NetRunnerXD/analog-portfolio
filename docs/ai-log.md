# AI-use disclosure log

*Started Oct 8, 2026 (IST). Columns per plan.md §6.4. Space Apps asks teams to disclose AI use; this log feeds the project page's AI field. Times are IST.*

**Context to disclose:** research and planning notes in `docs/` (challenge-brief.md, research.md, data-sources.md, innovation.md, plan.md, submission.md, factor-copy.md, validation.csv, pipeline/inputs/targets.json and gaps.json) were prepared by AI agents. On Oct 8, 2026, the team lead (Sounak) decided to start building before the official Nov 14 start and to revise after the Oct 28 statement and Nov 13 guides; the Space Apps FAQ says teams should not begin challenge work before the hackathon, and this risk was accepted knowingly (wording to be confirmed by Sounak).

| Timestamp (IST) | Tool / agent | Task | Files / artifacts | Human reviewer | Notes |
|---|---|---|---|---|---|
| 2026-10-08 ~11:00–13:00 | Grok Bot agents: Researcher, Technology/API Data Source Explorer, Brainstorming, Hackathon Project Bot Coordinator, Project 1 | Challenge reading, science grounding, dataset survey and access tests, novel-angle ideation, build plan | docs/challenge-brief.md, docs/research.md, docs/data-sources.md, docs/innovation.md, docs/plan.md, docs/submission.md | Sounak Sarkar (pending review) | Planning prose only; references verified by the Researcher agent |
| 2026-10-08 ~13:00 | Grok Bot agent: Researcher | Validation set (21 analogs + 11 negatives), fidelity-gap lookup, 18 target definitions with literature values, factor UI copy | docs/validation.csv, pipeline/inputs/gaps.json, pipeline/inputs/targets.json, docs/factor-copy.md | Sounak Sarkar (pending review) | Literature values only; nulls mark values to sample |
| 2026-10-08 12:24–13:30 | Grok Bot agent: Project 1 (executor) | Phase A: repo creation, scaffold (pipeline package, web app shell), data contract + JSON Schemas, reference scorer, set cover, mock data generator, tests, CI | contract/*, pipeline/*, web/*, docs/DATA_CONTRACT.md, README.md, DATA_LICENSES.md, .github/workflows/ci.yml | Sounak Sarkar (pending review) | Mock data is synthetic and flagged `"mock": true` |
