#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-/var/www/html/pokrovka}"
ZIGBEE_DIR="${ZIGBEE_DIR:-/opt/zigbee2mqtt}"
ZIGBEE_USER="${ZIGBEE_USER:-zigbee2mqtt}"
ZIGBEE_ADAPTER="${ZIGBEE_ADAPTER:-}"
ZIGBEE_ADAPTER_TYPE="${ZIGBEE_ADAPTER_TYPE:-zstack}"
ZIGBEE_FRONTEND_PORT="${ZIGBEE_FRONTEND_PORT:-8081}"
MQTT_PORT="${MQTT_PORT:-1883}"
MQTT_SERVICE="${MQTT_SERVICE:-mosquitto.service}"
API_SERVICE="${API_SERVICE:-pokrovka-api.service}"
API_PORT="${API_PORT:-3010}"
API_HOST="${API_HOST:-0.0.0.0}"
OLD_DOCKER_STACK_DIR="${OLD_DOCKER_STACK_DIR:-/opt/pokrovka-zigbee}"
TZ_VALUE="${TZ:-Europe/Istanbul}"
INSTALL_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
# По умолчанию делаем настоящую чистую Zigbee-установку: старая сеть удаляется, устройства нужно добавить заново.
# Если нужно сохранить старую Zigbee-сеть: sudo ZIGBEE_RESET_NETWORK=0 ./install_pokrovka_zigbee.fixed.sh install
ZIGBEE_RESET_NETWORK="${ZIGBEE_RESET_NETWORK:-1}"
CLEAN_ZIGBEE_INSTALL="${CLEAN_ZIGBEE_INSTALL:-1}"
ZIGBEE_DATA_BACKUP_DIR=""

log() { printf '\033[1;34m%s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }
need_root() { [[ "${EUID:-$(id -u)}" -eq 0 ]] || fail "Запусти от root: sudo $0 $*"; }

usage() {
  cat <<USAGE
Использование:
  sudo $0 install       # чисто установить Mosquitto + Zigbee2MQTT + API/UI, удалить старые службы/процессы
  sudo $0 status        # показать статус Mosquitto, Zigbee2MQTT и API
  sudo $0 logs          # смотреть логи Zigbee2MQTT
  sudo $0 restart       # перезапустить Mosquitto + Zigbee2MQTT + API
  sudo $0 repair-config # восстановить Zigbee network параметры из backup/config/journal
  sudo $0 stop          # остановить Zigbee2MQTT
  sudo $0 start         # запустить Zigbee2MQTT
  sudo $0 purge-old     # только остановить/удалить старые pokrovka/zigbee службы и процессы

Переменные:
  PROJECT_DIR=/var/www/html/pokrovka
  ZIGBEE_ADAPTER=/dev/serial/by-id/usb-...      # лучше задать явно, если USB-адаптеров несколько
  ZIGBEE_ADAPTER_TYPE=zstack                    # для Sonoff ZBDongle-P нужен zstack
  ZIGBEE_FRONTEND_PORT=8081                     # веб-интерфейс Zigbee2MQTT
  MQTT_PORT=1883                                # локальный MQTT broker
  API_SERVICE=pokrovka-api.service
  API_PORT=3010
  ZIGBEE_RESET_NETWORK=1                        # 1 чистая новая Zigbee-сеть; 0 попытаться сохранить старую сеть
  CLEAN_ZIGBEE_INSTALL=1                        # 1 переустановить /opt/zigbee2mqtt, сохранив data при ZIGBEE_RESET_NETWORK=0

Важно:
  По умолчанию установщик создаёт новую Zigbee-сеть и удаляет старые backup/data, чтобы не ловить configuration-adapter mismatch.
  Сохранение старой сети только явно: ZIGBEE_RESET_NETWORK=0.
USAGE
}

find_adapter() {
  if [[ -n "$ZIGBEE_ADAPTER" ]]; then
    [[ -e "$ZIGBEE_ADAPTER" ]] || fail "ZIGBEE_ADAPTER задан, но файл не найден: $ZIGBEE_ADAPTER"
    echo "$ZIGBEE_ADAPTER"
    return
  fi

  local by_id_dir="/dev/serial/by-id"
  [[ -d "$by_id_dir" ]] || fail "Не найден $by_id_dir. Проверь, что ZBDongle-P подключён: lsusb && dmesg -T | tail -80"

  mapfile -t candidates < <(find "$by_id_dir" -maxdepth 1 -type l | sort | grep -Ei 'sonoff|itead|zigbee|cc2652|cc1352|cp210|silicon|texas|usb-serial|ch340|1a86' || true)
  if [[ "${#candidates[@]}" -eq 0 ]]; then
    mapfile -t candidates < <(find "$by_id_dir" -maxdepth 1 -type l | sort || true)
  fi

  if [[ "${#candidates[@]}" -eq 0 ]]; then
    fail "USB serial адаптер не найден. Проверь: ls -l /dev/serial/by-id/"
  fi

  if [[ "${#candidates[@]}" -gt 1 ]]; then
    warn "Найдено несколько USB serial устройств:"
    printf '  %s\n' "${candidates[@]}"
    fail "Задай нужный явно: sudo ZIGBEE_ADAPTER=/dev/serial/by-id/<имя> $0 install"
  fi

  echo "${candidates[0]}"
}

unit_exists() {
  systemctl list-unit-files "$1" >/dev/null 2>&1 || [[ -f "/etc/systemd/system/$1" ]]
}

kill_port_processes() {
  local port="$1" label="$2"
  local lines pids pid args comm
  mapfile -t lines < <(ss -ltnp 2>/dev/null | awk -v p=":${port}" '$4 ~ p {print}' || true)
  [[ "${#lines[@]}" -eq 0 ]] && return 0

  warn "Порт ${port} занят (${label}). Проверяю процессы:"
  printf '  %s\n' "${lines[@]}"
  mapfile -t pids < <(printf '%s\n' "${lines[@]}" | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u || true)

  for pid in "${pids[@]}"; do
    [[ -n "$pid" ]] || continue
    comm="$(ps -p "$pid" -o comm= 2>/dev/null | tr -d ' ' || true)"
    args="$(ps -p "$pid" -o args= 2>/dev/null || true)"
    warn "PID $pid: $args"
    case "$port" in
      "$API_PORT")
        if [[ "$comm" == "node" || "$args" == *"DEMO_ENDPOINT"* || "$args" == *"server.js"* ]]; then kill "$pid" 2>/dev/null || true; fi
        ;;
      "$ZIGBEE_FRONTEND_PORT")
        if [[ "$comm" == "node" || "$args" == *"zigbee2mqtt"* ]]; then kill "$pid" 2>/dev/null || true; fi
        ;;
      "$MQTT_PORT")
        if [[ "$comm" == "mosquitto" || "$args" == *"mosquitto"* || "$args" == *"docker-proxy"* || "$args" == *"containerd-shim"* ]]; then kill "$pid" 2>/dev/null || true; fi
        ;;
    esac
  done

  sleep 2
  mapfile -t lines < <(ss -ltnp 2>/dev/null | awk -v p=":${port}" '$4 ~ p {print}' || true)
  if [[ "${#lines[@]}" -gt 0 ]]; then
    mapfile -t pids < <(printf '%s\n' "${lines[@]}" | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u || true)
    for pid in "${pids[@]}"; do
      args="$(ps -p "$pid" -o args= 2>/dev/null || true)"
      case "$port" in
        "$API_PORT") [[ "$args" == *"DEMO_ENDPOINT"* || "$args" == *"server.js"* ]] && kill -9 "$pid" 2>/dev/null || true ;;
        "$ZIGBEE_FRONTEND_PORT") [[ "$args" == *"zigbee2mqtt"* || "$args" == *"node"* ]] && kill -9 "$pid" 2>/dev/null || true ;;
        "$MQTT_PORT") [[ "$args" == *"mosquitto"* || "$args" == *"docker"* || "$args" == *"containerd-shim"* ]] && kill -9 "$pid" 2>/dev/null || true ;;
      esac
    done
  fi
}

