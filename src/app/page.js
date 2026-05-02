"use client";
import { useEffect, useRef, useState } from "react";

export default function Home() {
  const videoRef = useRef(null);
  const drawCanvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);

  const [mode, setMode] = useState("draw");
  const [facingMode, setFacingMode] = useState("user");
  const [loading, setLoading] = useState(true);

  const [showGuide, setShowGuide] = useState(false);

  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const seen = localStorage.getItem("airdraw-guide");
    if (!seen) {
      setShowGuide(true);
    }
  }, []);

  const closeGuide = () => {
    localStorage.setItem("airdraw-guide", "true");
    setShowGuide(false);
  };

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

    // ✅ FIXED TEXT MIRROR BASED ON CAMERA
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

        // ✅ CONDITIONAL TEXT FLIP (MAIN FIX)
        ctx.fillStyle = "red";
        ctx.font = "16px Arial";

        if (facingMode === "user") {
          ctx.save();
          ctx.scale(-1, 1);
          ctx.fillText(p.class, -(x + w), y - 5);
          ctx.restore();
        } else {
          ctx.fillText(p.class, x, y - 5);
        }
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

          <div role="alert" className=" mt-10 alert alert-warning">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span> <span className=" font-semibold">Warning:</span> High CPU Usage <span className=" font-bold">Mobile May Heat Up...</span></span>
          </div>
        </div>
      )}
      {showGuide && (
        <div className="absolute inset-0 z-50 bg-black/90 text-white flex flex-col items-center justify-center px-6 text-center">

          <h1 className="text-2xl font-bold mb-6">How to Use</h1>

          <div className="space-y-4 text-lg">
            <p>👉 Use <b>index finger</b> to draw</p>
            <p>✋ Open <b>palm</b> to erase</p>
            <p>🎯 Switch to <b>Object Mode</b> for detection</p>
            <p>📷 Use <b>Switch Camera</b> if needed</p>
          </div>

          <button
            onClick={closeGuide}
            className=" font-semibold hover:opacity-85 active:opacity-85 mt-8 px-6 py-2 bg-white text-black rounded-lg"
          >
            Got it
          </button>
        </div>
      )}

      <div className="absolute flex items-center justify-between top-5 left-5 z-20 flex gap-3">
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
        <a href="https://github.com/Kartikey-Pathak">
          <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="50" height="50" viewBox="0 0 30 30">
            <path d="M15,3C8.373,3,3,8.373,3,15c0,5.623,3.872,10.328,9.092,11.63C12.036,26.468,12,26.28,12,26.047v-2.051 c-0.487,0-1.303,0-1.508,0c-0.821,0-1.551-0.353-1.905-1.009c-0.393-0.729-0.461-1.844-1.435-2.526 c-0.289-0.227-0.069-0.486,0.264-0.451c0.615,0.174,1.125,0.596,1.605,1.222c0.478,0.627,0.703,0.769,1.596,0.769 c0.433,0,1.081-0.025,1.691-0.121c0.328-0.833,0.895-1.6,1.588-1.962c-3.996-0.411-5.903-2.399-5.903-5.098 c0-1.162,0.495-2.286,1.336-3.233C9.053,10.647,8.706,8.73,9.435,8c1.798,0,2.885,1.166,3.146,1.481C13.477,9.174,14.461,9,15.495,9 c1.036,0,2.024,0.174,2.922,0.483C18.675,9.17,19.763,8,21.565,8c0.732,0.731,0.381,2.656,0.102,3.594 c0.836,0.945,1.328,2.066,1.328,3.226c0,2.697-1.904,4.684-5.894,5.097C18.199,20.49,19,22.1,19,23.313v2.734 c0,0.104-0.023,0.179-0.035,0.268C23.641,24.676,27,20.236,27,15C27,8.373,21.627,3,15,3z"></path>
          </svg></a>
      </div>

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

      <canvas
        ref={drawCanvasRef}
        className="absolute w-full h-full"
        style={{
          transform: facingMode === "user" ? "scaleX(-1)" : "scaleX(1)",
        }}
      />

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