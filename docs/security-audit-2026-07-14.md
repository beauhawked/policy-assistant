# Policy to Action — Security and Data Sovereignty Audit

Date: July 14, 2026
Scope: Full platform (Policy Assistant, Policy Scraper, bill tracker), all data flows, all third-party vendors, mapped against the 15-item AI sovereignty framework
Method: Line-level code review of authentication, authorization, data handling, and vendor integration code; dependency vulnerability scan; git history inspection; vendor policy verification against current published documentation
Platform state at audit: local development, commit 6dfc7d0, pre-deployment

---

## Executive Summary

The platform's engineering fundamentals are stronger than typical for a pre-deployment product. Password storage, session management, tenant isolation, SQL injection defense, and citation-grounded auditability are all professionally implemented. The overall posture is sound for the current single-developer, local-only stage.

The audit identified no critical vulnerabilities. It identified a set of items to address before production deployment and a second set to address before multi-district market entry. The single most important strategic insight: the platform's crown-jewel data is not the policies or handbooks (which are public documents) but the scenario descriptions administrators type, which may contain identifiable student and staff details. Every retention, vendor, and permission decision should be made with that data class in mind.

Top five priority actions:

1. Rotate all live credentials and purge the tracked secrets file before any deployment (one key is already in git history).
2. Run the dependency updates (11 known vulnerabilities, 5 high, all with fixes available).
3. Add scenario input limits and a PII-minimization notice in the interface.
4. Execute OpenAI's Data Processing Addendum and evaluate Zero Data Retention eligibility before onboarding real districts.
5. Add per-conversation deletion and a retention policy so districts control the lifecycle of scenario data.

---

## Part 1 — Platform Security Review (Code Level)

### 1.1 Authentication and session management: STRONG

- Passwords hashed with scrypt (memory-hard, industry-appropriate), per-user random 16-byte salt, constant-time comparison via timingSafeEqual. No plaintext or reversible storage.
- Sessions are server-side records in Postgres with 30-day expiry; the browser holds only a random UUID in an httpOnly, SameSite=Lax cookie, marked Secure in production. Sessions cannot be forged client-side and are revocable server-side.
- Email verification and password reset tokens: 32 random bytes, stored only as SHA-256 hashes, single-use, time-limited (24 hours / 60 minutes). Even a database leak would not expose usable tokens.
- Password policy: minimum 10 characters. Adequate; consider a breached-password check at market stage.

### 1.2 Authorization and tenant isolation: STRONG, one gap

- Every data query is scoped by user id at the SQL level (policies, handbooks, conversations, datasets). Cross-account access is structurally prevented, which is the correct foundation for multi-district isolation.
- Gap: archived policy datasets are excluded from answering only by the interface, not by query-level enforcement (archived handbooks DO have query-level enforcement). Fix scheduled with the multi-user milestone; low risk today.

### 1.3 Input handling and injection defense: GOOD, two gaps

- All SQL uses parameterized queries throughout; no string-concatenated SQL found. Schema names are regex-validated before interpolation.
- Upload size caps enforced (12 MB policies CSV, 15 MB handbooks).
- Gap: scenario text has no maximum length. An extremely long input raises OpenAI cost and latency. Mitigated partly by rate limiting; a cap (e.g., 8,000 characters) is a five-minute fix.
- Gap: pdf-parse dependency is dated (v1.1.1); parsing hostile PDFs is a classic attack surface. Acceptable while uploaders are trusted admins; upgrade or sandbox parsing before public multi-tenant exposure.

### 1.4 Transport and browser protections: GOOD, additions at deploy

- Security headers already set on all assistant routes: no-store caching, nosniff, frame denial (clickjacking), strict referrer policy, permissions policy, cross-origin isolation headers.
- Add at deployment: Content-Security-Policy header and confirm HSTS (Vercel provides TLS and HSTS on its domains by default).
- Rate limiting: database-backed windows on auth, uploads, chat, and the new library endpoints. Appropriate design for serverless.

### 1.5 Secrets management: NEEDS ACTION

