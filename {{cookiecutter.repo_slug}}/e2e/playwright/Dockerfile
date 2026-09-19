# Runs Playwright itself inside the compose network - see docker-compose.e2e.yml's `playwright`
# service and `dns` for why, instead of requiring host-side DNS/hosts configuration for the app's
# real domain and subdomains.
FROM node:{{ cookiecutter.node_version }}-bookworm-slim

WORKDIR /e2e

COPY package.json package-lock.json ./
RUN npm ci

RUN npx playwright install --with-deps chromium

COPY . .

CMD ["npx", "playwright", "test"]
