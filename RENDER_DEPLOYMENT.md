# Render Deployment Guide

Bu loyiha Render'da Docker orqali deploy qilinadi.

## 🚀 Deployment Steps

### 1. GitHub'ga Push Qiling

```bash
git add .
git commit -m "Add Render deployment support"
git push origin main
```

### 2. Render'da Yangi Web Service Yaratish

1. Render dashboard'ga kiring: https://dashboard.render.com
2. "New +" tugmasini bosing
3. "Web Service" ni tanlang
4. GitHub repository'ni ulang
5. Quyidagi sozlamalarni kiriting:

**Basic Settings:**
- **Name**: chat-for-conversation (yoki xohlagan nomingiz)
- **Environment**: Docker
- **Region**: Singapore (yoki yaqin region)
- **Branch**: main
- **Root Directory**: (bo'sh qoldiring)

**Docker Settings:**
- **Dockerfile Path**: `Dockerfile`
- **Docker Build Command**: (bo'sh qoldiring)
- **Docker Start Command**: (bo'sh qoldiring)

**Environment Variables (Optional):**
```
SECRET_KEY=your-secret-key-here-change-this
DATABASE_URL=sqlite:///./chat_video.db
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
```

**Advanced Settings:**
- **Health Check Path**: `/api/health`
- **Auto-Deploy**: Yes

### 3. Deploy Qilish

Render avtomatik ravishda:
1. Docker image build qiladi
2. Container'ni ishga tushiradi
3. Startup event'da database table'larni yaratadi
4. **Default admin user'ni yaratadi** (agar mavjud bo'lmasa)

### 4. Default Admin Credentials

Loyiha ishga tushgandan keyin:

- **Username**: `admin`
- **Password**: `admin123`

⚠️ **MUHIM**: Birinchi login qilgandan keyin admin parolini o'zgartiring!

## ✅ Verification

1. Render logs'ni tekshiring - quyidagi xabar ko'rinishi kerak:
   ```
   ✅ Default admin user created successfully!
      Username: admin
      Password: admin123
   ```

2. Health check endpoint'ni tekshiring:
   ```
   https://your-app.onrender.com/api/health
   ```

3. Agar admin yaratilmagan bo'lsa, manual yaratish endpoint'ini ishlating:
   ```
   POST https://your-app.onrender.com/api/init-admin
   ```
   Bu endpoint admin yaratadi va javob qaytaradi.

4. Login qilib ko'ring:
   ```
   https://your-app.onrender.com
   Username: admin
   Password: admin123
   ```

## 🔧 Troubleshooting

### Database fayl yo'qoladi (ephemeral storage)

Render'da disk storage ephemeral (vaqtinchalik) bo'ladi. Agar container qayta ishga tushsa, database yangilanadi. 

**Yechimlar:**
1. **Render PostgreSQL** ishlatish (tavsiya etiladi)
2. Yoki har safar restart qilinganda admin user yaratiladi (hozirgi kod)

### Admin user yaratilmayapti

1. Render logs'ni tekshiring
2. Error message'ni ko'ring
3. Database path'ni tekshiring

### Login qila olmayman

1. Render logs'da admin yaratilganligini tekshiring
2. Username va password to'g'ri ekanligini tekshiring
3. Browser console'da error'lar bor-yo'qligini tekshiring

## 📝 Notes

- SQLite database Render'da ephemeral storage'da saqlanadi
- Production uchun PostgreSQL yoki boshqa persistent database tavsiya etiladi
- Admin user har safar startup'da yaratiladi (agar mavjud bo'lmasa)
- Database fayl GitHub'ga push qilinmaydi (`.gitignore` da)

## 🔄 Database Migration (PostgreSQL uchun)

Agar PostgreSQL ishlatmoqchi bo'lsangiz:

1. Render'da PostgreSQL database yarating
2. Environment variable qo'shing:
   ```
   DATABASE_URL=postgresql://user:password@host:port/dbname
   ```
3. Kod PostgreSQL bilan ishlash uchun moslashtirilgan (SQLModel to'liq qo'llab-quvvatlaydi)

