#include <FastLED.h>

#define LED_PIN     10      // Пин Arduino
#define LED_COUNT   300     // Кол-во светодиодов (замени на своё)
#define LED_TYPE    WS2811 // или WS2812
#define COLOR_ORDER GRB

CRGB leds[LED_COUNT];

void setup() {
  FastLED.addLeds<LED_TYPE, LED_PIN, COLOR_ORDER>(leds, LED_COUNT);
  FastLED.setBrightness(100);  // Яркость (0-255)
}

void loop() {
  // Зажигаем всю ленту одним цветом (красным)
  fill_solid(leds, LED_COUNT, CRGB::Red);
  FastLED.show();
  delay(1000);

  // Синим
  fill_solid(leds, LED_COUNT, CRGB::Blue);
  FastLED.show();
  delay(1000);

  // Зелёным
  fill_solid(leds, LED_COUNT, CRGB::Green);
  FastLED.show();
  delay(1000);

  // Белым
  fill_solid(leds, LED_COUNT, CRGB::White);
  FastLED.show();
  delay(1000);
}
