#include <SPI.h>
#include <Ethernet.h>
#include <FastLED.h>
#include <RCSwitch.h>

#define LED_PIN    6
#define LED_COUNT  300
#define DEFAULT_BRIGHTNESS 100

CRGB leds[LED_COUNT];

// Ethernet
byte mac[] = { 0x00, 0xAA, 0xBB, 0xCC, 0xDA, 0x02 };
IPAddress ip(192, 168, 0, 115);
EthernetServer server(80);

// RC Switch
RCSwitch mySwitch = RCSwitch();
const unsigned long relayCode = 11868689;
const int txPin = 9;

// Глобальные значения цвета и яркости
int globalR = 255, globalG = 181, globalB = 71;
int userBrightness = DEFAULT_BRIGHTNESS;
bool needUpdateBrightness = true;

// Эффекты
enum EffectType { EFFECT_NONE, EFFECT_ON, EFFECT_OFF, EFFECT_FIRE, EFFECT_BOUNCE, EFFECT_DEFAULT, EFFECT_RAINBOW };
EffectType currentEffect = EFFECT_NONE;

unsigned long lastUpdateTime = 0;
const int updateInterval = 20;

// "Огонь"
int firePosition = 0;
void fireEffectLoop() {
  fill_solid(leds, LED_COUNT, CRGB::Black);
  for (int i = 0; i < 10; i++) {
    int pos = firePosition - i;
    if (pos >= 0 && pos < LED_COUNT) {
      int k = 255 - (i * 25);
      leds[pos].r = (globalR * k) / 255;
      leds[pos].g = (globalG * k) / 255;
      leds[pos].b = (globalB * k) / 255;
    }
  }
  FastLED.show();
  firePosition++;
  if (firePosition >= LED_COUNT) firePosition = 0;
}

// Bounce
enum BounceState { BOUNCE_OFF, BOUNCE_FORWARD, BOUNCE_PAUSE, BOUNCE_BACK };
BounceState bounceState = BOUNCE_OFF;
int bouncePos = 0;
unsigned long bounceTimer = 0;
void bounceEffectLoop() {
  switch (bounceState) {
    case BOUNCE_FORWARD:
      if (bouncePos < LED_COUNT) {
        leds[bouncePos] = CRGB(globalR, globalG, globalB);
        FastLED.show();
        bouncePos++;
      } else {
        bounceState = BOUNCE_PAUSE;
        bounceTimer = millis();
      }
      break;
    case BOUNCE_PAUSE:
      if (millis() - bounceTimer > 400) {
        bounceState = BOUNCE_BACK;
        bouncePos = LED_COUNT - 1;
      }
      break;
    case BOUNCE_BACK:
      if (bouncePos >= 0) {
        leds[bouncePos] = CRGB::Black;
        FastLED.show();
        bouncePos--;
      } else {
        bounceState = BOUNCE_OFF;
        startOffEffect();
      }
      break;
    default:
      break;
  }
}

// Default
enum DefaultMode { FILL, HOLD, FADE, WAIT_RELEASE };
DefaultMode defaultMode = FILL;
int filled = 0;
int fadeIdx = LED_COUNT - 1;
void defaultEffectLoop() {
  switch (defaultMode) {
    case FILL:
      if (filled < LED_COUNT) {
        leds[filled++] = CRGB(globalR, globalG, globalB);
        FastLED.show();
        delay(20);
      } else defaultMode = HOLD;
      break;
    case FADE:
      if (fadeIdx >= 0) {
        leds[fadeIdx--] = CRGB::Black;
        FastLED.show();
        delay(20);
      } else defaultMode = WAIT_RELEASE;
      break;
    default:
      break;
  }
}

// Радуга
int rainbowStep = 0;
void rainbowEffectLoop() {
  for (int i = 0; i < LED_COUNT; i++) {
    uint8_t hue = (rainbowStep + i * 256 / LED_COUNT) % 256;
    leds[i] = CHSV(hue, 200, 255);
  }
  FastLED.show();
  rainbowStep = (rainbowStep + 2) % 256;
}

// Базовые действия
void updateFastLEDBrightness() {
  FastLED.setBrightness(map(userBrightness, 0, 100, 0, 255));
}

void setAllGlobalColor() {
  fill_solid(leds, LED_COUNT, CRGB(globalR, globalG, globalB));
  FastLED.show();
}

void startOnEffect() {
  currentEffect = EFFECT_ON;
  setAllGlobalColor();
}
void startOffEffect() {
  currentEffect = EFFECT_OFF;
  fill_solid(leds, LED_COUNT, CRGB::Black);
  FastLED.show();
}
void startFireEffect() {
  currentEffect = EFFECT_FIRE;
  firePosition = 0;
}
void startBounceEffect() {
  currentEffect = EFFECT_BOUNCE;
  bounceState = BOUNCE_FORWARD;
  bouncePos = 0;
}
void startDefaultEffect() {
  currentEffect = EFFECT_DEFAULT;
  defaultMode = FILL;
  filled = 0;
  fadeIdx = LED_COUNT - 1;
}
void startRainbowEffect() {
  currentEffect = EFFECT_RAINBOW;
  rainbowStep = 0;
}

