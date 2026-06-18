#include <SPI.h>
#include <Ethernet.h>

/* ---------- СЕТЬ (Ethernet) — СТАТИЧЕСКИЙ АДРЕС ---------- */
// Уникальный MAC (любой, лишь бы не конфликтовал в сети)
byte MAC[] = { 0xDE, 0xAD, 0xBE, 0xEF, 0x22, 0x02 };

// Жёстко заданные параметры сети (без DHCP)
IPAddress STATIC_IP(192, 168, 0, 105);   // <-- ТВОЙ СТАТИЧЕСКИЙ IP ДЛЯ ARDUINO2
IPAddress GATEWAY  (192, 168, 0, 1);
IPAddress SUBNET   (255, 255, 255, 0);
IPAddress DNS      (192, 168, 0, 1);

/* ---------- КАНАЛЫ ОПТОПАРЫ ----------
   Описываем, какие пины читаем и какими ID они будут в API/пуше.
   Входы — инверсная логика (INPUT_PULLUP): LOW = есть сеть/лампа горит.
*/
struct ChannelCfg {
  uint8_t pin;
  const char* id; // "opt1", "opt2", ...
};

ChannelCfg CHANNELS[] = {
  {2,  "opt1"},
  {3,  "opt2"},
  {4,  "opt3"},
  // добавляй при необходимости: {5,"opt4"}, {6,"opt5"}, ...
};
const uint8_t CHANNEL_COUNT = sizeof(CHANNELS) / sizeof(CHANNELS[0]);

/* ---------- ПАРАМЕТРЫ ДЕТЕКЦИИ ---------- */
const unsigned long WINDOW_MS      = 300;  // окно усреднения
const uint16_t      MIN_LOW_COUNT  = 10;   // порог LOW-сэмплов за окно => "лампа ВКЛ"
const unsigned long STABLE_MS      = 250;  // антифликер: сколько держится изменение

/* ---------- PUSH-настройки (адрес сервера с Node.js) ----------
   Это адрес твоего сервера в локалке (NanoPi и т.п.), где крутится порт 3010.
*/
IPAddress SERVER_IP(192, 168, 0, 108);   // <-- ВСТАВЬ IP СЕРВЕРА (NanoPi/ПК)
const uint16_t SERVER_PORT = 3010;      // порт API
const char* TOKEN = "change_me";        // должен совпадать с TOKEN на сервере

// true  = отправляем одним bulk-запросом несколько каналов
// false = шлём по одному GET’ом /api/lamp/:id/state?lamp=...
const bool USE_BULK_PUSH = true;

/* ---------- HTTP-сервер на Arduino2 ---------- */
EthernetServer server(80);

/* ---------- Состояние по каждому каналу ---------- */
struct ChannelState {
  unsigned long windowStartMs;
  uint16_t lowCountInWindow;
  uint16_t sampleCountInWindow;

  bool computed;
  bool stable;
  bool lastStable;

  unsigned long lastChangeMs;

  bool lastPushed;
  bool hasPushedOnce;
};

ChannelState CH_STATE[CHANNEL_COUNT];

/* ---------- ВСПОМОГАТЕЛЬНОЕ ---------- */
void printIp(const IPAddress& ip) {
  for (int i=0;i<4;i++){ Serial.print(ip[i]); if(i<3) Serial.print('.'); }
}

void startEthernetStatic() {
  Serial.println(F("Ethernet init (STATIC)..."));
  Ethernet.begin(MAC, STATIC_IP, DNS, GATEWAY, SUBNET);

  // (не обязательно, но полезно) ждём линк до 3 сек
  unsigned long t0 = millis();
  while (Ethernet.linkStatus() == LinkOFF && millis() - t0 < 3000) {
    delay(100);
  }

  Serial.print(F("IP: "));     printIp(Ethernet.localIP());   Serial.println();
  Serial.print(F("GW: "));     printIp(Ethernet.gatewayIP()); Serial.println();
  Serial.print(F("DNS: "));    printIp(Ethernet.dnsServerIP()); Serial.println();
  Serial.print(F("MASK: "));   printIp(Ethernet.subnetMask()); Serial.println();

  delay(120);
  server.begin();
  Serial.println(F("HTTP server started on port 80 (static IP)"));
}

/* ---------- НИЗКОУРОВНЕВЫЙ HTTP КЛИЕНТ ДЛЯ PUSH ---------- */
bool httpGET(const String& path) {
  EthernetClient c;
  if (!c.connect(SERVER_IP, SERVER_PORT)) return false;

  c.print("GET "); c.print(path); c.println(" HTTP/1.1");
  c.print("Host: "); c.print(SERVER_IP); c.print(":"); c.println(SERVER_PORT);
  c.println("Connection: close");
  c.println();

  // дождёмся конца заголовков
  unsigned long t0 = millis();
  while (c.connected() && (millis() - t0 < 1500)) {
    if (c.find((char*)"\r\n\r\n")) break;
  }
  while (c.available()) c.read();
  c.stop();
  return true;
}

