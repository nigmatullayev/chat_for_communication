# WebRTC Video/Voice Call + Screen Share Implementation

## Overview

Bu hujjat WebRTC video/voice call va screen share funksiyalarining to'liq implementatsiyasini tushuntiradi. TZ (Texnik Topshiriq) ga moslashtirilgan.

## Protokol

### Yangi Protokol (call_request/accept/reject)

1. **Caller** → `call_request` yuboradi (call_type bilan)
2. **Receiver** → `call_accept` yoki `call_reject` yuboradi
3. **Caller** → `call_accept` olgach, `incoming_call` (offer) yuboradi
4. **Receiver** → `call_answer` (answer) yuboradi
5. **Ikkala tomon** → `ice_candidate` almashadi
6. **Har qanday vaqtda** → `call_end` yuboriladi

### Eski Protokol (backward compatibility)

1. **Caller** → to'g'ridan-to'g'ri `incoming_call` (offer) yuboradi
2. **Receiver** → `call_answer` (answer) yuboradi
3. **Ikkala tomon** → `ice_candidate` almashadi

## Backend Changes

### `backend/websocket_manager.py`

Yangi message turlari qo'shildi:

- `call_request` - Qo'ng'iroq so'rovi (caller → receiver)
- `call_accept` - Qo'ng'iroq qabul qilindi (receiver → caller)
- `call_reject` - Qo'ng'iroq rad etildi (receiver → caller)
- `incoming_call` - Offer yuboriladi (caller → receiver, call_accept dan keyin)
- `call_answer` - Answer yuboriladi (receiver → caller)
- `ice_candidate` - ICE candidate almashadi
- `call_end` - Qo'ng'iroq tugatildi

## Frontend Changes

### `frontend/app.js`

#### Yangi funksiyalar:

1. **`handleCallRequest(data)`** - Call request qabul qilganda chaqiriladi
2. **`handleCallAccept(data)`** - Call accept qabul qilganda chaqiriladi (caller tomonida)
3. **`handleCallReject(data)`** - Call reject qabul qilganda chaqiriladi (caller tomonida)
4. **`startCallAfterAccept(type)`** - Call accept bo'lgandan keyin haqiqiy callni boshlaydi

#### Yangilangan funksiyalar:

1. **`startCall(type)`** - Endi `call_request` yuboradi, keyin `call_accept` kutadi
2. **`acceptIncomingCall()`** - Endi `call_request` bo'lsa `call_accept` yuboradi
3. **`rejectIncomingCall()`** - Endi `call_request` bo'lsa `call_reject` yuboradi
4. **`showIncomingCall(data)`** - Ikkala protokolni qo'llab-quvvatlaydi

## Screen Share

Screen share funksiyasi allaqachon to'liq implement qilingan:

- `toggleScreenShare()` - Screen share ni yoqadi/yoqadi
- `getDisplayMedia()` - Ekranni olish uchun
- Track replacement - Screen share trackni peer connectionga qo'shadi
- Auto-stop - Foydalanuvchi screen share ni to'xtatganda avtomatik to'xtaydi

## Call Flow

### Yangi Protokol (call_request/accept):

```
Caller                          Receiver
  |                                |
  |-- call_request (video/audio) ->|
  |                                |
  |<-- call_accept ----------------|
  |                                |
  |-- incoming_call (offer) ------>|
  |                                |
  |<-- call_answer (answer) -------|
  |                                |
  |<-- ice_candidate <------------>|
  |                                |
  |-- call_end ------------------->|
```

### Eski Protokol (backward compatibility):

```
Caller                          Receiver
  |                                |
  |-- incoming_call (offer) ------->|
  |                                |
  |<-- call_answer (answer) -------|
  |                                |
  |<-- ice_candidate <------------>|
  |                                |
  |-- call_end ------------------->|
```

## Features

### ✅ Implemented

1. **Video Call** - To'liq ishlaydi
2. **Audio Call** - To'liq ishlaydi
3. **Screen Share** - To'liq ishlaydi
4. **Camera Switch** - To'liq ishlaydi
5. **Mute/Unmute** - To'liq ishlaydi
6. **Video On/Off** - To'liq ishlaydi
7. **Call Hold** - To'liq ishlaydi
8. **Call Timer** - To'liq ishlaydi
9. **Ringtone** - To'liq ishlaydi
10. **Call Request/Accept/Reject** - To'liq ishlaydi
11. **Backward Compatibility** - Eski protokol ham ishlaydi

### 🔧 Configuration

#### STUN/TURN Servers

`frontend/app.js` da `rtcConfig`:

```javascript
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        // TURN server qo'shish uchun:
        // { urls: 'turn:turn.example.com:3478', username: 'user', credential: 'pass' }
    ]
};
```

#### WebSocket Connection

WebSocket connection `ws://localhost:8030/api/messages/ws/{user_id}?token={access_token}` orqali ulanadi.

## Testing

### Manual Test Checklist

- [x] Video call boshlash
- [x] Audio call boshlash
- [x] Incoming call qabul qilish
- [x] Incoming call rad etish
- [x] Screen share
- [x] Camera switch
- [x] Mute/unmute
- [x] Video on/off
- [x] Call hold
- [x] Call end
- [x] Call timer
- [x] Ringtone
- [x] Call request/accept/reject protokoli

### Automated Tests

Backend testlar `comprehensive_qa_test.py` da mavjud.

## Security

1. **HTTPS/WSS** - Productionda HTTPS va WSS ishlatilishi kerak
2. **Token Authentication** - WebSocket connection token bilan autentifikatsiya qilinadi
3. **Input Validation** - Barcha WebSocket xabarlari validate qilinadi
4. **Rate Limiting** - Spam qo'ng'iroqlarni oldini olish uchun

## Deployment

### Production Requirements

1. **HTTPS** - `getUserMedia` va `getDisplayMedia` HTTPS yoki localhost talab qiladi
2. **WSS** - WebSocket connection WSS bo'lishi kerak
3. **TURN Server** - NAT/Firewall muammolarini hal qilish uchun
4. **STUN Server** - P2P connection uchun

### Environment Variables

```bash
# Backend
API_HOST=0.0.0.0
API_PORT=8030
DATABASE_URL=sqlite:///./chat_video.db
SECRET_KEY=your-secret-key

# Frontend
API_BASE=http://localhost:8030/api
WS_URL=ws://localhost:8030/api/messages/ws
```

## Troubleshooting

### Common Issues

1. **Camera/Microphone not working**
   - Browser permissions tekshiring
   - HTTPS yoki localhost ishlatilayotganini tekshiring

2. **WebSocket connection failed**
   - Server ishlayotganini tekshiring
   - Token to'g'riligini tekshiring

3. **ICE connection failed**
   - TURN server sozlang
   - Firewall/NAT muammolarini tekshiring

4. **Screen share not working**
   - Browser permissions tekshiring
   - `getDisplayMedia` qo'llab-quvvatlanayotganini tekshiring

## Future Enhancements

1. **Group Calls** - Ko'p foydalanuvchili qo'ng'iroqlar
2. **Recording** - Qo'ng'iroqlarni yozib olish
3. **Call History** - Qo'ng'iroqlar tarixi
4. **Push Notifications** - Qo'ng'iroq bildirishnomalari
5. **Call Quality Metrics** - Qo'ng'iroq sifati metrikalari

## References

- [WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [FastAPI WebSocket](https://fastapi.tiangolo.com/advanced/websockets/)
- [TZ Document](./WEBRTC_TZ.md) - Original Texnik Topshiriq

