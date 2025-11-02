# Run the MVP (Quick Reference)

## 🚀 3 Commands to Start

```bash
# Terminal 1 - Infrastructure
./start.sh --dev

# Terminal 2 - Smart Drivers
node scripts/simulate-drivers-smart.js

# Terminal 3 - Backend
npm start
```

## 🌐 Open Rider UI

```bash
open http://localhost:3000/rider.html
```

## 📝 Quick Test

1. **Click map** → Set pickup (blue 📍)
2. **Click map** → Set dropoff (red 🎯)
3. **Click button** → Request Ride
4. **Watch** → Driver accepts & completes ride!

**Time**: ~1-2 minutes per ride

---

## 📊 Monitor

- **Backend logs**: Terminal 3
- **Driver logs**: Terminal 2
- **Browser console**: F12

---

## 🛑 Stop Everything

```bash
# Terminal 2 & 3: Ctrl+C

# Terminal 1:
Ctrl+C
docker-compose down
```

---

## 📚 Full Docs

- **MVP-TESTING.md** - Complete testing guide
- **MVP-COMPLETE.md** - What was built
- **MVP-PLAN.md** - Implementation plan

---

## ✅ Success Check

MVP is working if:
- Rider UI loads
- Driver accepts within 5 seconds
- Driver moves on map
- Trip completes with success message

---

**That's it! Happy testing! 🎉**
