# Local development image for Powerselect Werkplanner.
# Not used for production — production deploys via the existing
# Cloudflare Sites pipeline described in .openai/hosting.json.
FROM node:22.13.0-bookworm-slim

WORKDIR /app

# workerd (the embedded Cloudflare Workers runtime `vinext dev` spins up)
# validates outbound TLS against the OS trust store, which bookworm-slim
# ships without. Without this, requests to api.notion.com fail TLS
# verification and the app reports "Notion niet bereikbaar".
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first so this layer is cached across source edits.
COPY package.json package-lock.json ./
RUN npm ci

# Source is normally overlaid by the docker-compose bind mount for hot
# reload; this COPY only matters when the image is run standalone.
COPY . .

EXPOSE 3000

CMD ["npx", "vinext", "dev", "-H", "0.0.0.0", "-p", "3000"]
