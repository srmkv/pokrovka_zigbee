#include <ELECHOUSE_CC1101_SRC_DRV.h>
#include <RCSwitch.h>

int pin; // int for Receive pin.
RCSwitch mySwitch = RCSwitch();

void setup() {
  Serial.begin(9600);

#ifdef ESP32
  pin = 4;  // for esp32! Receiver on GPIO pin 4. 
#elif ESP8266
  pin = 4;  // for esp8266! Receiver on pin 4 = D2.
#else
  pin = 0;  // for Arduino! Receiver on interrupt 0 => that is pin #2
#endif 

  ELECHOUSE_cc1101.Init();
  ELECHOUSE_cc1101.setMHZ(433.92); 
  mySwitch.enableReceive(pin);  // Receiver on interrupt 0 => that is pin #2
  ELECHOUSE_cc1101.SetRx();  // set Receive on
}

void loop() {
  if (mySwitch.available()) 
  {
    long code = mySwitch.getReceivedValue();
    if (code == 0) {
      Serial.println("Unknown encoding");
    } else {
      Serial.print("Received: ");
      Serial.print(code);
      Serial.print(" / bits: ");
      Serial.print(mySwitch.getReceivedBitlength());
      Serial.print(" / protocol: ");
      Serial.print(mySwitch.getReceivedProtocol());
      Serial.print(" / delay: ");
      Serial.print(mySwitch.getReceivedDelay());
      Serial.println();
    }
    mySwitch.resetAvailable();
  }
}