// Setup
void setup() {
  Serial.begin(9600);
  FastLED.addLeds<WS2811, LED_PIN, GRB>(leds, LED_COUNT);
  updateFastLEDBrightness();
  setAllGlobalColor();

  Ethernet.begin(mac, ip);
  server.begin();
  Serial.println(Ethernet.localIP());

  mySwitch.enableTransmit(txPin);
}

// Loop
void loop() {
  EthernetClient client = server.available();
  if (client) {
    char request[100] = {0};
    byte idx = 0;
    while (client.connected()) {
      if (client.available()) {
        char c = client.read();
        if (idx < 99) request[idx++] = c;
        if (c == '\n') break;
      }
    }

    // Обработка URL
    if (strstr(request, "GET /on")) startOnEffect();
    else if (strstr(request, "GET /off")) startOffEffect();
    else if (strstr(request, "GET /fire")) startFireEffect();
    else if (strstr(request, "GET /firebounce")) startBounceEffect();
    else if (strstr(request, "GET /default")) startDefaultEffect();
    else if (strstr(request, "GET /rainbow")) startRainbowEffect();
    else if (strstr(request, "GET /fade")) {
      if (currentEffect == EFFECT_DEFAULT && defaultMode == HOLD) defaultMode = FADE;
    } else if (strstr(request, "GET /brightness")) {
      char *valStr = strstr(request, "val=");
      if (valStr) {
        int val = atoi(valStr + 4);
        userBrightness = constrain(val, 0, 100);
        needUpdateBrightness = true;
      }
    } else if (strstr(request, "GET /color")) {
      char *rStr = strstr(request, "r=");
      char *gStr = strstr(request, "g=");
      char *bStr = strstr(request, "b=");
      if (rStr) globalR = constrain(atoi(rStr + 2), 0, 255);
      if (gStr) globalG = constrain(atoi(gStr + 2), 0, 255);
      if (bStr) globalB = constrain(atoi(bStr + 2), 0, 255);
      setAllGlobalColor();
    } else if (strstr(request, "GET /relay")) {
      char *codeStr = strstr(request, "code=");
      if (codeStr) {
        unsigned long code = strtoul(codeStr + 5, NULL, 10);
        if (code > 0) {
          mySwitch.send(code, 24);
          delay(300);
        }
      } else {
        mySwitch.send(relayCode, 24);
        delay(300);
      }
    }

    // Ответ
    client.println(F("HTTP/1.1 200 OK"));
    client.println(F("Content-Type: text/html; charset=utf-8"));
    client.println();
    client.println(F("<html><head><meta charset='utf-8'><title>Управление</title></head><body>"));
    client.println(F("<h2>Управление лентой и реле</h2>"));
    client.println(F("<button onclick=\"location.href='/on'\">Вкл ленту</button><br>"));
    client.println(F("<button onclick=\"location.href='/off'\">Выкл ленту</button><br>"));
    client.println(F("<button onclick=\"location.href='/fire'\">Огонь</button><br>"));
    client.println(F("<button onclick=\"location.href='/firebounce'\">Туда-обратно</button><br>"));
    client.println(F("<button onclick=\"location.href='/default'\">По умолчанию</button><br>"));
    client.println(F("<button onclick=\"location.href='/rainbow'\">Радуга</button><br>"));
    client.println(F("<button onclick=\"location.href='/fade'\">Затухание</button><br>"));
    client.println(F("<button onclick=\"location.href='/relay'\">Реле</button><br>"));
    client.println(F("</body></html>"));
    client.stop();
  }

  // Обновление яркости
  if (needUpdateBrightness) {
    updateFastLEDBrightness();
    needUpdateBrightness = false;
  }

  // Эффекты
  switch (currentEffect) {
    case EFFECT_FIRE:
      if (millis() - lastUpdateTime >= updateInterval) {
        lastUpdateTime = millis();
        fireEffectLoop();
      }
      break;
    case EFFECT_BOUNCE:
      if (millis() - bounceTimer >= 15) {
        bounceTimer = millis();
        bounceEffectLoop();
      }
      break;
    case EFFECT_DEFAULT:
      defaultEffectLoop();
      break;
    case EFFECT_RAINBOW:
      if (millis() - lastUpdateTime >= updateInterval) {
        lastUpdateTime = millis();
        rainbowEffectLoop();
      }
      break;
    default:
      break;
  }
}
