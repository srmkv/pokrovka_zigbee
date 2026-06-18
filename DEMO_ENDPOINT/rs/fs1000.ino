#include <RCSwitch.h>

RCSwitch mySwitch = RCSwitch();

void setup() {
  Serial.begin(9600);
  mySwitch.enableTransmit(8); // DATA FS1000A подключен к D10
  Serial.println("Type 's' in Serial Monitor to send code 11868689.");
}

void loop() {
  if (Serial.available() && Serial.read() == 's') {
    mySwitch.send(11868689, 24); // 24 — длина кода (бит)
    Serial.println("Code sent!");
    delay(1000);
  }
}
