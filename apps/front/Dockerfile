# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS build
WORKDIR /app

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
# Activate the packageManager-pinned pnpm version, then install with frozen lockfile.
RUN corepack prepare --activate \
    && pnpm install --frozen-lockfile

COPY . .
# Relative API base for Nginx gateway and explicit surface domains.
ARG VITE_PUBLIC_DOMAIN=athlore.ir
ARG VITE_COACH_DOMAIN=coach.athlore.ir
ARG VITE_STUDENT_DOMAIN=student.athlore.ir
ENV VITE_API_BASE_URL=/api/v1
ENV VITE_PUBLIC_REGISTRATION_ENABLED=false
ENV VITE_PUBLIC_DOMAIN=${VITE_PUBLIC_DOMAIN}
ENV VITE_COACH_DOMAIN=${VITE_COACH_DOMAIN}
ENV VITE_STUDENT_DOMAIN=${VITE_STUDENT_DOMAIN}
RUN pnpm build

FROM nginx:1.27-alpine AS runtime
COPY docker/nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
