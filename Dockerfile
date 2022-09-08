FROM amazon/aws-lambda-nodejs:latest AS common

WORKDIR /app

COPY . .

RUN npm install -g yarn
RUN yarn

FROM common AS production

RUN yarn build:server
CMD ["/app/build/backend/lambda.handler"]

FROM common AS development

ENTRYPOINT ["yarn", "start:dev"]