- FINDING (medium): `.env.local.save` is tracked in git and contains a live Indiana General Assembly API key, in history since February 2026. The repository is local-only with no remote, which contains the exposure, but history persists through future pushes. Action: rotate the IGA key, remove the file from tracking, and treat the old key as burned.
- FINDING (low): four `.env.local` backup copies sit untracked in the project root containing real OpenAI and Neon credentials. Untracked is correct, but sprawl invites accidents. Action: consolidate to a single `.env.local`; move backups to `_to_delete/`.
- FINDING (process): before first deployment, rotate the OpenAI key and Neon password as a matter of hygiene, then store production secrets only in the host's encrypted environment settings (Vercel), never in the repo.
- Benchmark reports in `eval-results/` are committed and contain the account email. Harmless today; know it is there.
- Positive: `.gitignore` correctly excludes `.env` and `.env.local`; the live secrets files were never committed; no secrets appear in application logs.

### 1.6 Dependencies: NEEDS ROUTINE ACTION

- npm audit: 11 known vulnerabilities (5 high, 4 moderate, 2 low), all with fixes available, including Next.js itself (request smuggling, disk cache growth). None are exotic; this is normal drift. Action: run `npm audit fix`, verify with `npm run check`, re-run the retrieval benchmark as regression insurance. Institute a monthly cadence.

### 1.7 Logging and privacy hygiene: STRONG

- No scenario text, passwords, tokens, or personal data are written to logs anywhere. Error logging captures error objects only, tagged by context.
- Development email fallback prints verification links to the console only when no email key is configured, and production explicitly refuses to run in that state. Correct design.

---

## Part 2 — Data Flow Map and Sensitivity Classification

Data classes stored (all in your Neon Postgres, schema `policyiq_live`):

| Data class | Sensitivity | Notes |
| --- | --- | --- |
| Account records (email, district, scrypt hash) | Moderate | Standard credentials handling, well protected |
| Board policies | Low | Public documents by nature |
| Handbooks | Low | Public documents by nature |
| Scenario prompts and answers (conversations) | HIGH | May contain identifiable student/staff details; retained indefinitely; no user-facing deletion today |
| Answer evidence snapshots | Moderate-high | Mirror the conversations they document |
| Embeddings | Low-moderate | Derived vectors of public documents |

External data flows per question asked:

1. Browser to your server: scenario text over TLS (in production).
2. Your server to Neon: storage and retrieval. Neon is SOC 2 Type 2 audited with encryption at rest and in transit, and offers HIPAA-grade options, indicating mature controls.
3. Your server to OpenAI: the scenario, retrieved policy/handbook excerpts, recent user prompts, and (for embeddings) document text. Per OpenAI's current published policy: API data is NOT used for model training by default, is retained up to 30 days for abuse monitoring, then deleted; SOC 2 Type 2 audited; DPA available; Zero Data Retention available on request for eligible endpoints.
4. Your server to Resend: recipient email address and a verification/reset link only. No district content ever flows to Resend.

Nothing else leaves the platform. There is no analytics, advertising, or tracking of any kind in the codebase, which is a genuinely clean bill of health rarely seen.

---

## Part 3 — The 15-Item Sovereignty Framework, Item by Item

### Model Layer

**1. Zero data retention (ZDR) — APPLICABLE, partial today.**
Current state: OpenAI API default is no-training plus roughly 30-day retention, then deletion. That is strong but not zero. Neon is your system of record, so ZDR does not apply there; retention CONTROL does (see item 12 and the FERPA section).
Actions: execute OpenAI's standard DPA now (free, immediate); request ZDR for the Responses and Embeddings endpoints as district onboarding approaches; write your own retention promise into district contracts so the commitment chains down your vendor stack.

**2. AI decision tree — APPLICABLE, informal today.**
The platform already routes three distinct workloads: answer generation (frontier model required), scenario decomposition (small model sufficient), embeddings (commodity). Each is independently configurable by environment variable, which is the mechanical half of a decision tree. Missing is the written policy half: a one-page matrix of workload, data sensitivity, and assurance tier. Drafting it is a documentation task, and it doubles as sales collateral for security-conscious districts.

