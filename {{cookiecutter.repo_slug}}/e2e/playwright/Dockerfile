# Inside the compose network, so the stack's dnsmasq resolves the domain without host configuration.
FROM node:{{ cookiecutter.node_version }}-bookworm-slim

WORKDIR /e2e

COPY package.json package-lock.json ./
RUN npm ci

RUN npx playwright install --with-deps chromium

COPY . .

CMD ["npx", "playwright", "test"]
