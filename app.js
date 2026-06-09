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

startCamera.addEventListener("click", async () => {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("La camara directa requiere HTTPS o abrir la app como localhost. Usa Subir foto o publica la app con HTTPS.");
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
    errorBox.textContent = `No se pudo abrir la camara: ${error.message}`;
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
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => setPreview(String(reader.result));
  reader.readAsDataURL(file);
});

analyze.addEventListener("click", async () => {
  errorBox.hidden = true;
  results.hidden = true;
  loading.hidden = false;
  analyze.disabled = true;

  const goals = [...document.querySelectorAll(".goals input:checked")].map((input) => input.value);

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl, notes: notes.value, goals })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || data.error || "Error desconocido");

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
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  } finally {
    loading.hidden = true;
    analyze.disabled = false;
  }
});