**3. Architecture layer audit — DONE, this document.**
Model layer: rented (OpenAI) but confined to three modules. Compute layer: rented (Neon now; Vercel at deploy), standard assurance. Control layer: fully owned — your code, your guardrails, your retrieval logic, your benchmark harness, and your data in portable Postgres. The control layer is where your sovereignty is strongest, and it is the layer that matters most for a policy-guidance product.

**4. Misaligned incentives — ADDRESSED by verified defaults plus contract.**
OpenAI's no-training default (verified current as of this audit) means your districts' scenarios do not become model weights. The deeper protection is structural: your defensible moat is the guardrail system, the evidence-snapshot audit trail, the retrieval tuning, and the eval suite — all of which live in your repository and database, not in any vendor's weights.

**5. Model liquidity — STRONG, one cheap upgrade available.**
Vendor coupling is confined to `openai.ts`, `embeddings.ts`, and `scenario-decomposition.ts`. Embeddings, the classic lock-in point, are already liquid: the backfill script can re-fingerprint the entire corpus against any new embedding model in minutes for cents. Cheap upgrade: support an OpenAI-compatible base URL via environment variable, which instantly opens every OpenAI-compatible provider (including self-hosted open-weight servers) without code changes. Recommended before market.

**6. Own the model flywheel — OWNED, keep investing.**
Your improvement loop already compounds internally: benchmark scenarios, before/after reports, retrieval scoring refinements, and prompt guardrails are all versioned in your repo. Growing the eval suite with real (anonymized) district scenarios is the highest-value continuation. Fine-tuning your own weights is not currently justified; revisit if a vendor-independent guidance model becomes strategic.

### Compute Layer

**7. Hardware by assurance tier — APPLICABLE AS POLICY, not purchase.**
Current tier: standard third-party cloud, appropriate for public policy documents. Scenario data warrants the next tier up: ZDR-agreement cloud (item 1). Owned or attested hardware is not justified at this scale. The written tier matrix from item 2 satisfies this item.

**8. Owned adaptable hardware — NOT APPLICABLE at this stage.**
Revisit only if a state-level contract or large district demands on-premises deployment, in which case the clean separation of your model layer (three files) makes a self-hosted open-weight variant feasible, which is itself a sovereignty asset worth mentioning in enterprise conversations.

**9. Verify rented compute — LIMITED APPLICABILITY.**
Confidential-compute attestation is not currently offered in the standard tiers of your vendors and is disproportionate to present risk. The compensating controls are the vendor audits (SOC 2 Type 2 at both OpenAI and Neon) plus contractual DPAs. Revisit at enterprise scale.

### Control Layer

**10. Model agnosticism — STRONG BY DESIGN.**
The retrieval mode system is genuine model-agnostic architecture: if OpenAI is unreachable, misbehaving, or dropped, the platform automatically degrades to fully functional lexical retrieval with zero external calls. Answers still flow. Few AI products can claim a working no-vendor mode; yours has one, tested.

**11. Granular permissions — THE HEADLINE GAP, already roadmapped.**
Today each account is an island with total power over its own data, which is correct for one user but not a district. The multi-user milestone should introduce district workspaces with roles (district admin, building admin, read-only) enforced at the query layer exactly as user-scoping is today, plus the query-level archived-dataset enforcement noted in 1.2. This is the single largest control-layer item between you and market.

**12. Audit and log — SURPRISINGLY STRONG, one addition needed.**
Every assistant answer already stores an evidence snapshot: which dataset, which policies, which handbook excerpts, captured at answer time. That is decision reconstruction, the hard part of this item, and it is already a product feature. Missing: an append-only audit table for administrative events (sign-ins, uploads, archives, deletions, exports) and per-conversation deletion. Both are modest additions; build with the multi-user milestone.

