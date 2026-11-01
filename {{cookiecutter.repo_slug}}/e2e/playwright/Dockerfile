# Inside the compose network, so the stack's dnsmasq resolves the domain without host configuration.
FROM node:{{ cookiecutter.node_version }}-bookworm-slim

WORKDIR /e2e

COPY package.json package-lock.json ./
RUN npm ci

RUN npx playwright install --with-deps chromium

COPY . .

# The whole suite, once per stack; a command handed to `run` instead runs as given.
ENTRYPOINT ["sh", "run-once.sh"]