bool httpPOST_JSON(const String& path, const String& json) {
  EthernetClient c;
  if (!c.connect(SERVER_IP, SERVER_PORT)) return false;

  c.print("POST "); c.print(path); c.println(" HTTP/1.1");
  c.print("Host: "); c.print(SERVER_IP); c.print(":"); c.println(SERVER_PORT);
  c.println("Content-Type: application/json");
  c.print("Content-Length: "); c.println(json.length());
  c.println("Connection: close");
  c.println();
  c.print(json);

  unsigned long t0 = millis();
  while (c.connected() && (millis() - t0 < 2000)) {
    if (c.find((char*)"\r\n\r\n")) break;
  }
  while (c.available()) c.read();
  c.stop();
  return true;
}

/* ---------- PUSH ---------- */
void pushSingle(const char* id, bool lamp) {
  String path = "/api/lamp/";
  path += id;
  path += "/state?lamp="; path += (lamp ? "1" : "0");
  path += "&token="; path += TOKEN;
  httpGET(path);
}

void pushBulkChanged() {
  String json = "{\"devices\":{";
  bool first = true;
  for (uint8_t i=0; i<CHANNEL_COUNT; i++) {
    if (!CH_STATE[i].hasPushedOnce || CH_STATE[i].lastPushed != CH_STATE[i].stable) {
      if (!first) json += ",";
      json += "\"";
      json += CHANNELS[i].id;
      json += "\":";
      json += (CH_STATE[i].stable ? "true" : "false");
      first = false;
    }
  }
  json += "}}";
  if (first) return; // нечего слать

  String path = "/api/lamp/bulk/state?token=";
  path += TOKEN;
  if (httpPOST_JSON(path, json)) {
    for (uint8_t i=0; i<CHANNEL_COUNT; i++) {
      if (!CH_STATE[i].hasPushedOnce || CH_STATE[i].lastPushed != CH_STATE[i].stable) {
        CH_STATE[i].lastPushed = CH_STATE[i].stable;
        CH_STATE[i].hasPushedOnce = true;
      }
    }
  }
}

/* ---------- ВЕБ-ИНТЕРФЕЙС (минимум) ---------- */
void sendHttpHeader(EthernetClient &client, const char* contentType) {
  client.println(F("HTTP/1.1 200 OK"));
  client.print  (F("Content-Type: ")); client.println(contentType);
  client.println(F("Cache-Control: no-store"));
  client.println(F("Connection: close"));
  client.println();
}
void sendNotFound(EthernetClient &client) {
  client.println(F("HTTP/1.1 404 Not Found"));
  client.println(F("Content-Type: text/plain; charset=utf-8"));
  client.println(F("Connection: close"));
  client.println();
  client.println(F("404 Not Found"));
}
void handleRoot(EthernetClient &client) {
  sendHttpHeader(client, "text/html; charset=utf-8");
  client.println(F("<!doctype html><meta charset='utf-8'><title>Opto</title>"));
  client.println(F("<pre>OK (static IP).\nGET /api/status-all\nGET /api/status?ch=opt1</pre>"));
}
void handleApiStatusAll(EthernetClient &client) {
  sendHttpHeader(client, "application/json; charset=utf-8");
  client.print("{");
  for (uint8_t i=0;i<CHANNEL_COUNT;i++) {
    if (i) client.print(",");
    client.print("\""); client.print(CHANNELS[i].id); client.print("\":");
    client.print(CH_STATE[i].stable ? "true" : "false");
  }
  client.println("}");
}
void handleApiStatusOne(EthernetClient &client, const char* ch) {
  int found = -1;
  for (uint8_t i=0;i<CHANNEL_COUNT;i++) if (strcmp(CHANNELS[i].id, ch) == 0) { found = i; break; }
  if (found < 0) { sendNotFound(client); return; }

  ChannelState &S = CH_STATE[found];
  sendHttpHeader(client, "application/json; charset=utf-8");
  client.print("{\"lamp\":"); client.print(S.stable ? "true" : "false");
  client.print(",\"stable\":"); client.print( (millis()-S.lastChangeMs) >= STABLE_MS ? "true":"false" );
  client.print(",\"low_count\":"); client.print(S.lowCountInWindow);
  client.print(",\"samples\":"); client.print(S.sampleCountInWindow);
  client.print(",\"window_ms\":"); client.print(WINDOW_MS);
  client.println("}");
}

