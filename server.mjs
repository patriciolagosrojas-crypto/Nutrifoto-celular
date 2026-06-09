import http from "node:http";
import https from "node:https";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT || 5173);
const PUBLIC_DIR = join(process.cwd(), "public");
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const USE_HTTPS = process.env.HTTPS === "true";
const HTTPS_KEY = process.env.HTTPS_KEY || join(process.cwd(), "certs", "local-key.pem");
const HTTPS_CERT = process.env.HTTPS_CERT || join(process.cwd(), "certs", "local-cert.pem");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function fallbackAnalysis({ notes = "", goals = [] }) {
  const text = notes.toLowerCase();
  const positive = [
    ["proteina", /pollo|pescado|salm[oó]n|sardina|atun|at[uú]n|huevo|legumbre|lenteja|poroto|garbanzo|tofu|yogur|carne|marisco/.test(text)],
    ["fibra", /verdura|ensalada|br[oó]coli|espinaca|avena|legumbre|fruta|palta/.test(text)],
    ["grasas saludables", /aceite de oliva|palta|nuez|almendra|semilla|salm[oó]n|sardina/.test(text)],
    ["fermentados", /yogur|k[eé]fir|chucrut|kimchi|miso/.test(text)]
  ].filter(([, ok]) => ok).map(([label]) => label);

  const cautions = [
    ["ultraprocesados", /frito|embutido|salchicha|bebida|az[uú]car|dulce|pan blanco|mayonesa/.test(text)],
    ["exceso de almidon refinado", /arroz blanco|pasta|papas fritas|pan blanco/.test(text)]
  ].filter(([, ok]) => ok).map(([label]) => label);

  const score = Math.max(35, Math.min(88, 52 + positive.length * 10 - cautions.length * 8 + goals.length * 2));
  return {
    mode: "fallback",
    dishName: "Plato evaluado con datos guiados",
    confidence: "Media-baja: no hay modelo de visión activo, se usaron tus notas.",
    ingredients: positive.length
      ? positive.map((item) => ({ name: item, evidence: "Detectado en la descripción ingresada." }))
      : [{ name: "Ingredientes no confirmados", evidence: "Agrega notas o configura OPENAI_API_KEY para análisis visual." }],
    cookingMethods: cautions.includes("ultraprocesados")
      ? ["Posible fritura o alimento procesado, según las notas."]
      : ["No determinado con certeza; se recomienda indicar si fue hervido, salteado, al vapor, asado o frito."],
    nutritionVerdict: {
      score,
      summary: score >= 75
        ? "Buen perfil general: combina señales favorables para masa muscular, microbiota y control metabólico."
        : "Perfil mejorable: faltan datos o conviene reforzar proteína, fibra vegetal y grasas saludables.",
      strengths: positive.length ? positive : ["La evaluación necesita más información."],
      concerns: cautions.length ? cautions : ["Sin alertas claras, pero la foto/notas no bastan para estimar porciones."],
      practicalAdjustments: [
        "Asegura 25-35 g de proteína de buena calidad por comida si tu objetivo es retardar sarcopenia.",
        "Agrega verduras de colores y legumbres o granos integrales para fibra y polifenoles.",
        "Prefiere cocción al vapor, horno, plancha suave o salteado breve por sobre fritura intensa."
      ]
    },
    telomeraseCellularAssimilation: {
      verdict: "No se puede afirmar que un plato 'genere telomerasa' en una persona. Sí puede estimarse si aporta patrones asociados a menor estrés oxidativo, mejor sensibilidad metabólica y soporte de reparación celular.",
      supportiveSignals: [
        "Proteína adecuada y leucina para síntesis muscular.",
        "Fibra y polifenoles para microbiota y señalización antiinflamatoria.",
        "Omega-3, aceite de oliva, frutos secos o palta cuando están presentes."
      ],
      missingSignals: [
        "Sueño, ejercicio de fuerza, estrés, edad y salud basal son determinantes fuera de la foto.",
        "La asimilación celular no puede medirse visualmente; requeriría contexto clínico y biomarcadores."
      ]
    },
    disclaimer: "Orientación educativa, no diagnóstico médico ni nutricional. Para sarcopenia, enfermedades crónicas o suplementación, consulta a un profesional de salud."
  };
}

async function analyzeWithOpenAI(payload) {
  if (!process.env.OPENAI_API_KEY) return fallbackAnalysis(payload);
  const image = payload.imageDataUrl;
  if (!image || !image.startsWith("data:image/")) return fallbackAnalysis(payload);

  const prompt = `Analiza una fotografia de un plato servido. Responde SOLO JSON valido con estas claves:
dishName, confidence, ingredients[{name,evidence,estimatedPortion}], cookingMethods[],
nutritionVerdict{score,summary,strengths[],concerns[],practicalAdjustments[]},
telomeraseCellularAssimilation{verdict,supportiveSignals[],missingSignals[]}, disclaimer.
Evalua ingredientes probables, tipo de coccion, calidad proteica, fibra, grasas, ultraprocesados, potencial antiinflamatorio, soporte para retrasar sarcopenia y asimilacion celular. Se cientificamente prudente: no prometas activar telomerasa ni tratar enfermedades. Notas del usuario: ${payload.notes || "sin notas"}. Objetivos: ${(payload.goals || []).join(", ") || "general"}.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: image } }
          ]
        }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

async function serveStatic(req, res) {
  const protocol = req.socket.encrypted ? "https" : "http";
  const url = new URL(req.url, `${protocol}://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const safePath = normalize(join(PUBLIC_DIR, requested));
  if (!safePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const file = await readFile(safePath);
    res.writeHead(200, { "Content-Type": mimeTypes[extname(safePath)] || "application/octet-stream" });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

async function handleRequest(req, res) {
  if (req.method === "POST" && req.url === "/api/analyze") {
    try {
      const payload = JSON.parse(await readBody(req));
      const result = await analyzeWithOpenAI(payload);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 500, {
        error: "No se pudo analizar el plato.",
        detail: error.message
      });
    }
    return;
  }
  serveStatic(req, res);
}

async function createServer() {
  if (!USE_HTTPS) return { server: http.createServer(handleRequest), protocol: "http" };

  const [key, cert] = await Promise.all([readFile(HTTPS_KEY), readFile(HTTPS_CERT)]);
  return {
    server: https.createServer({ key, cert }, handleRequest),
    protocol: "https"
  };
}

const { server, protocol } = await createServer();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`App lista en ${protocol}://localhost:${PORT}`);
});
