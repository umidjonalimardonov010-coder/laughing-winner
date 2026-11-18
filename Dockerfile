# Railway (yoki istalgan Docker hosting) uchun.
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install
COPY . .
ENV NITRO_PRESET=node-server
RUN bun run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
# Fayllar (video, logotip, cheklar) shu papkada saqlanadi — Railway volume shu yo'lga ulanadi.
ENV MEDIA_DIR=/data/media
COPY --from=build /app/.output ./.output
EXPOSE 3000
# IPv4 first + longer connect wait: Railway sometimes timed out connecting to api.telegram.org.
CMD ["node", "--dns-result-order=ipv4first", "--network-family-autoselection-attempt-timeout=2000", ".output/server/index.mjs"]
