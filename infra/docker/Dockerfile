# Single monorepo image — all Node apps run from it via tsx (different commands).
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps (cached on lockfile/manifests).
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/vpn-config/package.json packages/vpn-config/
COPY packages/routing-rules/package.json packages/routing-rules/
COPY packages/billing/package.json packages/billing/
COPY apps/api/package.json apps/api/
COPY apps/bot/package.json apps/bot/
COPY apps/sub-page/package.json apps/sub-page/
COPY apps/node-agent/package.json apps/node-agent/
RUN npm install --no-audit --no-fund

# Copy the rest of the source.
COPY . .

# Generate Prisma client.
RUN npx --workspace @ghostpepe/db prisma generate || true

EXPOSE 8080 8082 18081
CMD ["npx", "tsx", "apps/api/src/index.ts"]
