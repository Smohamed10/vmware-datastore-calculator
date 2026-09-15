# VCapacity — Datastore & Snapshot Intelligence

Enterprise VMware datastore capacity and snapshot sizing for the Storage, Virtualization, and Operations teams. Built and owned by **Technology Operations · Cloud & Platform Services**.

## What's inside

| Area    | Detail |
| ------- | ------ |
| Stack   | React 19 · TypeScript · Vite 7 · Tailwind 4 |
| Engine  | Single typed engine (src/lib/engine.ts) with golden-number Vitest suite |
| Policy  | All thresholds/ratios centralized in src/config/policy.ts, versioned via VC-FML-2026.1 |
| Quality | Vitest suite (36+ tests) · ErrorBoundary · persistent inputs · live input pre-check engine |
| Reports | Theme-aware PNG export with reference ID, inputs echo, assumptions, sign-off block |
| Bulk    | XLSX template + **RVTools auto-detection** (vDatastore/vInfo/vDisk/**vMultiPath**), row quarantine, styled Storage Team report with **NAA / LUN ID**, **Provisioned** and a self-describing **Requested Increase** column |
| Docs    | Every table header, input label and result value carries a **hover (i) explanation** |
| Planner | Multi-VM peak modeling, per-disk delta caps, VM spanning detection, staggered snapshot scheduler, live required-increase, XLSX runbook |

## New in v2.0

1. **NAA / LUN ID in the Storage Team report** — end-to-end from the template
   column, an enriched vDatastore column, or RVTools **vMultiPath** (`Disk` →
   `Datastore`, with `Serial #` / `UUID` fallbacks). On-screen LUN-coverage
   chip + Summary "identifiers captured" line.
2. **Hover knowledge layer** — viewport-anchored portal tooltips (never clipped
   by sticky headers or scroll containers) document every header, label and value.
3. **Planner required-increase** — a live "Required increase" stat + banner:
   `max(required − capacity, peak + 15% reserve − free)`, rounded up, recomputed
   from every roster / retention / memory / concurrency / buffer change. The banner
   names the binding driver (sizing vs. snapshot peak) and the XLSX runbook carries
   a `REQUIRED INCREASE` line. Planning retention defaults to **7 days** and
   propagates to roster VMs live as you type (hand-edited rows detach, with
   per-row re-link and a global reset), and an **ALL MEMORY** control flips
   memory-state capture for every VM at once.
4. **Report-only requested-increase rules** (Bulk Assessment + its report only):
   1. **Overprovisioned** (`provisioned > capacity`) → the requested increase
      raises total capacity to **at least the provisioned value**
      (`increase = provisioned − capacity`). This applies **even when free space
      exists today**, because thin allocation can be fully claimed at any time.
      If the free-space requirement happens to be larger, the larger wins so the
      request is never under-stated.
   2. **Not overprovisioned** → request only what is needed to satisfy sizing and
      the 25% free-space buffer. `0 GB` when already compliant.

   The report's **Requested Increase** column states its own basis
   (`+176 GB — overprovisioned: raise capacity to 1200 GB` /
   `+112 GB — meet 25% free-space buffer` / `0 GB — compliant`), the Summary sheet
   spells out both rules and counts the overprovisioned datastores, and the
   on-screen bulk table shows a gold chip when rows will be raised. Snapshot
   sizing, authorization gates and health verdicts are **unaffected**.
5. **Session-persistent imports** — parsed RVTools inventories live in a
   session-scoped store (`src/lib/inventoryStore.ts`), so switching tabs and
   returning keeps the workbook, the selected datastore and the bulk results.
6. **Capacity Assessment: RVTools method + Clear** — segmented
   `Manual entry | RVTools import` switch; picking a datastore auto-fills
   capacity/free/used/RAM/LUN (machine-safe numbers, still editable). Linked
   fields derive from each other (`Used = total − free`, `total ↔ capacity`,
   `reserve = 10% × capacity`) with per-field LINKED/MANUAL locks, and a
   **Clear** button identical to Bulk's wipes inputs *and* saved values.
7. **Living UI** — ambient backdrop (aurora orbs, storage-fabric grid, rising
   data motes, scan beams), spring-tweened numbers, meter sheens, staggered card
   entrances — all transform/opacity only, paused when hidden, disabled under
   `prefers-reduced-motion`.

## Brand assets (logo & favicon)

| Asset | Location | Shown | After deployment? |
| ----- | -------- | ----- | ----------------- |
| Header logo | `public/QNBLogo.png` | Navbar brand block, top-left | **Yes** — Vite copies `public/` verbatim into `dist/`, stage-2 of the Dockerfile copies `dist/` into nginx, so `/QNBLogo.png` serves from the cluster. |
| Browser-tab icon | `public/QNBLogo.png` — **the same file as the header logo**, referenced by `<link rel="icon">` in `index.html` | Browser tab, bookmarks | **Yes** — same pipeline; the tab icon always matches the navbar by construction. Replace that one file to change both at once. |
| PNG-report logo | `public/QNBLogo.png` | Header band of exported reports | Yes; falls back to a drawn monogram if unreachable. |

To use the official marks: replace `public/QNBLogo.png` (a full-bleed square works
best — the navbar clips it to a rounded tile). Nothing else to change — no code,
no manifest edits. If the image is ever missing, the navbar draws an inline
monogram fallback instead of a broken frame.

## RVTools field mapping

| Sheet      | RVTools fields used                                              | VCapacity mapping |
| ---------- | ---------------------------------------------------------------- | ----------------- |
| vDatastore | Name, Capacity MiB, Provisioned MiB, In Use MiB, Free MiB, Datastore Cluster Name | MiB → GiB; explicit In Use preferred over inferred |
| vMultiPath | Datastore, Disk (fallback Serial # / UUID)                       | NAA canonical name per datastore → report LUN column |
| vInfo      | VM, Memory, Powerstate                                           | Memory MiB → GiB |
| vDisk      | VM, Capacity MiB, VMDK Path                                      | Datastore extracted from `[datastore-name] folder/file.vmdk` |

## Tabs

1. **Capacity Assessment** — manual **or** RVTools-driven single-datastore sizing + health governance + PNG report (fully live)
2. **Snapshot Sizing** — per-VM delta sizing with provisioned-size caps and retention advisories (fully live)
3. **Bulk Assessment** — template/RVTools in; quarantine out; NAA/LUN + Provisioned stamped XLSX Storage Team report with the report-only overprovisioning rule
4. **Multi-VM Planner** — rosters, delta caps, spanning detection, LPT-balanced windows, runway, live required-increase, XLSX runbook

```text
delta(VM)   = min(writeRate × retention × 1.2, provisioned size)
peak(worst) = Σ delta + Σ memory-state
peak(plan)  = max window demand   (balanced windows, k concurrent)
required    = (used + ΣRAM + peak) × safety buffer
runway      = (free − peak) ÷ aggregate daily write rate
```

## Formulas

```text
Required capacity   = (Used + RAM* + Overhead) × Safety buffer        *RAM ×2 with memory state
Overhead (policy)   = 10% of datastore total capacity (user-overridable, tracked)
Health (approved)   = Current free ≥ 25%  AND  Projected free at peak ≥ 15%
Projected free      = Current free − Snapshot demand
Snapshot delta      = Daily write rate × Retention days × Safety factor (capped at provisioned size)
Memory state        = RAM + ~100 MB
Daily write rate    = Avg write throughput (KB/s) × 86,400 ÷ 1,048,576   (≈ 0.082397 GB/day)

Recommendation      = ceil(max(required − capacity, 25% floor − free))       … governance view (on screen)

Requested increase  (Bulk Assessment + Storage Team report only)
  if provisioned > capacity → ceil(max(provisioned − capacity, governance))  … reach provisioned size
  else                      → ceil(governance)                               … meet the free-space buffer
```

## Develop

```bash
npm ci            # always lockfile-pinned
npm run dev       # local dev
npx vitest run    # engine test suite
npm run build     # production build → dist/
```

## OpenShift deployment runbook

1. **Scan-clean build** (CI does this; locally reproducible):
   ```bash
   docker build -t quay.io/YOUR_ORG/vcapacity:2.0 .
   docker push quay.io/YOUR_ORG/vcapacity:2.0
   ```
2. Grab the immutable digest: `docker inspect quay.io/YOUR_ORG/vcapacity:2.0 --format='{{index .RepoDigests 0}}'`
   (or read it from the Quay tag page / `oc image info`).
3. Wait for **Clair** to finish scanning the tag in Quay; confirm 0 HIGH/CRITICAL (fixable).
4. Pin the digest in `openshift/kustomization.yaml` (see commented block) and commit — ArgoCD rolls it out. Direct path:
   `oc apply -k openshift/ -n <project>`.
5. Verify: `oc rollout status deploy/vcapacity -n <project>` → `oc get route vcapacity -n <project>` → `curl -k https://<host>/healthz`.
6. The readiness probe is `/healthz` on port 8080; TLS terminates at the router (edge).

## Security posture

- Fully static SPA: no database, no backend, **no external calls at runtime** — workbooks are
  parsed 100% in-browser; nothing leaves the cluster.
- Image runs **non-root** (uid 1001) with a **read-only root filesystem**, `capabilities.drop: ALL`,
  `seccompProfile: RuntimeDefault`, `automountServiceAccountToken: false` — passes the
  **restricted-v2** SCC and ACS baseline policies.
- nginx ships CSP (`default-src 'self'`, no remote origins for any resource type),
  `X-Frame-Options: DENY`, `nosniff`, strict Referrer-Policy, deny-all Permissions-Policy.
- NetworkPolicy limits pod ingress to the OpenShift router namespace.
- CI gates every push: `npm audit --omit=dev --audit-level=moderate` → unit tests → build →
  **Trivy** (HIGH/CRITICAL, unfixed ignored) → SBOM → **cosign** signature → Quay push.
- **`npm audit` = 0 findings** (dev included). Two supply-chain pins live in `package.json`
  `overrides` because the vulnerable transitive ranges can't be fixed by `npm audit fix` alone:
  - `uuid: ^11.1.1` — exceljs pins `uuid ^8.3.0` (GHSA-w5hq-g745-h8pq; the vulnerable
     v3/v5/v6 `buf` path is never called by exceljs, but the scanner must see zero). Remove
     once exceljs ships an upstream fix.
  - `esbuild: ^0.28.1` — vite pins `~0.27.0` (June-2026 HIGH + LOW advisories, both dev-server
     scoped). Remove when vite's range moves past 0.28.
  - `vite` devDependency is kept `^7.3.5` (GHSA-fx2h-pf6j-xcff, `server.fs.deny` bypass,
     fixed in 7.3.5).
- ExcelJS chosen over SheetJS CE deliberately: first-party npm provenance in a restricted CI.

## Roadmap

1. ~~Enterprise foundation~~
2. ~~Bulk assessment — XLSX template import + RVTools auto-detection, batch report export~~
3. ~~Multi-VM snapshot planner — concurrency-aware peak modeling, VMDK spanning detection, staggered scheduler~~
4. ~~NAA/LUN reporting, hover knowledge layer, Capacity-tab RVTools import, report-only overprovisioning rule~~
5. SSO via OpenShift OAuth-proxy sidecar · PDF/A report output · methodology page with citations · PWA offline mode · AR/RTL locale
