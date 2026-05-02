"use client";
import { useEffect, useRef, useState } from "react";

export default function Home() {
  const videoRef = useRef(null);
  const drawCanvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);

  const [mode, setMode] = useState("draw");
  const [facingMode, setFacingMode] = useState("user");
  const [loading, setLoading] = useState(true);

  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    let lastX = null;
    let lastY = null;
    let hands = null;
    let model = null;
    let stream = null;
    let prevBoxes = [];

    const setCanvasSize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      [videoRef, drawCanvasRef, overlayCanvasRef].forEach((ref) => {
        if (ref.current) {
          ref.current.width = w;
          ref.current.height = h;
        }
      });
    };

    const init = async () => {
      await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/hands.js");
      await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js");

      await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs");
      await waitFor(() => window.tf);
      await window.tf.ready();

      await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd");
      await waitFor(() => window.cocoSsd);

      setCanvasSize();
      window.addEventListener("resize", setCanvasSize);

      const video = videoRef.current;

      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
      });

      video.srcObject = stream;
      await video.play();

      model = await window.cocoSsd.load();

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

      setLoading(false);

      const loop = async () => {
        if (video.readyState >= 2) {
          if (modeRef.current === "draw") {
            await hands.send({ image: video });
          } else {
            await detectObjects(video);
          }
        }
        requestAnimationFrame(loop);
      };

      loop();
    };

    function isPalmOpen(l) {
      return (
        l[8].y < l[6].y &&
        l[12].y < l[10].y &&
        l[16].y < l[14].y &&
        l[20].y < l[18].y
      );
    }

    async function detectObjects(video) {
      const overlay = overlayCanvasRef.current;
      const draw = drawCanvasRef.current;
      const ctx = overlay.getContext("2d");

      const cw = overlay.width;
      const ch = overlay.height;

      const vw = video.videoWidth;
      const vh = video.videoHeight;

      const scaleX = cw / vw;
      const scaleY = ch / vh;

      ctx.clearRect(0, 0, cw, ch);
      draw.getContext("2d").clearRect(0, 0, cw, ch);

      const predictions = await model.detect(video);

      const smoothed = [];

      predictions.forEach((p, i) => {
        let [x, y, w, h] = p.bbox;

        x *= scaleX;
        y *= scaleY;
        w *= scaleX;
        h *= scaleY;

        if (prevBoxes[i]) {
          const a = 0.7;
          x = prevBoxes[i].x * a + x * (1 - a);
          y = prevBoxes[i].y * a + y * (1 - a);
          w = prevBoxes[i].w * a + w * (1 - a);
          h = prevBoxes[i].h * a + h * (1 - a);
        }

        smoothed.push({ x, y, w, h });

        ctx.strokeStyle = "red";
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, w, h);

        ctx.save();
        ctx.scale(-1, 1);
        ctx.fillStyle = "red";
        ctx.font = "16px Arial";
        ctx.fillText(p.class, -(x + w), y - 5);
        ctx.restore();
      });

      prevBoxes = smoothed;
    }

    function onResults(results) {
      if (modeRef.current !== "draw") return;

      const draw = drawCanvasRef.current;
      const overlay = overlayCanvasRef.current;

      const dctx = draw.getContext("2d");
      const octx = overlay.getContext("2d");

      octx.clearRect(0, 0, overlay.width, overlay.height);

      if (!results.multiHandLandmarks?.length) {
        lastX = null;
        lastY = null;
        return;
      }

      const l = results.multiHandLandmarks[0];

      let erasing = false;

      if (isPalmOpen(l)) {
        erasing = true;

        const px = l[9].x * draw.width;
        const py = l[9].y * draw.height;

        dctx.globalCompositeOperation = "destination-out";
        dctx.beginPath();
        dctx.arc(px, py, 40, 0, 2 * Math.PI);
        dctx.fill();
        dctx.globalCompositeOperation = "source-over";

        lastX = null;
        lastY = null;
      }

      window.drawConnectors(octx, l, window.HAND_CONNECTIONS, {
        color: "lime",
        lineWidth: 2,
      });

      window.drawLandmarks(octx, l, { color: "yellow" });

      const x = l[8].x * draw.width;
      const y = l[8].y * draw.height;

      if (!erasing && lastX !== null && lastY !== null) {
        dctx.beginPath();
        dctx.moveTo(lastX, lastY);
        dctx.lineTo(x, y);
        dctx.strokeStyle = "red";
        dctx.lineWidth = 5;
        dctx.stroke();
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
  }, [facingMode]);

  useEffect(() => {
    const overlay = overlayCanvasRef.current;
    const draw = drawCanvasRef.current;

    if (overlay && draw) {
      overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height);

      if (mode === "detect") {
        draw.getContext("2d").clearRect(0, 0, draw.width, draw.height);
      }
    }
  }, [mode]);

  return (
    <div className="w-screen h-screen bg-black">
      {loading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black text-white">
          <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-lg">Initializing AI...</p>
        </div>
      )}

      <div className="absolute top-5 left-5 z-20 flex gap-3">
        <button
          disabled={loading}
          onClick={() => setMode(mode === "draw" ? "detect" : "draw")}
          className="btn btn-soft btn-accent px-4 py-2 rounded disabled:opacity-50"
        >
          {mode === "draw" ? "Object Mode" : "Draw Mode"}
        </button>

        <button
          disabled={loading}
          onClick={() =>
            setFacingMode(facingMode === "user" ? "environment" : "user")
          }
          className="btn btn-soft btn-info px-4 py-2 rounded disabled:opacity-50"
        >
          Switch Camera
        </button>
      </div>

      {/* 🎥 VIDEO */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute w-full h-full object-cover"
        style={{
          transform: facingMode === "user" ? "scaleX(-1)" : "scaleX(1)",
        }}
      />

      {/* 🎨 DRAW */}
      <canvas
        ref={drawCanvasRef}
        className="absolute w-full h-full"
        style={{
          transform: facingMode === "user" ? "scaleX(-1)" : "scaleX(1)",
        }}
      />

      {/* 🖐️ OVERLAY */}
      <canvas
        ref={overlayCanvasRef}
        className="absolute w-full h-full"
        style={{
          transform: facingMode === "user" ? "scaleX(-1)" : "scaleX(1)",
        }}
      />
    </div>
  );
}

function loadScript(src) {
  return new Promise((resolve) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    document.body.appendChild(script);
  });
}

function waitFor(conditionFn) {
  return new Promise((resolve) => {
    const check = () => {
      if (conditionFn()) resolve();
      else requestAnimationFrame(check);
    };
    check();
  });
}