/* ---------- РОУТИНГ ---------- */
void handleClient() {
  EthernetClient client = server.available();
  if (!client) return;

  char reqLine[160]; size_t idx = 0;
  unsigned long t0 = millis(); bool gotLine = false;

  while (client.connected() && (millis()-t0 < 1000)) {
    if (client.available()) {
      char c = client.read();
      if (c=='\r') continue;
      if (c=='\n') { gotLine = true; break; }
      if (idx < sizeof(reqLine)-1) reqLine[idx++] = c;
    }
  }
  reqLine[idx] = 0;

  // скидываем заголовки
  while (client.connected() && (millis()-t0 < 1200)) {
    if (client.available()) { if (client.read()=='\n') break; } else break;
  }

  if (!gotLine) { sendNotFound(client); client.stop(); return; }

  if (strncmp(reqLine,"GET ",4)==0) {
    const char* path = reqLine + 4;
    const char* sp = strchr(path,' ');
    size_t pathLen = sp ? (size_t)(sp - path) : strlen(path);

    if (pathLen==1 && path[0]=='/') {
      handleRoot(client);
    } else if (pathLen >= 15 && strncmp(path, "/api/status-all", 15) == 0) {
  handleApiStatusAll(client);

    } else if (pathLen>=11 && strncmp(path,"/api/status",11)==0) {
      const char* q = strchr(path,'?'); const char* ch = NULL;
      if (q) {
        if (strncmp(q, "?ch=",4)==0) ch = q+4;
        else { const char* p = strstr(q,"ch="); if (p) ch = p+3; }
      }
      char buf[16]; buf[0]=0;
      if (ch) { size_t i=0; while (*ch && *ch!=' ' && *ch!='&' && i<sizeof(buf)-1) buf[i++]=*ch++; buf[i]=0; }
      if (buf[0]) handleApiStatusOne(client, buf); else sendNotFound(client);
    } else {
      sendNotFound(client);
    }
  } else {
    sendNotFound(client);
  }

  delay(1);
  client.stop();
}

/* ---------- ДЕТЕКЦИЯ ---------- */
void updateOne(ChannelState &S, uint8_t pin) {
  bool level = digitalRead(pin); // INPUT_PULLUP: LOW = активность сети
  S.sampleCountInWindow++;
  if (level == LOW) S.lowCountInWindow++;

  unsigned long now = millis();
  if (now - S.windowStartMs >= WINDOW_MS) {
    bool lamp = (S.lowCountInWindow >= MIN_LOW_COUNT);

    if (lamp != S.stable) {
      if (now - S.lastChangeMs >= STABLE_MS) {
        S.stable = lamp;
        S.lastChangeMs = now;
      }
    } else {
      S.lastChangeMs = now;
    }

    S.computed = lamp;
    S.windowStartMs = now;
    S.lowCountInWindow = 0;
    S.sampleCountInWindow = 0;
  }
}

/* ---------- SETUP / LOOP ---------- */
void setup() {
  Serial.begin(9600);
  while(!Serial){;}

  for (uint8_t i=0;i<CHANNEL_COUNT;i++) {
    pinMode(CHANNELS[i].pin, INPUT_PULLUP);
    ChannelState &S = CH_STATE[i];
    S.windowStartMs = millis();
    S.lowCountInWindow = 0;
    S.sampleCountInWindow = 0;
    S.computed = false;
    S.stable = false;
    S.lastStable = false;
    S.lastChangeMs = millis();
    S.lastPushed = false;
    S.hasPushedOnce = false;
  }

  // Статический Ethernet (без DHCP)
  startEthernetStatic();
}

unsigned long lastBulkTry = 0;

void loop() {
  for (uint8_t i=0;i<CHANNEL_COUNT;i++) updateOne(CH_STATE[i], CHANNELS[i].pin);

  if (USE_BULK_PUSH) {
    bool changed = false;
    for (uint8_t i=0;i<CHANNEL_COUNT;i++) {
      if (CH_STATE[i].stable != CH_STATE[i].lastStable) { changed = true; CH_STATE[i].lastStable = CH_STATE[i].stable; }
    }
    unsigned long now = millis();
    if (changed || (now - lastBulkTry >= 250)) {
      pushBulkChanged();
      lastBulkTry = now;
    }
  } else {
    for (uint8_t i=0;i<CHANNEL_COUNT;i++) {
      if (CH_STATE[i].stable != CH_STATE[i].lastStable) {
        CH_STATE[i].lastStable = CH_STATE[i].stable;
        pushSingle(CHANNELS[i].id, CH_STATE[i].stable);
        CH_STATE[i].lastPushed = CH_STATE[i].stable;
        CH_STATE[i].hasPushedOnce = true;
      }
    }
  }

  handleClient();
}
