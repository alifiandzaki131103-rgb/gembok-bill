# Draft: Multi MikroTik Support

## Requirements (confirmed)
- support multi mikrotik: "saya ingin agar project ini support multi mikrotik"
- orchestration style: "panggil semua sub agent mu, spawn sebanyak mungkin tapi tetap arahkan agar sesuai dengan plan"
- context discipline: "jaga context window agar selalu dibawah 50%"

## Technical Decisions
- Intent tier classified as **Architecture** (cross-cutting impact: config model, service layer, routes, background jobs, and observability).
- Planning mode remains **read-only** for product code; only planning artifacts may be edited.
- Exploration strategy uses multiple parallel subagents (explore + oracle + librarian) with plan-aligned prompts.

## Research Findings
- `config/mikrotik.js`: central singleton connection + scalar settings (`mikrotik_host`, `mikrotik_port`, `mikrotik_user`, `mikrotik_password`) indicates one-router assumption.
- `routes/adminMikrotik.js`, `routes/technicianDashboard.js`, `config/serviceSuspension.js`, `config/pppoe-monitor.js`, `config/mikrotik-commands.js`: multiple flows route through shared single-target integration.
- `settings.json`: single-router scalar keys and PPPoE flags; no evident router collection model.
- Test baseline: no active automated test pipeline (`package.json` test script placeholder), Playwright dependency present but not integrated as primary CI gate.
- Oracle risk guidance: enforce tenant-scoped target resolution, explicit selection precedence, credentials-by-reference, bounded per-target connection lifecycle, reversible phased migration, and per-tenant observability.

## Open Questions
- Target ownership boundary: per tenant/customer, per branch, or global pool with ACL?
- Selection semantics: mandatory explicit target on each operation vs tenant default fallback?
- Migration policy: maintain backward compatibility for legacy single-router settings during rollout?
- Scope of cleanup: include deprecating/removing obsolete legacy single-router code now or defer after stabilization?

## Scope Boundaries
- INCLUDE: architecture and execution plan to add multi-MikroTik capability end-to-end.
- EXCLUDE: direct code implementation in this planning session.
