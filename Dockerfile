FROM amazon/aws-lambda-nodejs:latest

WORKDIR /app

COPY ./backend /app/backend
COPY ./package.json /app/package.json
COPY ./tsconfig.json /app/tsconfig.json
COPY ./yarn.lock /app/yarn.lock
COPY ./common /app/common

RUN npm install -g yarn
RUN yarn
RUN yarn build:server

CMD ["build/backend/lambda.handler"]