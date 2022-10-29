FROM amazon/aws-lambda-nodejs:latest AS common

WORKDIR /app

COPY . .

RUN npm install -g yarn
RUN yarn

ENTRYPOINT ["/bin/bash", "-l", "-c"]

FROM common AS production

RUN yarn build:server
RUN yarn build:frontend
CMD ["yarn", "start"]

FROM common AS development

CMD ["yarn", "start:dev"]
