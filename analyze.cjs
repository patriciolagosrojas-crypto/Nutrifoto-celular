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
    confidence: "Media-baja: no hay modelo de vision activo, se usaron tus notas.",
    ingredients: positive.length
      ? positive.map((item) => ({ name: item, evidence: "Detectado en la descripcion ingresada." }))
      : [{ name: "Ingredientes no confirmados", evidence: "Agrega notas o configura OPENAI_API_KEY para analisis visual." }],
    cookingMethods: cautions.includes("ultraprocesados")
      ? ["Posible fritura o alimento procesado, segun las notas."]
      : ["No determinado con certeza; se recomienda indicar si fue hervido, salteado, al vapor, asado o frito."],
    nutritionVerdict: {
      score,
      summary: score >= 75
        ? "Buen perfil general: combina senales favorables para masa muscular, microbiota y control metabolico."
        : "Perfil mejorable: faltan datos o conviene reforzar proteina, fibra vegetal y grasas saludables.",
      strengths: positive.length ? positive : ["La evaluacion necesita mas informacion."],
      concerns: cautions.length ? cautions : ["Sin alertas claras, pero la foto/notas no bastan para estimar porciones."],
      practicalAdjustments: [
        "Asegura 25-35 g de proteina de buena calidad por comida si tu objetivo es retardar sarcopenia.",
        "Agrega verduras de colores y legumbres o granos integrales para fibra y polifenoles.",
        "Prefiere coccion al vapor, horno, plancha suave o salteado breve por sobre fritura intensa."
      ]
    },
    telomeraseCellularAssimilation: {
      verdict: "No se puede afirmar que un plato genere telomerasa en una persona. Si puede estimarse si aporta patrones asociados a menor estres oxidativo, mejor sensibilidad metabolica y soporte de reparacion celular.",
      supportiveSignals: [
        "Proteina adecuada y leucina para sintesis muscular.",
        "Fibra y polifenoles para microbiota y senalizacion antiinflamatoria.",
        "Omega-3, aceite de oliva, frutos secos o palta cuando estan presentes."
      ],
      missingSignals: [
        "Sueno, ejercicio de fuerza, estres, edad y salud basal son determinantes fuera de la foto.",
        "La asimilacion celular no puede medirse visualmente; requeriria contexto clinico y biomarcadores."
      ]
    },
    disclaimer: "Orientacion educativa, no diagnostico medico ni nutricional. Para sarcopenia, enfermedades cronicas o suplementacion, consulta a un profesional de salud."
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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Metodo no permitido." });
    return;
  }

  try {
    const result = await analyzeWithOpenAI(req.body || {});
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: "No se pudo analizar el plato.",
      detail: error.message
    });
  }
};
