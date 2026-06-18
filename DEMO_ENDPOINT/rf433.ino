#include <RCSwitch.h>
#include <ELECHOUSE_CC1101_SRC_DRV.h>

#define CC1101_GDO0 3    // GDO0 на D3 (можно D2 или другой)

// Для rc-switch (RXB6)
RCSwitch mySwitch = RCSwitch();

// Для хранения кода
long lastRCCode = 0;
int lastRCBits = 0;

// Для хранения кода, принятого через CC1101 (raw bytes)
byte lastCCCode[61] = {0};
byte lastCCLen = 0;

void setup() {
  Serial.begin(9600);

  // ----- Инициализация RXB6 (rc-switch) -----
  mySwitch.enableReceive(0);   // D2 (interrupt 0) для RXB6
  mySwitch.enableTransmit(8);  // FS1000A DATA на D8

  // ----- Инициализация CC1101 -----
  ELECHOUSE_cc1101.setGDO(0, CC1101_GDO0);
  if (!ELECHOUSE_cc1101.getCC1101()) {
    Serial.println("CC1101 Error");
  } else {
    ELECHOUSE_cc1101.Init();
    ELECHOUSE_cc1101.setMHZ(433.92);
    ELECHOUSE_cc1101.setModulation(2); // OOK
    ELECHOUSE_cc1101.setDRate(4.8);    // 4.8 kbit/s
    ELECHOUSE_cc1101.SetRx();
    Serial.println("CC1101 ready");
  }

  Serial.println("Готово! Жду сигнал RF433...");
  Serial.println("Для отправки кода с RXB6 — введите 's' в Serial Monitor.");
  Serial.println("Для отправки последнего кода CC1101 — введите 'c'.");
}

void loop() {
  // ----- Приём через RXB6 (rc-switch) -----
  if (mySwitch.available()) {
    long code = mySwitch.getReceivedValue();
    int bits = mySwitch.getReceivedBitlength();

    if (code == 0) {
      Serial.println("Unknown encoding (rc-switch)");
    } else {
      Serial.print("RXB6: Received: ");
      Serial.print(code);
      Serial.print(" / bits: ");
      Serial.print(bits);
      Serial.print(" / protocol: ");
      Serial.print(mySwitch.getReceivedProtocol());
      Serial.print(" / delay: ");
      Serial.print(mySwitch.getReceivedDelay());
      Serial.println();

      lastRCCode = code;
      lastRCBits = bits;
      Serial.println("Код (RXB6) сохранён для передачи.");
      Serial.println("Для отправки этого кода — введите 's'.");
    }
    mySwitch.resetAvailable();
  }

  // ----- Приём через CC1101 (raw-приём) -----
  if (ELECHOUSE_cc1101.getCC1101() && ELECHOUSE_cc1101.CheckRxFifo(100)) {
    byte buffer[61];
    byte len = ELECHOUSE_cc1101.ReceiveData(buffer);

    if (len > 0) {
      Serial.print("CC1101: DATA: ");
      for (byte i = 0; i < len; i++) {
        if (buffer[i] < 16) Serial.print("0");
        Serial.print(buffer[i], HEX); Serial.print(" ");
        lastCCCode[i] = buffer[i];
      }
      lastCCLen = len;
      Serial.print(" | Len: "); Serial.println(len);

      Serial.println("Код (CC1101) сохранён для передачи. Введите 'c' для отправки.");
    }
  }

  // ----- Передача -----
  if (Serial.available()) {
    char c = Serial.read();
    if (c == 's') {
      if (lastRCCode && lastRCBits) {
        mySwitch.send(lastRCCode, lastRCBits);
        Serial.print("Код отправлен через FS1000A: ");
        Serial.print(lastRCCode);
        Serial.print(" (");
        Serial.print(lastRCBits);
        Serial.println(" бит)");
      } else {
        Serial.println("Нет кода от RXB6 для отправки!");
      }
    } else if (c == 'c') {
      if (lastCCLen > 0) {
        ELECHOUSE_cc1101.SetTx();
        ELECHOUSE_cc1101.SendData(lastCCCode, lastCCLen);
        ELECHOUSE_cc1101.SetRx();
        Serial.print("Код отправлен через CC1101 (");
        Serial.print(lastCCLen);
        Serial.println(" байт)");
      } else {
        Serial.println("Нет кода от CC1101 для отправки!");
      }
    }
    delay(1000);
  }
}
