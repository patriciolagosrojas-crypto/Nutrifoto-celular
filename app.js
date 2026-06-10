const OPENAI_API_KEY = "PEGA_TU_LLAVE_DE_OPENAI_AQUI"; // <--- Pega tu API Key real aquí entre las comillas

const camera = document.querySelector("#camera");
const preview = document.querySelector("#preview");
const canvas = document.querySelector("#canvas");
const emptyState = document.querySelector("#emptyState");
const startCamera = document.querySelector("#startCamera");
const snapPhoto = document.querySelector("#snapPhoto");
const fileInput = document.querySelector("#fileInput");
const analyze = document.querySelector("#analyze");
const notes = document.querySelector("#notes");
const loading = document.querySelector("#loading");
const errorBox = document.querySelector("#errorBox");
const results = document.querySelector("#results");
const dishName = document.querySelector("#dishName");
const scoreRing = document.querySelector("#scoreRing");

let stream = null;
let imageDataUrl = "";

// 1. Registro del Service Worker (Para que se instale como App)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      console.warn("No se pudo registrar el modo PWA.");
    });
  });
}

function setPreview(src) {
  imageDataUrl = src;
  preview.src = src;
  preview.hidden = false;
  emptyState.hidden = true;
  camera.hidden = true;
}

function listItems(id, items, render = (item) => item) {
  const target = document.querySelector(id);
  target.innerHTML = "";
  (items || []).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = render(item);
    target.appendChild(li);
  });
}

function setScore(score) {
  const value = Number.isFinite(Number(score)) ? Math.round(Number(score)) : 0;
  const color = value >= 75 ? "#7aa33a" : value >= 55 ? "#d59b2d" : "#c84b31";
  scoreRing.dataset.score = value ? String(value) : "--";
  scoreRing.style.background = `conic-gradient(${color} ${value * 3.6}deg, #d9e2de 0deg)`;
}

// 2. Controles de Cámara y Archivos
startCamera.addEventListener("click", async () => {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("La cámara directa requiere HTTPS.");
    }
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    camera.srcObject = stream;
    camera.hidden = false;
    preview.hidden = true;
    emptyState.hidden = true;
    snapPhoto.disabled = false;
  } catch (error) {
    errorBox.textContent = `No se pudo abrir la cámara: ${error.message}`;
    errorBox.hidden = false;
  }
});

snapPhoto.addEventListener("click", () => {
  const width = camera.videoWidth || 1280;
  const height = camera.videoHeight || 960;
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(camera, 0, 0, width, height);
  setPreview(canvas.toDataURL("image/jpeg", 0.9));

  // Apagar la cámara del celular tras tomar la foto
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => setPreview(String(reader.result));
  reader.readAsDataURL(file);
});

// 3. Conexión Directa a la Inteligencia Artificial (Frontend)
analyze.addEventListener("click", async () => {
  if (!imageDataUrl) return;

  errorBox.hidden = true;
  results.hidden = true;
  loading.hidden = false;
  analyze.disabled = true;

  const goals = [...document.querySelectorAll(".goals input:checked")].map((input) => input.value);

  if (!OPENAI_API_KEY || OPENAI_API_KEY === "PEGA_TU_LLAVE_DE_OPENAI_AQUI") {
     errorBox.textContent = "Por favor, pega tu llave de OpenAI en el archivo app.js";
     errorBox.hidden = false;
     loading.hidden = true;
     analyze.disabled = false;
     return;
  }

  try {
    const prompt = `Analiza una fotografía de un plato servido. Responde SOLO JSON válido con estas claves:
dishName, confidence, ingredients[{name,evidence,estimatedPortion}], cookingMethods[],
nutritionVerdict{score,summary,strengths[],concerns[],practicalAdjustments[]},
telomeraseCellularAssimilation{verdict,supportiveSignals[],missingSignals[]}, disclaimer.
Evalúa ingredientes probables, tipo de cocción, calidad proteica, fibra, grasas, ultraprocesados, potencial antiinflamatorio, soporte para retrasar sarcopenia y asimilación celular. Sé científicamente prudente. Notas del usuario: ${notes.value || "sin notas"}. Objetivos: ${goals.join(", ") || "general"}.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageDataUrl } }
            ]
          }
        ],
        temperature: 0.2
      })
    });

    const rawData = await response.json();
    if (!response.ok) throw new Error(rawData.error?.message || "Error desconocido de OpenAI");

    const data = JSON.parse(rawData.choices[0].message.content);

    // Llenar los datos en tu diseño visual
    dishName.textContent = data.dishName || "Plato analizado";
    setScore(data.nutritionVerdict?.score);
    document.querySelector("#summary").textContent = data.nutritionVerdict?.summary || "";
    document.querySelector("#confidence").textContent = data.confidence || "";
    document.querySelector("#cellVerdict").textContent = data.telomeraseCellularAssimilation?.verdict || "";
    document.querySelector("#disclaimer").textContent = data.disclaimer || "";

    listItems("#ingredients", data.ingredients, (item) => {
      const portion = item.estimatedPortion ? ` (${item.estimatedPortion})` : "";
      return `${item.name}${portion}: ${item.evidence || "probable por la imagen"}`;
    });
    listItems("#cooking", data.cookingMethods);
    listItems("#strengths", data.nutritionVerdict?.strengths);
    listItems("#concerns", data.nutritionVerdict?.concerns);
    listItems("#supportive", data.telomeraseCellularAssimilation?.supportiveSignals);
    listItems("#missing", data.telomeraseCellularAssimilation?.missingSignals);
    listItems("#adjustments", data.nutritionVerdict?.practicalAdjustments);

    results.hidden = false;
  } catch (error) {
    errorBox.textContent = `Error: ${error.message}`;
    errorBox.hidden = false;
  } finally {
    loading.hidden = true;
    analyze.disabled = false;
  }
});