**13. Adaptive cybersecurity — PROCESS TO INSTITUTE.**
The code posture is good; what is missing is cadence. Institute: monthly `npm audit` and dependency updates, key rotation on a schedule and on any suspicion, Vercel log review after deployment, and a one-page incident response note (who is notified, how keys rotate, how sessions are revoked — the platform already supports mass session revocation server-side).

**14. Build by branching — SATISFIED in spirit.**
No autonomous agents act inside the product, so agent sandboxing does not apply. The reversibility principle is nonetheless present: archive/restore for data, git snapshots for code, and the mode flag for the retrieval engine. Every change we have made this cycle is reversible in one command.

**15. Own the context flywheel — OWNED, your strongest card.**
The platform IS an institutional-knowledge ontology: policies, handbooks, scenarios, decisions, and evidence links, in an open-format Postgres you can export at will (pg_dump), with human-readable markdown export now built into the product. None of it is trapped in a vendor. As districts use the platform, THEIR context flywheel compounds inside YOUR product, which is precisely the position item 15 tells institutions to occupy. This is a marketing narrative as much as a technical one.

---

## Part 4 — Education-Specific Compliance (FERPA and State Law)

The platform's exposure to FERPA arises the moment an administrator types an identifiable student detail into a scenario. Design implications:

1. Minimize what enters the system: add interface guidance at the scenario box ("Describe the situation without student names; use Student A/B") and include it in training materials. Your own test scenarios already model this practice.
2. Contract as a school official: district agreements should designate the platform as a school official with a legitimate educational interest, under the district's direct control, using records solely for the contracted purpose, with no redisclosure. This is the standard vendor path under FERPA's school official exception.
3. Chain the commitments downward: your DPA with OpenAI and terms with Neon should be referenced in district contracts so the district can demonstrate control over the full processing chain.
4. Deletion and retention: FERPA-conscious districts will ask how scenario data dies. Build per-conversation deletion, a district data-export, and a configurable retention window. (Dataset and handbook deletion already exist and cascade correctly.)
5. State overlays: many states, including Indiana, layer student-data-privacy statutes over FERPA with vendor contract requirements. Have district contracts reviewed by education counsel before first paid deployment; this audit is engineering diligence, not legal advice.

---

## Part 5 — Prioritized Remediation Roadmap

Immediate (this week, before any deployment):
1. Rotate IGA key; untrack `.env.local.save`; sweep `.env.local.bak.*` into `_to_delete/`.
2. `npm audit fix` and Next.js update; verify with typecheck, lint, and the retrieval benchmark.
3. Cap scenario length; add the PII-minimization notice to the scenario box.

Before production deployment:
4. Rotate OpenAI and Neon credentials into Vercel encrypted environment settings.
5. Execute OpenAI DPA; confirm Resend production configuration and APP_ORIGIN.
6. Add Content-Security-Policy; confirm HSTS on the production domain.
7. Add per-conversation deletion.

Before multi-district market entry:
8. District workspaces with roles; query-level archived-dataset enforcement (item 11).
9. Append-only audit event table (item 12).
10. OpenAI ZDR request; OpenAI-compatible base URL support (items 1, 5, 10).
11. Written AI decision-tree/assurance-tier policy document (items 2, 7).
12. District data export and configurable retention windows (FERPA).
13. Education counsel review of district contract templates.

---

## Verification Sources

- OpenAI Enterprise Privacy (training defaults, 30-day retention, ZDR, SOC 2, DPA): https://openai.com/enterprise-privacy/
- OpenAI data controls documentation: https://developers.openai.com/api/docs/guides/your-data
- Neon security and compliance (SOC 2 Type 2, encryption, HIPAA): https://neon.com/security and https://neon.com/docs/security/compliance
- Future of Privacy Forum, Vetting Generative AI Tools for Use in Schools (FERPA school-official analysis): https://fpf.org/wp-content/uploads/2024/10/Ed_AI_legal_compliance.pdf_FInal_OCT24.pdf

Audit conducted via line-level source review at commit 6dfc7d0. This document is engineering due diligence and does not constitute legal advice.
