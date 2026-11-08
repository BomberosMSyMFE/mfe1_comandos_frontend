# Etapa 1: Build de Angular con set-env.js
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN node scripts/set-env.js
RUN npm run build -- --configuration production

# Etapa 2: Servidor Nginx ligero
FROM nginx:alpine
COPY --from=builder /app/dist/mfe1_comandos_frontend /usr/share/nginx/html
COPY nginx-cors.conf /etc/nginx/conf.d/default.conf
EXPOSE 4201
CMD ["nginx", "-g", "daemon off;"]