stop_old_docker_stack() {
  if command -v docker >/dev/null 2>&1; then
    warn "Останавливаю старые Docker-контейнеры Zigbee/MQTT, если они есть"
    mapfile -t names < <(docker ps -a --format '{{.Names}}' 2>/dev/null | grep -Ei 'pokrovka.*zigbee|zigbee2mqtt|mosquitto|pokrovka-mosquitto' || true)
    if [[ "${#names[@]}" -gt 0 ]]; then
      docker rm -f "${names[@]}" || true
    fi
  fi

  if [[ -d "$OLD_DOCKER_STACK_DIR" ]]; then
    warn "Найден старый Docker-stack: $OLD_DOCKER_STACK_DIR. Останавливаю."
    if command -v docker >/dev/null 2>&1 && [[ -f "$OLD_DOCKER_STACK_DIR/docker-compose.yml" ]]; then
      (
        cd "$OLD_DOCKER_STACK_DIR"
        if docker compose version >/dev/null 2>&1; then
          docker compose down --remove-orphans || true
        elif command -v docker-compose >/dev/null 2>&1; then
          docker-compose down --remove-orphans || true
        fi
      ) || true
    fi
  fi
}

purge_old_services_and_processes() {
  need_root "$@"
  log "0/10 Удаляю старые службы и процессы Pokrovka/Zigbee"

  for svc in zigbee2mqtt.service "$API_SERVICE" pokrovka-api.service pokrovka-mosquitto.service; do
    systemctl stop "$svc" >/dev/null 2>&1 || true
    systemctl disable "$svc" >/dev/null 2>&1 || true
    systemctl reset-failed "$svc" >/dev/null 2>&1 || true
  done

  # Штатный mosquitto не удаляем, но останавливаем перед чистой настройкой.
  systemctl stop mosquitto.service >/dev/null 2>&1 || true
  systemctl reset-failed mosquitto.service >/dev/null 2>&1 || true

  stop_old_docker_stack

  for unit in /etc/systemd/system/zigbee2mqtt.service /etc/systemd/system/pokrovka-api.service /etc/systemd/system/pokrovka-mosquitto.service; do
    if [[ -f "$unit" ]]; then
      cp -a "$unit" "$unit.backup.$(date +%Y%m%d-%H%M%S)" || true
      rm -f "$unit"
    fi
  done
  systemctl daemon-reload

  kill_port_processes "$API_PORT" "старый API"
  kill_port_processes "$ZIGBEE_FRONTEND_PORT" "старый Zigbee2MQTT frontend"
  kill_port_processes "$MQTT_PORT" "старый MQTT"

  if [[ "${ZIGBEE_RESET_NETWORK:-1}" == "1" ]]; then
    warn "Чистый Zigbee reset: удаляю старые data/backup, чтобы не было configuration-adapter mismatch"
    rm -rf /opt/zigbee2mqtt/data /opt/pokrovka-zigbee-data-backup-* 2>/dev/null || true
  fi

  # Убираем старые конфиги, которые уже ломали mosquitto Duplicate persistence_location.
  mkdir -p /etc/mosquitto/conf.d
  for conf in /etc/mosquitto/conf.d/pokrovka-zigbee.conf /etc/mosquitto/pokrovka-mosquitto.conf; do
    if [[ -f "$conf" ]]; then
      cp -a "$conf" "$conf.backup.$(date +%Y%m%d-%H%M%S)" || true
      rm -f "$conf"
    fi
  done
}

