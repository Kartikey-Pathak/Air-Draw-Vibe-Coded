# ✍️ Air Draw + Object Detection (AI Web App)

An interactive browser-based AI app where you can **draw in air using your finger** and switch to **real-time object detection** — all powered by your webcam.

> ⚡ Built with a “vibe coding” approach — rapid iteration, real-time experimentation, and hands-on debugging to make AI feel intuitive.

---

## 🚀 Features

### ✍️ Air Drawing
- Draw in the air using your **index finger**
- Smooth real-time tracking using hand landmarks
- Persistent drawing canvas
- ✋ Open palm acts as an **eraser (localized, not full clear)**

### 🖐️ Hand Tracking
- Real-time **hand skeleton visualization**
- Accurate fingertip detection using MediaPipe

### 🎯 Object Detection Mode
- Switch to detect objects using **COCO-SSD**
- Bounding boxes + labels in real-time
- Smooth tracking (box stabilization applied)
- Detection overlays aligned with full screen

### 🎥 Camera Controls
- Toggle between **front and rear camera**
- Fully responsive full-screen canvas

### ⚡ Performance & UX
- RequestAnimationFrame loop for smooth rendering
- Smart model loading with proper dependency handling
- Loading screen while AI initializes

---

## 🧠 Tech Stack

- **Frontend:** React (Next.js - App Router)
- **Hand Tracking:** MediaPipe Hands
- **Object Detection:** TensorFlow.js + COCO-SSD
- **Rendering:** HTML Canvas API
- **Camera:** WebRTC (`getUserMedia`)

---

## ⚙️ Installation

```bash
git clone https://github.com/your-username/air-draw-ai.git
cd air-draw-ai
npm install
npm run dev