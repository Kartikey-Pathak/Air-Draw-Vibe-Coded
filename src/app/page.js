"use client";
import { useEffect, useRef } from "react";

export default function Home() {
  const videoRef = useRef(null);
  const drawCanvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);

  useEffect(() => {
    let lastX = null;
    let lastY = null;
    let camera = null;
    let hands = null;

    // ✅ Fix canvas + video size to full screen
    const setCanvasSize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      const video = videoRef.current;
      const drawCanvas = drawCanvasRef.current;
      const overlayCanvas = overlayCanvasRef.current;

      if (video) {
        video.width = width;
        video.height = height;
      }

      if (drawCanvas && overlayCanvas) {
        drawCanvas.width = width;
        drawCanvas.height = height;

        overlayCanvas.width = width;
        overlayCanvas.height = height;
      }
    };

    const init = async () => {
      await Promise.all([
        loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/hands.js"),
        loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3/camera_utils.js"),
        loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js"),
      ]);

      setCanvasSize();
      window.addEventListener("resize", setCanvasSize);

      const video = videoRef.current;

      hands = new window.Hands({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`,
      });

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 0,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7,
      });

      hands.onResults(onResults);

      camera = new window.Camera(video, {
        onFrame: async () => {
          if (video.readyState >= 2) {
            await hands.send({ image: video });
          }
        },
      });

      camera.start();
    };

    // ✋ Palm detection
    function isPalmOpen(landmarks) {
      return (
        landmarks[8].y < landmarks[6].y &&
        landmarks[12].y < landmarks[10].y &&
        landmarks[16].y < landmarks[14].y &&
        landmarks[20].y < landmarks[18].y
      );
    }

    function onResults(results) {
      const drawCanvas = drawCanvasRef.current;
      const overlayCanvas = overlayCanvasRef.current;

      const drawCtx = drawCanvas.getContext("2d");
      const overlayCtx = overlayCanvas.getContext("2d");

      // clear overlay only
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

      if (!results.multiHandLandmarks?.length) {
        lastX = null;
        lastY = null;
        return;
      }

      const landmarks = results.multiHandLandmarks[0];

      // ✋ Palm = eraser (but STILL show skeleton)
      let isErasing = false;

      if (isPalmOpen(landmarks)) {
        isErasing = true;

        const palmX = landmarks[9].x * drawCanvas.width;
        const palmY = landmarks[9].y * drawCanvas.height;

        drawCtx.globalCompositeOperation = "destination-out";

        drawCtx.beginPath();
        drawCtx.arc(palmX, palmY, 30, 0, 2 * Math.PI);
        drawCtx.fill();

        drawCtx.globalCompositeOperation = "source-over";

        lastX = null;
        lastY = null;
      }

      // 🖐️ Skeleton
      window.drawConnectors(overlayCtx, landmarks, window.HAND_CONNECTIONS, {
        color: "lime",
        lineWidth: 2,
      });

      window.drawLandmarks(overlayCtx, landmarks, {
        color: "yellow",
        lineWidth: 1,
      });

      // 👉 index finger
      const x = landmarks[8].x * drawCanvas.width;
      const y = landmarks[8].y * drawCanvas.height;

      if (lastX !== null && lastY !== null) {
        drawCtx.beginPath();
        drawCtx.moveTo(lastX, lastY);
        drawCtx.lineTo(x, y);
        drawCtx.strokeStyle = "red";
        drawCtx.lineWidth = 5;
        drawCtx.stroke();
      }

      lastX = x;
      lastY = y;
    }

    init();

    return () => {
      window.removeEventListener("resize", setCanvasSize);

      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return (
    <div className="w-screen h-screen overflow-hidden bg-black">
      <h1 className="absolute top-5 left-1/2 -translate-x-1/2 text-white text-3xl font-semibold z-10">
        Air Draw ✍️
      </h1>

      <div className="relative w-full h-full">
        {/* 🎥 VIDEO */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute top-0 left-0 w-full h-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />

        {/* 🎨 DRAW */}
        <canvas
          ref={drawCanvasRef}
          className="absolute top-0 left-0 w-full h-full"
          style={{ transform: "scaleX(-1)" }}
        />

        {/* 🖐️ OVERLAY */}
        <canvas
          ref={overlayCanvasRef}
          className="absolute top-0 left-0 w-full h-full"
          style={{ transform: "scaleX(-1)" }}
        />
      </div>
    </div>
  );
}

// script loader
function loadScript(src) {
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    document.body.appendChild(script);
  });
}