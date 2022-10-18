FROM amazon/aws-lambda-nodejs:latest AS common

WORKDIR /app

COPY . .

RUN npm install -g yarn
RUN yarn

FROM common AS production

RUN yarn build:server
RUN yarn build:frontend
ENTRYPOINT ["yarn", "start"]

FROM common AS development

ENTRYPOINT ["yarn", "start:dev"]
