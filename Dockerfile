# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────
#  VCapacity — bank-grade rootless container build
#  Multi-stage: UBI Node build → UBI nginx (unprivileged, :8080)
#  Alternative non-UBI runtime: nginxinc/nginx-unprivileged:alpine
#
#  Scan-note: for enterprise promotion, pin both base images by
#  digest (FROM <image>@sha256:<digest>) after the build is
#  proven, so Quay/Clair findings map to an immutable layer set.
# ─────────────────────────────────────────────────────────────

# ── Stage 1: build ──────────────────────────────────────────
FROM registry.access.redhat.com/ubi9/nodejs-20 AS build
WORKDIR /opt/app-root/src

# Lockfile-pinned, reproducible install (never `npm install`)
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ── Stage 2: runtime ────────────────────────────────────────
FROM registry.access.redhat.com/ubi9/nginx-124

# Hardened SPA config (security headers, /healthz, no-cache HTML)
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /opt/app-root/src/dist /usr/share/nginx/html

# ubi9/nginx-124 is designed to run unprivileged on 8080;
# OpenShift restricted-v2 assigns a random UID from this group.
EXPOSE 8080
USER 1001

CMD ["nginx", "-g", "daemon off;"]
