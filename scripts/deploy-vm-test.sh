#!/usr/bin/env bash
# Публикация фронтенда self-hosted портала из ветки test.
# Запуск на VM: bash /opt/portal/repo/scripts/deploy-vm-test.sh
#
# Скрипт намеренно не применяет миграции БД и не перезапускает контейнеры.
# Он собирает фронтенд во временной папке и копирует готовые файлы в уже
# смонтированный Nginx каталог, поэтому сайт не теряет доступность.

set -Eeuo pipefail

PORTAL_ROOT="${PORTAL_ROOT:-/opt/portal}"
REPO_DIR="${REPO_DIR:-$PORTAL_ROOT/repo}"
DIST_DIR="${DIST_DIR:-$PORTAL_ROOT/dist}"
ENV_FILE="${ENV_FILE:-$PORTAL_ROOT/.env}"
BRANCH="${BRANCH:-test}"
PUBLIC_SUPABASE_URL="${PUBLIC_SUPABASE_URL:-https://portal.acx.by}"
NGINX_CONF_DIR="${NGINX_CONF_DIR:-$PORTAL_ROOT/nginx/conf.d}"
NGINX_CONTAINER="${NGINX_CONTAINER:-app_nginx}"

for path in "$REPO_DIR" "$DIST_DIR"; do
  [[ -d "$path" ]] || { echo "Не найдена папка: $path" >&2; exit 1; }
done
[[ -f "$ENV_FILE" ]] || { echo "Не найден файл настроек: $ENV_FILE" >&2; exit 1; }

ANON_KEY_VALUE="$(sed -n 's/^ANON_KEY=//p' "$ENV_FILE" | head -n 1)"
[[ -n "$ANON_KEY_VALUE" ]] || { echo "В $ENV_FILE не задан ANON_KEY" >&2; exit 1; }
# Разрешаем оба обычных варианта .env: VALUE и "VALUE".
VAPID_PUBLIC_KEY_VALUE="$(sed -n -E 's/^VAPID_PUBLIC_KEY="?([^\"]*)"?$/\1/p' "$ENV_FILE" | head -n 1)"

echo "Получаю ветку $BRANCH из Git..."
git -C "$REPO_DIR" pull --ff-only origin "$BRANCH"

# The running Nginx configuration is mounted from $PORTAL_ROOT/nginx, not from
# the Git checkout. Keep it in sync so new static routes (for example the
# Collector CA certificate) are published with the frontend release.
SOURCE_NGINX_CONF="$REPO_DIR/nginx/conf.d/app.conf"
TARGET_NGINX_CONF="$NGINX_CONF_DIR/app.conf"
if [[ -f "$SOURCE_NGINX_CONF" && -d "$NGINX_CONF_DIR" ]] && ! cmp -s "$SOURCE_NGINX_CONF" "$TARGET_NGINX_CONF"; then
  NGINX_BACKUP="$TARGET_NGINX_CONF.backup-git-$(date +%Y%m%d-%H%M%S)"
  if [[ -f "$TARGET_NGINX_CONF" ]]; then
    cp -a "$TARGET_NGINX_CONF" "$NGINX_BACKUP"
  fi
  install -m 644 "$SOURCE_NGINX_CONF" "$TARGET_NGINX_CONF"
  if ! docker exec "$NGINX_CONTAINER" nginx -t; then
    if [[ -f "$NGINX_BACKUP" ]]; then
      cp -a "$NGINX_BACKUP" "$TARGET_NGINX_CONF"
      echo "Конфигурация Nginx не применена: восстановлена резервная копия $NGINX_BACKUP" >&2
    fi
    exit 1
  fi
  docker exec "$NGINX_CONTAINER" nginx -s reload
  echo "Конфигурация Nginx обновлена. Резервная копия: $NGINX_BACKUP"
fi

BUILD_TAG="$(date +%Y%m%d-%H%M%S)"
BUILD_DIR="$PORTAL_ROOT/build-git-$BUILD_TAG"
BACKUP_DIR="$PORTAL_ROOT/dist.backup-git-$BUILD_TAG"
mkdir -p "$BUILD_DIR"

echo "Готовлю исходники: $BUILD_DIR"
git -C "$REPO_DIR" archive --format=tar HEAD | tar -x -C "$BUILD_DIR"
printf 'VITE_SUPABASE_URL=%s\nVITE_SUPABASE_PUBLISHABLE_KEY=%s\n' \
  "$PUBLIC_SUPABASE_URL" "$ANON_KEY_VALUE" > "$BUILD_DIR/.env"
if [[ -n "$VAPID_PUBLIC_KEY_VALUE" ]]; then
  printf 'VITE_VAPID_PUBLIC_KEY=%s\n' "$VAPID_PUBLIC_KEY_VALUE" >> "$BUILD_DIR/.env"
else
  echo "VAPID_PUBLIC_KEY не задан: браузерные push-уведомления будут недоступны."
fi

echo "Собираю фронтенд..."
docker run --rm -v "$BUILD_DIR:/app" -w /app node:20-alpine \
  sh -c 'npm ci && npm run build'

test -f "$BUILD_DIR/dist/index.html" || { echo "Сборка не создала dist/index.html" >&2; exit 1; }

echo "Сохраняю резервную копию: $BACKUP_DIR"
cp -a "$DIST_DIR" "$BACKUP_DIR"

echo "Публикую новую сборку без перезапуска Nginx..."
cp -a "$BUILD_DIR/dist/." "$DIST_DIR/"

echo "Готово. Активная версия Git: $(git -C "$REPO_DIR" rev-parse --short HEAD)"
echo "Резервная копия: $BACKUP_DIR"
