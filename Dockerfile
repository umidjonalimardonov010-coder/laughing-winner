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
VOLUME ["/data"]
COPY --from=build /app/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
