# El validador de peleas. Se construye desde la RAÍZ del repo (necesita la sim
# de src/fight, que es la misma que corre en el navegador):
#
#   docker build -f validator/Dockerfile -t psy-fight-validator .
#
FROM node:22-alpine AS build
WORKDIR /app
COPY validator/package.json validator/package-lock.json validator/
RUN cd validator && npm ci
COPY src/fight src/fight
COPY validator/src validator/src
COPY validator/tsconfig.json validator/
RUN cd validator && npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/validator/dist/validator.cjs ./validator.cjs
USER node
CMD ["node", "validator.cjs"]
