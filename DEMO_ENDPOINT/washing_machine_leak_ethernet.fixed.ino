#include <SPI.h>
#include <Ethernet.h>

// -------------------- Пины датчика протечки MH-RD --------------------
const int LEAK_DIGITAL_PIN = 2;   // DO от MH-RD
const int LEAK_ANALOG_PIN  = A0;  // AO от MH-RD
const int RESET_PIN        = 3;   // локальный сброс тревоги: замкнуть на GND
const int LED_PIN          = 7;   // отдельный светодиод тревоги (не D13, т.к. там SPI)

// -------------------- Ethernet --------------------
byte mac[] = { 0xDE, 0xAD, 0xBE, 0xEF, 0xFE, 0x11 };
IPAddress ip(192, 168, 0, 116);       // IP этой Arduino
IPAddress serverIp(192, 168, 0, 100); // IP сервера умного дома
const uint16_t serverPort = 3010;

const char DEVICE_ID[] = "washing-machine-leak-uno";
const char POST_ENDPOINT[] = "/api/sensors/event";
const char COMMAND_ENDPOINT[] = "/api/sensors/by-device/washing-machine-leak-uno/command";

EthernetClient client;

bool alarmActive = false;
bool lastWet = false;
bool lastResetState = HIGH;
unsigned long seqNo = 0;
long lastSeenResetVersion = -1;

unsigned long lastHeartbeatMs = 0;
unsigned long lastCommandPollMs = 0;
const unsigned long HEARTBEAT_INTERVAL = 30000UL;
const unsigned long COMMAND_POLL_INTERVAL = 2000UL;

bool isWetNow() {
  // Для MH-RD: LOW на DO = вода обнаружена
  return digitalRead(LEAK_DIGITAL_PIN) == LOW;
}

void postState(const char* reason) {
  bool wet = isWetNow();
  bool resetClosed = (digitalRead(RESET_PIN) == LOW);
  int ao = analogRead(LEAK_ANALOG_PIN);

  char body[220];
  int bodyLen = snprintf(
    body,
    sizeof(body),
    "{\"deviceId\":\"%s\",\"device\":\"%s\",\"seq\":%lu,\"reason\":\"%s\",\"alarm\":%s,\"rain\":%s,\"ao\":%d,\"reset_closed\":%s}",
    DEVICE_ID,
    DEVICE_ID,
    seqNo++,
    reason,
    alarmActive ? "true" : "false",
    wet ? "true" : "false",
    ao,
    resetClosed ? "true" : "false"
  );

  if (bodyLen <= 0 || bodyLen >= (int)sizeof(body)) {
    Serial.println(F("JSON build error"));
    return;
  }

  if (!client.connect(serverIp, serverPort)) {
    Serial.println(F("POST failed: connect error"));
    client.stop();
    return;
  }

  client.print(F("POST "));
  client.print(POST_ENDPOINT);
  client.println(F(" HTTP/1.1"));
  client.print(F("Host: "));
  client.println(serverIp);
  client.println(F("Connection: close"));
  client.println(F("Content-Type: application/json"));
  client.print(F("Content-Length: "));
  client.println(bodyLen);
  client.println();
  client.write((const uint8_t*)body, bodyLen);

  unsigned long t0 = millis();
  while (client.connected() && millis() - t0 < 1500) {
    while (client.available()) {
      Serial.write(client.read());
    }
  }
  client.stop();
  Serial.println();
}

long parseResetVersion(char* response) {
  char* body = strstr(response, "\r\n\r\n");
  if (body) body += 4;
  else body = response;

  char* p = strstr(body, "resetVersion");
  if (!p) return -1;
  p = strchr(p, ':');
  if (!p) return -1;
  return atol(p + 1);
}

long fetchResetVersion() {
  static char response[420];
  memset(response, 0, sizeof(response));
  int idx = 0;

  if (!client.connect(serverIp, serverPort)) {
    Serial.println(F("CMD failed: connect error"));
    client.stop();
    return -1;
  }

  client.print(F("GET "));
  client.print(COMMAND_ENDPOINT);
  client.println(F(" HTTP/1.1"));
  client.print(F("Host: "));
  client.println(serverIp);
  client.println(F("Connection: close"));
  client.println();

  unsigned long t0 = millis();
  while (millis() - t0 < 1500) {
    while (client.available()) {
      char c = client.read();
      if (idx < (int)sizeof(response) - 1) {
        response[idx++] = c;
      }
    }
    if (!client.connected()) break;
  }
  client.stop();

  return parseResetVersion(response);
}

void setup() {
  Serial.begin(9600);

  pinMode(LEAK_DIGITAL_PIN, INPUT);
  pinMode(RESET_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // Отключаем SD на W5100 shield
  pinMode(4, OUTPUT);
  digitalWrite(4, HIGH);

  Ethernet.begin(mac, ip);
  delay(1000);

  Serial.print(F("Leak sensor IP: "));
  Serial.println(Ethernet.localIP());

  postState("boot");
  lastWet = isWetNow();
}

void loop() {
  bool wet = isWetNow();
  bool resetState = digitalRead(RESET_PIN);

  // Защёлка тревоги при протечке
  if (wet && !alarmActive) {
    alarmActive = true;
    Serial.println(F("ALARM: leak detected"));
    postState("alarm_on");
  }

  // Изменение сырого состояния датчика
  if (wet != lastWet) {
    Serial.print(F("Sensor changed: "));
    Serial.println(wet ? F("WET") : F("DRY"));
    postState("sensor_change");
    lastWet = wet;
  }

  // Локальный сброс замыканием контактов
  if (lastResetState == HIGH && resetState == LOW) {
    if (alarmActive) {
      alarmActive = false;
      Serial.println(F("ALARM RESET: local contact"));
      postState("local_reset");
    } else {
      postState("local_reset_noalarm");
    }
    delay(50);
  }
  lastResetState = resetState;

  // Удалённый сброс с сервера
  if (millis() - lastCommandPollMs >= COMMAND_POLL_INTERVAL) {
    lastCommandPollMs = millis();
    long resetVersion = fetchResetVersion();
    if (resetVersion >= 0) {
      if (lastSeenResetVersion < 0) {
        lastSeenResetVersion = resetVersion;
      } else if (resetVersion > lastSeenResetVersion) {
        lastSeenResetVersion = resetVersion;
        if (alarmActive) {
          alarmActive = false;
          Serial.println(F("ALARM RESET: command from server"));
          postState("server_reset");
        } else {
          postState("server_reset_noalarm");
        }
      }
    }
  }

  // Heartbeat
  if (millis() - lastHeartbeatMs >= HEARTBEAT_INTERVAL) {
    lastHeartbeatMs = millis();
    postState("heartbeat");
  }

  digitalWrite(LED_PIN, alarmActive ? HIGH : LOW);
  delay(20);
}
