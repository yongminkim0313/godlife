# syntax=docker/dockerfile:1

# ---- 빌드 ----
FROM node:22-alpine AS build
WORKDIR /app

# Gmail 연동용 클라이언트 ID는 빌드 시점에 번들로 들어간다.
# 비밀값이 아니며, 비워두면 앱 설정 화면에서 직접 등록할 수 있다.
ARG VITE_GOOGLE_CLIENT_ID=""
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

# 소스보다 잠금 파일이 덜 바뀌므로 의존성 레이어를 먼저 굳힌다.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# 타입 검사까지 통과해야 이미지가 만들어진다.
RUN npm run build

# ---- 실행 ----
# Caddy는 인증서 발급·갱신을 스스로 하므로 HTTPS 구성이 파일 한 장으로 끝난다.
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 80 443
