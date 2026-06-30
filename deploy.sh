#!/usr/bin/env bash
#
# Деплой UI Pokrovka: сборка во временный каталог + атомарный своп (без простоя).
#
# Обходит известные грабли (см. CLAUDE.md / память build-deploy-quirk):
#   - root-owned файлы внутри build/ ломают `npm run build` на очистке → собираем
#     в build_new (BUILD_PATH) и подменяем готовое.
#   - root-owned node_modules/.cache → запись кэша best-effort, сборку не валит.
#   - DISABLE_ESLINT_PLUGIN — кэш eslint тоже root-owned.
# nginx отдаёт /var/www/html/pokrovka/build. Файл yandex_*.html теперь лежит в
# public/ и попадает в сборку автоматически — ручное копирование не нужно.
#
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Сборка во временный build_new ..."
rm -rf build_new
DISABLE_ESLINT_PLUGIN=true CI=false GENERATE_SOURCEMAP=false BUILD_PATH=build_new npm run build

ts=$(date +%s)
echo "==> Атомарный своп (build -> build.old.$ts) ..."
mv build "build.old.$ts"
mv build_new build

echo "==> Активные бандлы:"
grep -o 'main\.[a-z0-9]*\.\(js\|css\)' build/index.html | sort -u | sed 's/^/    /'

# Чистим только полностью pi-owned бэкапы; где остались root-owned файлы — пропускаем.
me="$(id -un)"
for d in build.old.*; do
  [ -d "$d" ] || continue
  [ "$d" = "build.old.$ts" ] && continue
  if [ -z "$(find "$d" -not -user "$me" -print -quit 2>/dev/null)" ]; then
    rm -rf "$d" && echo "==> Удалён старый бэкап: $d"
  else
    echo "==> Пропущен (есть root-owned файлы, нужен sudo): $d"
  fi
done

echo "==> Готово."