backup_existing_zigbee_data() {
  ZIGBEE_DATA_BACKUP_DIR=""
  if [[ -d "$ZIGBEE_DIR/data" && "$ZIGBEE_RESET_NETWORK" != "1" ]]; then
    ZIGBEE_DATA_BACKUP_DIR="/opt/pokrovka-zigbee-data-backup-$(date +%Y%m%d-%H%M%S)"
    log "Сохраняю существующие Zigbee data: $ZIGBEE_DATA_BACKUP_DIR"
    mkdir -p "$ZIGBEE_DATA_BACKUP_DIR"
    cp -a "$ZIGBEE_DIR/data/." "$ZIGBEE_DATA_BACKUP_DIR/" || true
  elif [[ "$ZIGBEE_RESET_NETWORK" == "1" ]]; then
    warn "ZIGBEE_RESET_NETWORK=1: будет создана новая Zigbee-сеть, все устройства нужно будет добавить заново"
    rm -rf "$ZIGBEE_DIR/data" 2>/dev/null || true
  fi
}

install_packages() {
  log "1/10 Устанавливаю системные пакеты без Docker"
  export DEBIAN_FRONTEND=noninteractive

  apt-get update
  apt-get install -y ca-certificates curl gnupg lsb-release apt-transport-https git make g++ gcc libsystemd-dev udev mosquitto mosquitto-clients

  # ВАЖНО: не ставим отдельный пакет npm из Ubuntu.
  # У NodeSource npm уже входит в пакет nodejs, иначе apt падает: nodejs : Conflicts: npm.
  local major=""
  if command -v node >/dev/null 2>&1; then
    major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
  fi

  if [[ -z "$major" || "$major" -lt 20 ]] || ! command -v npm >/dev/null 2>&1; then
    log "Ставлю/обновляю Node.js 20.x из NodeSource для Zigbee2MQTT"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  else
    log "Node.js уже подходит: $(node -v), npm: $(npm -v)"
  fi

  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    fail "Node.js/npm не найдены после установки. Проверь: node -v && npm -v"
  fi

  if ! command -v corepack >/dev/null 2>&1; then
    fail "corepack не найден. Проверь установку Node.js: node -v && npm -v"
  fi

  corepack enable
  corepack prepare pnpm@latest --activate
}

mqtt_pub_test() {
  mosquitto_pub -h 127.0.0.1 -p "${MQTT_PORT}" -t pokrovka/install-test -m ok -q 0 >/dev/null 2>&1
}

