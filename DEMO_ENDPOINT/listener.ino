#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <RCSwitch.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
#define SCREEN_ADDRESS 0x3C

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
RCSwitch mySwitch = RCSwitch();

void setup() {
  Serial.begin(9600);
  // Инициализация экрана
  if(!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    Serial.println("SSD1306 allocation failed");
    while(1);
  }
  display.clearDisplay();
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);

  // Инициализация RF-приемника
  mySwitch.enableReceive(digitalPinToInterrupt(2)); // MX-RM-5V DATA к D2
}

void loop() {
  if (mySwitch.available()) {
    unsigned long code = mySwitch.getReceivedValue();

    // Выводим только число на экран
    display.clearDisplay();
    display.setTextSize(2);
    display.setCursor(0, 25); // Чуть по центру
    if (code == 0) {
      display.println("0");
    } else {
      display.println(code);
    }
    display.display();

    // Дублируем в Serial для удобства
    Serial.print("RF433 code: ");
    Serial.println(code);

    mySwitch.resetAvailable();
    delay(800); // Чтобы не мелькало, но не обязательно
  }
}
