# VCapacity — Datastore & Snapshot Intelligence

Enterprise VMware datastore capacity and snapshot sizing for the Storage,
Virtualization, and Operations teams. Built and owned by
**Technology Operations · Cloud & Platform Services**.

## What's inside

| Area | Detail |
| --- | --- |
| Stack | React 19 · TypeScript · Vite 7 · Tailwind 4 |
| Engine | Single typed engine (`src/lib/engine.ts`) — the legacy duplicated `calculations.js`/`engine.js` pair is gone |
| Policy | All thresholds/ratios centralized in `src/config/policy.ts`, versioned via `VC-FML-2026.1` |
| Quality | Vitest golden-number suite (36 tests) · ErrorBoundary · persistent inputs · full input pre-check engine |
| Reports | Theme-aware PNG export with reference ID, inputs echo, assumptions, sign-off block |
| Bulk | XLSX template + **RVTools auto-detection** (vDatastore/vInfo/vDisk), row quarantine, styled Storage Team report |
| Planner | Multi-VM peak modeling, per-disk delta caps, VM spanning detection, staggered snapshot scheduler, XLSX runbook |

### RVTools field mapping

The importer is tested against the real RVTools workbook shape, including
display-unit columns and the fact that `vDisk` normally has no separate
Datastore column:

| Sheet | RVTools fields used | VCapacity mapping |
| --- | --- | --- |
| `vDatastore` | `Name`, `Capacity MiB`, `In Use MiB`, `Free MiB`, `Datastore Cluster Name` | MiB is converted to GiB; explicit In Use is preferred over an inferred used value |
| `vInfo` | `VM`, `Memory`, `Powerstate` | Memory is converted from MiB to GiB |
| `vDisk` | `VM`, `Capacity MiB`, `VMDK Path` | Datastore is extracted from `[datastore-name] folder/file.vmdk` |

The parser also accepts older `tabvInfo` / `tabvDisk` / `tabvDatastore`
worksheet names, skips leading title rows, and reports `vDisk` read/mapped
counts after import. Re-import an RVTools file after a parser upgrade so
cached results from an older import are replaced.

## Tabs

1. **Capacity Assessment** — single-datastore sizing + health governance + PNG report
2. **Snapshot Sizing** — per-VM delta sizing with provisioned-size caps and retention advisories
3. **Bulk Assessment** — drop the template *or an RVTools export*; every datastore is sized and threshold-checked, bad rows are quarantined with their Excel row numbers, and a styled XLSX report (summary + detail + quarantine) is generated for the Storage Team
4. **Multi-VM Planner** — per-datastore VM rosters (from RVTools or manually), per-VM delta modeling capped at provisioned size, spanning-VM detection, worst-case vs. staggered peak planning with a balanced snapshot-window scheduler, peak-safe runway, and an exportable consolidation plan

### Planner math
```
delta(VM)   = min(writeRate × retention × 1.2, provisioned size)   ← a delta never outgrows its base
peak(worst) = Σ delta + Σ memory-state
peak(plan)  = max window demand   (balanced windows, k concurrent snapshots)
required    = (used + ΣRAM + peak) × safety buffer
runway      = (free − peak) ÷ aggregate daily write rate
```

Every exported artifact carries a monotonic reference (`VCA-YYYY-NNNN`), the
formula version, and the policy values it was computed under — reports stay
auditable forever.

## Formulas

```
Required capacity   = (Used + RAM* + Overhead) × Safety buffer        *RAM ×2 with memory state
Overhead (policy)   = 10% of datastore total capacity (user-overridable, tracked)
Health (approved)   = Current free ≥ 25%  AND  Projected free at peak ≥ 15%
Projected free      = Current free − Snapshot demand
Snapshot delta      = Daily write rate × Retention days × Safety factor
                      (capped at provisioned disk size — a delta never outgrows its base)
Memory state        = RAM + ~100 MB
Daily write rate    = Avg write throughput (KB/s) × 86,400 ÷ 1,048,576   (≈ 0.082397 GB/day)
```

## Develop

```bash
npm ci            # always lockfile-pinned
npm run dev       # local dev
npx vitest run    # engine test suite
npm run build     # production build → dist/
```

## Container & OpenShift

```bash
# build (rootless UBI nginx, port 8080)
docker build -t quay.io/YOUR_ORG/vcapacity:2.0.0 .
docker push quay.io/YOUR_ORG/vcapacity:2.0.0

# deploy
oc apply -k openshift/
```

- Image runs **non-root** with a **read-only root filesystem** — passes
  `restricted-v2` SCC, ACS image policies, and Quay/Clair scanning.
- `.github/workflows/ci.yml` gates every push: prod-dependency audit → unit
  tests → build → Trivy scan → SBOM → cosign signature → Quay push.
- Promotion is GitOps: pin the scanned image digest in
  `openshift/kustomization.yaml` and let ArgoCD roll it out.

## Security posture

- Fully static SPA: no database, no backend, no external calls at runtime
  (fonts are self-hosted; nothing leaves the cluster).
- nginx ships CSP, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, and
  a deny-all Permissions-Policy. The app is a single-file same-origin bundle,
  so `script/style-src` allow `'unsafe-inline'` for the inlined bundle only —
  **no remote origin is allowed for any resource type**. If the build later
  emits hashed asset files, tighten to `script-src 'self'`.
- NetworkPolicy restricts pod ingress to the OpenShift router.
- No analytics, no telemetry, no externally loaded assets.

## Roadmap

1. ~~Enterprise foundation~~
2. ~~Bulk assessment — XLSX template import + RVTools auto-detection, batch report export~~
3. ~~Multi-VM snapshot planner — concurrency-aware peak modeling, VMDK spanning detection, staggered scheduler~~
4. SSO via OpenShift OAuth-proxy sidecar · PDF/A report output · methodology page with citations · PWA offline mode · AR/RTL locale