configure_mosquitto() {
  log "2/10 Настраиваю Mosquitto MQTT broker"

  mkdir -p /etc/mosquitto/conf.d /var/lib/mosquitto /var/log/mosquitto
  chown -R mosquitto:mosquitto /var/lib/mosquitto /var/log/mosquitto 2>/dev/null || true

  cat > /etc/mosquitto/conf.d/pokrovka-zigbee.conf <<MOSQ
# Pokrovka Zigbee local MQTT broker
# Только локальный MQTT для Zigbee2MQTT и API.
listener ${MQTT_PORT} 127.0.0.1
allow_anonymous true
MOSQ

  systemctl reset-failed mosquitto.service || true
  systemctl enable mosquitto.service >/dev/null 2>&1 || true

  if systemctl restart mosquitto.service && mqtt_pub_test; then
    log "Mosquitto запущен штатным сервисом mosquitto.service"
    MQTT_SERVICE="mosquitto.service"
    return
  fi

  warn "Штатный mosquitto.service не стартовал. Показываю последние строки лога:"
  journalctl -u mosquitto.service -n 80 --no-pager || true

  warn "Перехожу на отдельный сервис pokrovka-mosquitto.service с чистым конфигом"
  systemctl stop mosquitto.service >/dev/null 2>&1 || true
  systemctl disable mosquitto.service >/dev/null 2>&1 || true
  systemctl reset-failed mosquitto.service >/dev/null 2>&1 || true
  kill_port_processes "$MQTT_PORT" "MQTT fallback"

  cat > /etc/mosquitto/pokrovka-mosquitto.conf <<MOSQ
# Standalone Mosquitto config for Pokrovka Zigbee
per_listener_settings false
listener ${MQTT_PORT} 127.0.0.1
allow_anonymous true
persistence true
persistence_location /var/lib/mosquitto/
log_dest stdout
MOSQ

  cat > /etc/systemd/system/pokrovka-mosquitto.service <<SERVICE
[Unit]
Description=Pokrovka local Mosquitto MQTT Broker
After=network.target

[Service]
Type=simple
User=mosquitto
Group=mosquitto
ExecStart=/usr/sbin/mosquitto -c /etc/mosquitto/pokrovka-mosquitto.conf
Restart=on-failure
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE

  systemctl daemon-reload
  systemctl enable pokrovka-mosquitto.service >/dev/null 2>&1 || true
  systemctl restart pokrovka-mosquitto.service

  if ! mqtt_pub_test; then
    journalctl -u pokrovka-mosquitto.service -n 120 --no-pager || true
    fail "MQTT broker не поднялся на 127.0.0.1:${MQTT_PORT}. Проверь, не занят ли порт: sudo ss -ltnp | grep ':${MQTT_PORT}'"
  fi

  MQTT_SERVICE="pokrovka-mosquitto.service"
  log "Mosquitto запущен отдельным сервисом ${MQTT_SERVICE}"
}

create_zigbee_user() {
  log "3/10 Создаю системного пользователя $ZIGBEE_USER"
  if ! id "$ZIGBEE_USER" >/dev/null 2>&1; then
    useradd --system --home-dir "$ZIGBEE_DIR" --shell /usr/sbin/nologin --groups dialout "$ZIGBEE_USER"
  else
    usermod -aG dialout "$ZIGBEE_USER" || true
  fi
}

install_zigbee2mqtt() {
  log "4/10 Устанавливаю Zigbee2MQTT в $ZIGBEE_DIR"

  backup_existing_zigbee_data

  if [[ "$CLEAN_ZIGBEE_INSTALL" == "1" && -d "$ZIGBEE_DIR" ]]; then
    local backup_dir="${ZIGBEE_DIR}.backup.$(date +%Y%m%d-%H%M%S)"
    warn "Чистая переустановка: сохраняю старый $ZIGBEE_DIR как $backup_dir"
    mv "$ZIGBEE_DIR" "$backup_dir"
  fi

  if [[ "$ZIGBEE_RESET_NETWORK" == "1" ]]; then
    warn "Полный сброс Zigbee2MQTT data: старый coordinator_backup.json не будет восстановлен"
    ZIGBEE_DATA_BACKUP_DIR=""
  fi

  if [[ ! -d "$ZIGBEE_DIR/.git" ]]; then
    mkdir -p "$(dirname "$ZIGBEE_DIR")"
    git clone --depth 1 https://github.com/Koenkk/zigbee2mqtt.git "$ZIGBEE_DIR"
  else
    log "Zigbee2MQTT уже установлен, обновляю git-репозиторий"
    git -C "$ZIGBEE_DIR" fetch --depth 1 origin master || true
    git -C "$ZIGBEE_DIR" reset --hard origin/master || true
  fi

  mkdir -p "$ZIGBEE_DIR/data"
  if [[ -n "$ZIGBEE_DATA_BACKUP_DIR" && -d "$ZIGBEE_DATA_BACKUP_DIR" && "$ZIGBEE_RESET_NETWORK" != "1" ]]; then
    log "Возвращаю Zigbee data из backup, чтобы сохранить сеть"
    cp -a "$ZIGBEE_DATA_BACKUP_DIR/." "$ZIGBEE_DIR/data/" || true
  fi

  chown -R "$ZIGBEE_USER:$ZIGBEE_USER" "$ZIGBEE_DIR"

  runuser -u "$ZIGBEE_USER" -- bash -lc "cd '$ZIGBEE_DIR' && pnpm install --frozen-lockfile"
}

