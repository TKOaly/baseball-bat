FROM node:18.17 AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder

COPY . /usr/src/app
WORKDIR /usr/src/app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM builder AS backend-builder

ENV PUPPETEER_SKIP_DOWNLOAD="true"

WORKDIR /usr/src/app/packages/backend

RUN pnpm --filter @bbat/backend... run build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm --filter @bbat/backend deploy /prod
RUN rm -r /prod/build/tests && cp -r ./assets ./migrations ./templates /prod

FROM builder AS frontend-builder
RUN pnpm --filter @bbat/frontend... run build

FROM node:18.17-alpine AS alpine-node-base

RUN apk update && apk add chromium

# node-canvas dependencies
RUN apk add --no-cache --virtual .build-deps \
  gcompat \
  git \
  build-base \
  g++ \
  cairo-dev \
  jpeg-dev \
  pango-dev \
  giflib-dev \
  && apk add --no-cache --virtual .runtime-deps \
  cairo \
  jpeg \
  pango \
  giflib

FROM alpine-node-base AS production-backend

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY --from=backend-builder /prod /app
COPY --from=backend-builder /prod/node_modules /app/node_modules

WORKDIR /app

CMD ["yarn", "start"]

FROM alpine-node-base AS development

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /usr/src/app
COPY . /usr/src/app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install
CMD ["pnpm", "run", "--filter=@bbat/backend...", "--filter=@bbat/frontend...", "--recursive", "--stream", "--parallel", "start:dev"]

FROM nginx:alpine AS production-nginx 

COPY --from=frontend-builder /usr/src/app/packages/frontend/dist /usr/share/nginx/html
COPY ./packages/frontend/docker/nginx.conf /etc/nginx/nginx.conf
