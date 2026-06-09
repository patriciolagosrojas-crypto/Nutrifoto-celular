/ Aumenta el límite de Vercel de 1MB a 10MB para permitir que pasen las fotografías
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

// Aumenta el límite de tiempo a 60 segundos por si OpenAI tarda en analizar la foto
export const maxDuration = 60; 

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function fallbackAnalysis(payload = {}) {
  const notes = payload.notes || "";
  const goals = payload.goals || [];
  const text = notes.toLowerCase();
  
  const positive = [
    ["proteina", /pollo|pescado|salmon|sardina|atun|huevo|legumbre|lenteja|poroto|garbanzo|tofu|yogur|carne|marisco/.test(text)],
    ["fibra", /verdura|ensalada|brocoli|espinaca|avena|legumbre|fruta|palta/.test(text)],
    ["grasas saludables", /aceite de oliva|palta|nuez|almendra|semilla|salmon|sardina/.test(text)],
    ["fermentados", /yogur|kefir|chucrut|kimchi|miso/.test(text)]
  ].filter(([, ok]) => ok).map(([label]) => label);

  const cautions = [
    ["ultraprocesados", /frito|embutido|salchicha|bebida|azucar|dulce|pan blanco|mayonesa/.test(text)],
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
      verdict: "No se puede afirmar que un plato genere telomerasa en una persona. Sí puede estimarse si aporta patrones asociados a menor estrés oxidativo, mejor sensibilidad metabólica y soporte de reparación celular.",
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

// Exportación en formato ES Module requerida por tu package.json ("type": "module")
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido." });
  }

  try {
    // Vercel ya parsea automáticamente req.body, por lo que podemos usarlo directo
    const result = await analyzeWithOpenAI(req.body || {});
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: "No se pudo analizar el plato.",
      detail: error.message
    });
  }
}