recover_network_yaml() {
  local backup_json="$ZIGBEE_DIR/data/coordinator_backup.json"
  local config_yaml="$ZIGBEE_DIR/data/configuration.yaml"
  local old_backup_json="${ZIGBEE_DATA_BACKUP_DIR}/coordinator_backup.json"
  local old_config_yaml="${ZIGBEE_DATA_BACKUP_DIR}/configuration.yaml"

  if [[ "$ZIGBEE_RESET_NETWORK" == "1" ]]; then
    return 2
  fi

  node - "$backup_json" "$config_yaml" "$old_backup_json" "$old_config_yaml" <<'NODE' 2>/dev/null || true
const fs = require('fs');
const paths = process.argv.slice(2);

function parseNum(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) return parseNum(v[0]);
  if (typeof v === 'object') {
    for (const k of ['value', 'panID', 'panId', 'pan_id', 'channel']) {
      if (v[k] !== undefined) return parseNum(v[k]);
    }
    return null;
  }
  const s = String(v).trim().replace(/^['"]|['"]$/g, '');
  if (/^0x/i.test(s)) return parseInt(s, 16);
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function bytes(v, wantLen) {
  if (v === undefined || v === null || v === '') return null;
  if (Array.isArray(v)) {
    const arr = v.map((x) => Number(x)).filter((x) => Number.isFinite(x));
    return arr.length === wantLen ? arr : null;
  }
  if (typeof v === 'object') {
    for (const k of ['key', 'value', 'data', 'bytes']) {
      const b = bytes(v[k], wantLen);
      if (b) return b;
    }
    return null;
  }
  let s = String(v).trim().replace(/^['"]|['"]$/g, '');
  if (/^\[.*\]$/.test(s)) {
    try {
      const arr = JSON.parse(s.replace(/'/g, '"'));
      return bytes(arr, wantLen);
    } catch {}
  }
  if (s.includes(',')) {
    const arr = s.replace(/[\[\]]/g, '').split(',').map((x) => Number(x.trim())).filter((x) => Number.isFinite(x));
    return arr.length === wantLen ? arr : null;
  }
  s = s.replace(/^0x/i, '').replace(/[^0-9a-f]/ig, '');
  if (!s || s.length !== wantLen * 2) return null;
  const out = [];
  for (let i = 0; i < s.length; i += 2) out.push(parseInt(s.slice(i, i + 2), 16));
  return out.length === wantLen ? out : null;
}

function findDeep(obj, names) {
  const wanted = new Set(names.map((x) => String(x).toLowerCase()));
  const seen = new Set();
  const stack = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object' || seen.has(cur)) continue;
    seen.add(cur);
    for (const [k, v] of Object.entries(cur)) {
      if (wanted.has(String(k).toLowerCase())) return v;
      if (v && typeof v === 'object') stack.push(v);
    }
  }
  return null;
}

function yamlValue(text, key) {
  const re = new RegExp('^\\s*' + key + '\\s*:\\s*(.+?)\\s*$', 'm');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function fromJson(path) {
  if (!path || !fs.existsSync(path)) return null;
  try {
    const b = JSON.parse(fs.readFileSync(path, 'utf8'));
    const panId = parseNum(findDeep(b, ['pan_id', 'panId', 'panID']));
    const extPan = bytes(findDeep(b, ['extended_pan_id', 'ext_pan_id', 'extendedPanId', 'extendedPanID', 'extPanId', 'extPanID']), 8);
    const networkKey = bytes(findDeep(b, ['network_key', 'networkKey', 'nwk_key', 'nwkKey']), 16) || bytes(findDeep(b, ['key']), 16);
    const channel = parseNum(findDeep(b, ['channel', 'logical_channel', 'logicalChannel', 'current_channel', 'currentChannel'])) || 11;
    if (panId && extPan && networkKey) return {source: path, channel, panId, extPan, networkKey};
  } catch {}
  return null;
}

function fromYaml(path) {
  if (!path || !fs.existsSync(path)) return null;
  const y = fs.readFileSync(path, 'utf8');
  const keyRaw = yamlValue(y, 'network_key');
  const extRaw = yamlValue(y, 'ext_pan_id');
  const panRaw = yamlValue(y, 'pan_id');
  if (/GENERATE/i.test(String(keyRaw)) || /GENERATE/i.test(String(extRaw)) || /GENERATE/i.test(String(panRaw))) return null;
  const panId = parseNum(panRaw);
  const extPan = bytes(extRaw, 8);
  const networkKey = bytes(keyRaw, 16);
  const channel = parseNum(yamlValue(y, 'channel')) || 11;
  if (panId && extPan && networkKey) return {source: path, channel, panId, extPan, networkKey};
  return null;
}

let found = null;
for (const path of paths) {
  if (!found && path.endsWith('.json')) found = fromJson(path);
  if (!found && path.endsWith('.yaml')) found = fromYaml(path);
}

if (!found) process.exit(2);
console.log(`# Recovered Zigbee network parameters from ${found.source}`);
console.log(`  channel: ${found.channel || 11}`);
console.log(`  pan_id: ${found.panId}`);
console.log(`  ext_pan_id: [${found.extPan.join(', ')}]`);
console.log(`  network_key: [${found.networkKey.join(', ')}]`);
NODE
}

recover_network_from_journal() {
  if [[ "$ZIGBEE_RESET_NETWORK" == "1" ]]; then
    return 2
  fi

  # Берём только свежие строки текущей установки/ремонта, чтобы не подхватить старую сеть из прошлых запусков.
  local since_arg="${INSTALL_STARTED_AT:-10 minutes ago}"
  journalctl -u zigbee2mqtt.service --since "$since_arg" -n 4000 --no-pager 2>/dev/null | node -e '
const fs = require("fs");
const text = fs.readFileSync(0, "utf8");
function last(re) { const m = [...text.matchAll(re)]; return m.length ? m[m.length - 1][1] : null; }
function hexToBytes(s, n) {
  s = String(s || "").replace(/^0x/i, "").replace(/[^0-9a-f]/ig, "");
  if (s.length !== n * 2) return [];
  const out = [];
  for (let i = 0; i < s.length; i += 2) out.push(parseInt(s.slice(i, i + 2), 16));
  return out;
}
const pan = last(/- PAN ID:\s*configured=.*?adapter=([0-9]+)/g);
const ext = last(/- Extended PAN ID:\s*configured=.*?adapter=([0-9a-fA-F]+)/g);
const key = last(/Network Key:.*?adapter:active=([0-9a-fA-F]{32})/g);
const channel = last(/- Channel List:\s*configured=.*?adapter=([0-9]+)/g) || "11";
const extBytes = hexToBytes(ext, 8);
const keyBytes = hexToBytes(key, 16);
if (pan && extBytes.length === 8 && keyBytes.length === 16) {
  console.log("# Recovered Zigbee network parameters from current zigbee2mqtt mismatch log");
  console.log(`  channel: ${Number(channel) || 11}`);
  console.log(`  pan_id: ${Number(pan)}`);
  console.log(`  ext_pan_id: [${extBytes.join(", ")}]`);
  console.log(`  network_key: [${keyBytes.join(", ")}]`);
} else {
  process.exit(2);
}
' 2>/dev/null || true
}

write_zigbee_config() {
  local adapter_path="$1"
  log "5/10 Пишу configuration.yaml для ZBDongle-P: $adapter_path"

  mkdir -p "$ZIGBEE_DIR/data"

  if [[ -f "$ZIGBEE_DIR/data/configuration.yaml" ]]; then
    cp -a "$ZIGBEE_DIR/data/configuration.yaml" "$ZIGBEE_DIR/data/configuration.yaml.backup.$(date +%Y%m%d-%H%M%S)" || true
  fi

  local recovered_yaml=""
  # При обычной установке сначала пробуем сохранить параметры из backup/config.
  # Journal используем только в repair-mode и при auto-mismatch после реальной попытки старта,
  # чтобы не подхватить старую сеть из прошлых запусков.
  recovered_yaml="$(recover_network_yaml || true)"
  if [[ -z "$recovered_yaml" && "${ZIGBEE_REPAIR_MODE:-0}" == "1" ]]; then
    recovered_yaml="$(recover_network_from_journal || true)"
  fi

  if [[ -n "$recovered_yaml" ]]; then
    log "Сохраняю существующую Zigbee-сеть, устройства перепривязывать не нужно"
  else
    if [[ "${ZIGBEE_REPAIR_MODE:-0}" == "1" ]]; then
      fail "Не смог восстановить параметры Zigbee-сети из backup/config/journal. Не генерирую новую сеть в repair-config. Пришли: sudo journalctl -u zigbee2mqtt -n 160 --no-pager"
    fi
    if [[ "$ZIGBEE_RESET_NETWORK" == "1" ]]; then
      warn "Создаю новую Zigbee-сеть: все устройства нужно будет добавить заново"
    else
      warn "Не нашёл существующие параметры Zigbee-сети. Это первая чистая установка: использую GENERATE."
    fi
    recovered_yaml="  channel: 11
  network_key: GENERATE
  pan_id: GENERATE
  ext_pan_id: GENERATE"
  fi

  cat > "$ZIGBEE_DIR/data/configuration.yaml" <<YAML
version: 5
mqtt:
  base_topic: zigbee2mqtt
  server: mqtt://127.0.0.1:${MQTT_PORT}
serial:
  port: ${adapter_path}
  adapter: ${ZIGBEE_ADAPTER_TYPE}
frontend:
  enabled: true
  host: 0.0.0.0
  port: ${ZIGBEE_FRONTEND_PORT}
homeassistant:
  enabled: false
permit_join: false
availability:
  enabled: true
advanced:
${recovered_yaml}
  log_level: info
YAML

  chown -R "$ZIGBEE_USER:$ZIGBEE_USER" "$ZIGBEE_DIR/data"
}

repair_zigbee_config() {
  need_root "$@"
  ADAPTER_PATH="$(find_adapter)"
  systemctl stop zigbee2mqtt.service >/dev/null 2>&1 || true
  ZIGBEE_REPAIR_MODE=1 write_zigbee_config "$ADAPTER_PATH"
  systemctl restart zigbee2mqtt.service
  sleep 5
  systemctl --no-pager --full status zigbee2mqtt.service || true
  journalctl -u zigbee2mqtt.service -n 100 --no-pager || true
}

write_zigbee_service() {
  log "6/10 Создаю systemd-сервис zigbee2mqtt.service"

  cat > /etc/systemd/system/zigbee2mqtt.service <<SERVICE
[Unit]
Description=Zigbee2MQTT for Pokrovka Smart Home
After=network.target ${MQTT_SERVICE}
Wants=${MQTT_SERVICE}

[Service]
Environment=NODE_ENV=production
Environment=TZ=${TZ_VALUE}
Type=simple
ExecStart=/usr/bin/node ${ZIGBEE_DIR}/index.js
WorkingDirectory=${ZIGBEE_DIR}
User=${ZIGBEE_USER}
Group=${ZIGBEE_USER}
SupplementaryGroups=dialout
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE

  systemctl daemon-reload
  systemctl enable zigbee2mqtt.service
  systemctl restart zigbee2mqtt.service
}

zigbee_mismatch_seen() {
  journalctl -u zigbee2mqtt.service -n 240 --no-pager 2>/dev/null | grep -q "configuration-adapter mismatch\|Configuration is not consistent with adapter state/backup"
}

try_auto_repair_mismatch() {
  if [[ "$ZIGBEE_RESET_NETWORK" == "1" ]]; then
    return 1
  fi

  if ! zigbee_mismatch_seen; then
    return 1
  fi

  local adapter_path recovered_yaml
  adapter_path="$(find_adapter)"
  recovered_yaml="$(recover_network_from_journal || true)"

  if [[ -z "$recovered_yaml" ]]; then
    warn "Вижу configuration-adapter mismatch, но не смог извлечь параметры адаптера из свежего journalctl."
    return 1
  fi

  warn "Обнаружен configuration-adapter mismatch. Переписываю configuration.yaml под фактическое состояние ZBDongle-P:"
  printf '%s\n' "$recovered_yaml"
  systemctl stop zigbee2mqtt.service >/dev/null 2>&1 || true

  mkdir -p "$ZIGBEE_DIR/data"
  if [[ -f "$ZIGBEE_DIR/data/configuration.yaml" ]]; then
    cp -a "$ZIGBEE_DIR/data/configuration.yaml" "$ZIGBEE_DIR/data/configuration.yaml.mismatch.$(date +%Y%m%d-%H%M%S)" || true
  fi

  cat > "$ZIGBEE_DIR/data/configuration.yaml" <<YAML
version: 5
mqtt:
  base_topic: zigbee2mqtt
  server: mqtt://127.0.0.1:${MQTT_PORT}
serial:
  port: ${adapter_path}
  adapter: ${ZIGBEE_ADAPTER_TYPE}
frontend:
  enabled: true
  host: 0.0.0.0
  port: ${ZIGBEE_FRONTEND_PORT}
homeassistant:
  enabled: false
permit_join: false
availability:
  enabled: true
advanced:
${recovered_yaml}
  log_level: info
YAML

  chown -R "$ZIGBEE_USER:$ZIGBEE_USER" "$ZIGBEE_DIR/data" || true
  systemctl reset-failed zigbee2mqtt.service >/dev/null 2>&1 || true
  systemctl restart zigbee2mqtt.service
  return 0
}

wait_for_zigbee() {
  log "Жду запуска Zigbee2MQTT и frontend ${ZIGBEE_FRONTEND_PORT}"
  local attempt i

  for attempt in 1 2 3; do
    for i in $(seq 1 25); do
      if systemctl is-active --quiet zigbee2mqtt.service && curl -fsS "http://127.0.0.1:${ZIGBEE_FRONTEND_PORT}" >/dev/null 2>&1; then
        log "Zigbee2MQTT frontend поднят: http://127.0.0.1:${ZIGBEE_FRONTEND_PORT}"
        return 0
      fi
      if [[ "$ZIGBEE_RESET_NETWORK" != "1" ]] && zigbee_mismatch_seen; then
        warn "Попытка ${attempt}/3: Zigbee2MQTT упал из-за mismatch сети. Запускаю автоисправление."
        try_auto_repair_mismatch || true
        sleep 5
        continue 2
      fi
      sleep 2
    done

    if zigbee_mismatch_seen; then
      warn "Попытка ${attempt}/3: Zigbee2MQTT упал из-за mismatch сети. Запускаю автоисправление."
      try_auto_repair_mismatch || true
      sleep 5
      continue
    fi

    warn "Попытка ${attempt}/3: frontend ещё не поднялся, перезапускаю Zigbee2MQTT."
    systemctl reset-failed zigbee2mqtt.service >/dev/null 2>&1 || true
    systemctl restart zigbee2mqtt.service || true
  done

  systemctl --no-pager --full status zigbee2mqtt.service || true
  journalctl -u zigbee2mqtt.service --since "${INSTALL_STARTED_AT:-10 minutes ago}" -n 260 --no-pager || true
  ss -ltnp | grep ":${ZIGBEE_FRONTEND_PORT}" || true
  fail "Zigbee2MQTT не поднялся. Смотри лог выше."
}

install_node_dependencies() {
  log "7/10 Устанавливаю зависимости API"
  [[ -d "$PROJECT_DIR/DEMO_ENDPOINT" ]] || fail "Не найдена директория API: $PROJECT_DIR/DEMO_ENDPOINT"
  cd "$PROJECT_DIR/DEMO_ENDPOINT"
  npm install --omit=dev
}

build_frontend() {
  log "8/10 Собираю React UI"
  [[ -f "$PROJECT_DIR/package.json" ]] || fail "Не найден package.json проекта: $PROJECT_DIR/package.json"
  cd "$PROJECT_DIR"
  npm install
  NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}" npm run build
}

configure_api_env() {
  log "9/10 Настраиваю API-сервис и переменные Zigbee"
  [[ -f "$PROJECT_DIR/DEMO_ENDPOINT/server.js" ]] || fail "Не найден API server.js: $PROJECT_DIR/DEMO_ENDPOINT/server.js"

  cat > "/etc/systemd/system/${API_SERVICE}" <<SERVICE
[Unit]
Description=Pokrovka Smart Home API
After=network.target ${MQTT_SERVICE}
Wants=${MQTT_SERVICE}

[Service]
Type=simple
WorkingDirectory=${PROJECT_DIR}/DEMO_ENDPOINT
Environment=NODE_ENV=production
Environment=HOST=${API_HOST}
Environment=PORT=${API_PORT}
Environment=ZIGBEE_MQTT_URL=mqtt://127.0.0.1:${MQTT_PORT}
Environment=ZIGBEE_BASE_TOPIC=zigbee2mqtt
Environment=ZIGBEE_FRONTEND_URL=http://localhost:${ZIGBEE_FRONTEND_PORT}
ExecStart=/usr/bin/node ${PROJECT_DIR}/DEMO_ENDPOINT/server.js
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE

  systemctl daemon-reload
  systemctl enable "$API_SERVICE" >/dev/null 2>&1 || true
}

api_port_pids() {
  ss -ltnp 2>/dev/null | awk -v port=":${API_PORT}" '$4 ~ port {print}' | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u || true
}

free_api_port() {
  kill_port_processes "$API_PORT" "старый API"
}

restart_api() {
  log "10/10 Перезапускаю API: $API_SERVICE"
  systemctl stop "$API_SERVICE" >/dev/null 2>&1 || true
  free_api_port
  systemctl restart "$API_SERVICE"
  sleep 3

  if ! curl -fsS "http://127.0.0.1:${API_PORT}/api/zigbee/status" >/dev/null 2>&1; then
    warn "API запустился, но /api/zigbee/status не отвечает. Показываю диагностику:"
    systemctl --no-pager --full status "$API_SERVICE" || true
    journalctl -u "$API_SERVICE" -n 160 --no-pager || true
    ss -ltnp | grep ":${API_PORT}" || true
    fail "Не удалось подтвердить новый Zigbee API на http://127.0.0.1:${API_PORT}/api/zigbee/status"
  fi

  log "Zigbee API подтверждён: http://127.0.0.1:${API_PORT}/api/zigbee/status"
}

show_status() {
  echo
  log "Статус Zigbee"
  echo "Zigbee2MQTT UI: http://<IP-сервера>:${ZIGBEE_FRONTEND_PORT}"
  echo "MQTT: mqtt://127.0.0.1:${MQTT_PORT}"
  echo "Zigbee config: ${ZIGBEE_DIR}/data/configuration.yaml"
  echo "API: http://127.0.0.1:${API_PORT}/api/zigbee/status"
  echo
  systemctl --no-pager --full status mosquitto.service || true
  echo
  systemctl --no-pager --full status pokrovka-mosquitto.service || true
  echo
  systemctl --no-pager --full status zigbee2mqtt.service || true
  echo
  systemctl --no-pager --full status "$API_SERVICE" || true
  echo
  echo "Порты:"
  ss -ltnp | grep -E ":(${MQTT_PORT}|${ZIGBEE_FRONTEND_PORT}|${API_PORT})" || true
  echo
  echo "Проверка API Zigbee:"
  curl -fsS "http://127.0.0.1:${API_PORT}/api/zigbee/status" || true
  echo
}

cmd="${1:-install}"
case "$cmd" in
  install)
    need_root "$@"
    [[ -d "$PROJECT_DIR" ]] || fail "Не найдена директория проекта: $PROJECT_DIR"
    ADAPTER_PATH="$(find_adapter)"
    log "Использую Zigbee адаптер: $ADAPTER_PATH"
    purge_old_services_and_processes "$@"
    install_packages
    configure_mosquitto
    create_zigbee_user
    install_zigbee2mqtt
    write_zigbee_config "$ADAPTER_PATH"
    write_zigbee_service
    wait_for_zigbee
    install_node_dependencies
    build_frontend
    configure_api_env
    restart_api
    show_status
    ;;
  purge-old)
    purge_old_services_and_processes "$@"
    ;;
  status)
    show_status
    ;;
  logs)
    journalctl -u zigbee2mqtt.service -f -n 200
    ;;
  repair-config)
    repair_zigbee_config "$@"
    ;;
  restart)
    need_root "$@"
    if systemctl list-unit-files | grep -q "^pokrovka-mosquitto.service"; then
      systemctl restart pokrovka-mosquitto.service || true
    else
      systemctl restart mosquitto.service || true
    fi
    systemctl restart zigbee2mqtt.service
    wait_for_zigbee
    restart_api
    show_status
    ;;
  stop)
    need_root "$@"
    systemctl stop zigbee2mqtt.service
    show_status
    ;;
  start)
    need_root "$@"
    systemctl start zigbee2mqtt.service
    wait_for_zigbee
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
