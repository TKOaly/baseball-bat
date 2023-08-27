FROM node:18.17 AS production-build

WORKDIR /app

COPY package.json .
COPY package-lock.json .
RUN yarn install

COPY . .

RUN yarn build:server
RUN yarn build:frontend

RUN yarn install --production && yarn cache clean

CMD ["yarn start"]

FROM nginx:alpine AS production-nginx

COPY --from=production-build /app/web-dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

FROM node:18.17-alpine AS production-backend

RUN apk update && apk add chromium

COPY --from=production-build /app/build /app/build
COPY --from=production-build /app/backend /app/backend
COPY --from=production-build /app/package.json /app/package.json
COPY --from=production-build /app/migrations /app/migrations
COPY --from=production-build /app/node_modules /app/node_modules

WORKDIR /app

CMD ["yarn", "start"]

FROM node:18 AS development

RUN apt-get update && apt-get install -y chromium

WORKDIR /app
COPY . .
RUN yarn
CMD ["yarn", "start:dev"]
