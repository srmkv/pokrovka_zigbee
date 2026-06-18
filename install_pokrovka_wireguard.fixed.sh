#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-/var/www/html/pokrovka}"
WG_NAME="${WG_NAME:-pokrovka}"
PROJECT_CONF="${PROJECT_CONF:-$PROJECT_DIR/${WG_NAME}.conf}"
WG_CONF_DIR="/etc/wireguard"
WG_CONF="$WG_CONF_DIR/${WG_NAME}.conf"
WG_SERVICE="wg-quick@${WG_NAME}.service"
API_SERVICE="${API_SERVICE:-pokrovka-api.service}"

log() { printf '\033[1;34m%s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }
need_root() { [[ "${EUID:-$(id -u)}" -eq 0 ]] || fail "Запусти от root: sudo $0 $*"; }

usage() {
  cat <<USAGE
Использование:
  sudo $0 install   # установить WireGuard, скопировать $PROJECT_CONF -> $WG_CONF, включить и запустить сервис
  sudo $0 up        # поднять интерфейс через systemd
  sudo $0 down      # опустить интерфейс через systemd
  sudo $0 restart   # перезапустить интерфейс
  sudo $0 status    # показать статус

Переменные:
  PROJECT_DIR=/var/www/html/pokrovka
  WG_NAME=pokrovka
  PROJECT_CONF=/var/www/html/pokrovka/pokrovka.conf
USAGE
}

install_packages() {
  log "1/6 Устанавливаю WireGuard и системные утилиты"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y wireguard wireguard-tools iproute2 ca-certificates
}

install_config() {
  log "2/6 Проверяю конфиг WireGuard"
  mkdir -p "$WG_CONF_DIR"
  chmod 700 "$WG_CONF_DIR"

  if [[ -f "$PROJECT_CONF" ]]; then
    log "Копирую $PROJECT_CONF -> $WG_CONF"
    install -m 600 -o root -g root "$PROJECT_CONF" "$WG_CONF"
  elif [[ -f "$WG_CONF" ]]; then
    warn "Конфиг уже есть: $WG_CONF"
  else
    cat > "$PROJECT_DIR/${WG_NAME}.conf.example" <<'EXAMPLE'
[Interface]
PrivateKey = <PRIVATE_KEY>
Address = 10.8.0.2/24
DNS = 1.1.1.1

[Peer]
PublicKey = <SERVER_PUBLIC_KEY>
Endpoint = <SERVER_HOST>:51820
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
EXAMPLE
    fail "Не найден $PROJECT_CONF и $WG_CONF. Создал пример: $PROJECT_DIR/${WG_NAME}.conf.example"
  fi

  chmod 600 "$WG_CONF"
}

configure_systemd() {
  log "3/6 Включаю автозапуск $WG_SERVICE"
  systemctl daemon-reload
  systemctl enable "$WG_SERVICE"
}

restart_api() {
  log "4/6 Перезапускаю API, чтобы UI увидел /api/vpn/*"
  if systemctl list-unit-files | grep -q "^${API_SERVICE}"; then
    systemctl restart "$API_SERVICE"
  else
    warn "Сервис $API_SERVICE не найден, пропускаю рестарт API"
  fi
}

start_vpn() {
  log "5/6 Поднимаю WireGuard-интерфейс $WG_NAME"
  systemctl start "$WG_SERVICE"
}

show_status() {
  log "6/6 Статус"
  systemctl --no-pager --full status "$WG_SERVICE" || true
  echo
  wg show "$WG_NAME" || true
  echo
  ip addr show dev "$WG_NAME" || true
}

cmd="${1:-install}"
case "$cmd" in
  install)
    need_root "$@"
    [[ -d "$PROJECT_DIR" ]] || fail "Не найдена директория проекта: $PROJECT_DIR"
    install_packages
    install_config
    configure_systemd
    restart_api
    start_vpn
    show_status
    ;;
  up)
    need_root "$@"
    systemctl start "$WG_SERVICE"
    show_status
    ;;
  down)
    need_root "$@"
    systemctl stop "$WG_SERVICE"
    show_status
    ;;
  restart)
    need_root "$@"
    systemctl restart "$WG_SERVICE"
    show_status
    ;;
  status)
    show_status
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage
    fail "Неизвестная команда: $cmd"
    ;;
esac
