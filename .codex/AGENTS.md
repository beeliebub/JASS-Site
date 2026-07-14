# JASS — Codex CLI guidance

This supplements the root `AGENTS.md` with Codex-specific notes. Codex does **not**
read `CLAUDE.md`, so the critical project rules are summarized in the root `AGENTS.md`
— read that first.

## Skills discovery

Skills live in `.agents/skills/<name>/`. Each contains:

- `SKILL.md` — the instructions/workflow (the substance)
- `agents/openai.yaml` — Codex interface metadata (display name, default prompt)

Load a skill's `SKILL.md` when a task matches it. Installed skills:

- **Data / Prisma** — `prisma-patterns`, `database-migrations`, `backend-patterns`
- **Next.js / React** — `nextjs-turbopack`, `react-patterns`, `react-testing`,
  `react-performance`, `frontend-patterns`, `frontend-a11y`
- **API** — `api-design`, `error-handling`
- **Design / UI** — `design-system`, `frontend-design-direction`,
  `make-interfaces-feel-better`, `motion-ui`
- **Quality / process** — `coding-standards`, `verification-loop`, `tdd-workflow`,
  `security-review`, `git-workflow`
- **Testing / deploy** — `e2e-testing`, `docker-patterns`, `deployment-patterns`

## Multi-agent roles

Roles are defined in `.codex/config.toml` (`[agents.*]`) and back onto TOML layers in
`.codex/agents/`:

- `explorer` — read-only evidence gathering
- `reviewer` — correctness/security/missing-tests review
- `docs_researcher` — verify framework/API behavior against primary docs

Use `/agent` inside Codex CLI to inspect and steer child agents. Enable with
`[features] multi_agent = true` (already set).

## Key differences from Claude Code

| Feature | Claude Code | Codex CLI |
|---------|-------------|-----------|
| Context file | `CLAUDE.md` + `AGENTS.md` | `AGENTS.md` only |
| Skills | `.claude/skills/` (auto) | `.agents/skills/` (instruction-driven) |
| Subagents | `.claude/agents/*.md` via Task tool | `.codex/agents/*.toml` via `/agent` |
| Commands | `/slash` commands | instruction-based |
| Hooks | supported | not yet supported |

## Security without hooks

Codex lacks hook enforcement, so it is instruction-based:

1. Validate inputs at system boundaries; never hardcode secrets (use env vars).
2. Run `git diff` review before every commit/push.
3. Honor the production-safety checklist in the root `AGENTS.md` before touching
   anything under `prisma/`, `Dockerfile`, `docker-compose.yml`, or `Caddyfile`.
4. Treat networked/MCP tools as read-only by default; require explicit approval before
   pushing, publishing, or changing third-party resources.
