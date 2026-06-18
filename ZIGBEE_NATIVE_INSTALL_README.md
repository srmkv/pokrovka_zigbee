# Pokrovka Zigbee native install

Эта версия установщика больше не использует Docker для Zigbee2MQTT.

Причина: на сервере Docker/containerd упал с ошибкой overlayfs:

```text
failed to mount ... fstype: overlay ... err: invalid argument
```

Новая схема:

```text
ZBDongle-P -> /dev/serial/by-id/... -> Zigbee2MQTT systemd -> Mosquitto MQTT -> Pokrovka API/UI
```

## Установка

```bash
cd /var/www/html
unzip -o pokrovka-zigbee-server-ui-fixed-v3-native.zip

cd /var/www/html/pokrovka
sudo chmod +x install_pokrovka_zigbee.fixed.sh
sudo ./install_pokrovka_zigbee.fixed.sh install
```

Если на сервере несколько USB-serial устройств:

```bash
ls -l /dev/serial/by-id/

sudo ZIGBEE_ADAPTER=/dev/serial/by-id/<имя_донгла> ./install_pokrovka_zigbee.fixed.sh install
```

## Проверка

```bash
sudo ./install_pokrovka_zigbee.fixed.sh status
sudo ./install_pokrovka_zigbee.fixed.sh logs
curl http://127.0.0.1:3010/api/zigbee/status
```

Zigbee2MQTT frontend:

```text
http://IP_СЕРВЕРА:8081
```

## Управление

```bash
sudo systemctl restart zigbee2mqtt
sudo systemctl status zigbee2mqtt
sudo journalctl -u zigbee2mqtt -f
```
