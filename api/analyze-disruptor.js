export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  // Keep a safe browser test route
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, message: "analyze-disruptor endpoint is live" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const {
      energy,
      sleepHours,
      bedtime,
      nightShifts,
      stress,
      indoorTime,
      digestive,
      bodyComp,
      foodAudio,
      routineAudio,
      fullName,
      phone,
    } = body;

    // Basic validation (prevents crashes)
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY in Vercel env vars" });
    }

    const content = [];

    // The actual prompt Claude uses
    content.push({
      type: "text",
      text: `You are analyzing a testosterone assessment to determine the user's PRIMARY testosterone disruptor.

Return EXACTLY ONE of these 7 categories (one word only):
circadian
chronicstressresponse
nutritionaldeficiency
sedentarymetabolism
digitaloverstimulation
gutdysbiosis
microplastic

QUIZ ANSWERS:
- Energy (1-10): ${energy ?? ""}
- Sleep hours: ${sleepHours ?? ""}
- Bedtime: ${bedtime ?? ""}
- Night shifts: ${nightShifts ?? ""}
- Stress (1-10): ${stress ?? ""}
- Indoors daily: ${indoorTime ?? ""}
- Digestive issues: ${digestive ?? ""}
- Body composition: ${bodyComp ?? ""}

GUIDELINES:
- Poor sleep schedule / late nights / irregular sleep / night shifts → circadian
- High stress / anxiety / overwhelmed / sympathetic dominance → chronicstressresponse
- Poor diet / low protein / low micronutrients / processed foods → nutritionaldeficiency
- Sedentary / deskbound / low movement / low training → sedentarymetabolism
- High screen time / dopamine seeking / phone addiction / late-night scrolling → digitaloverstimulation
- Bloating / reflux / constipation / diarrhea / gut pain → gutdysbiosis
- Frequent plastics / microwaving plastic / packaged foods / bottled water → microplastic

IMPORTANT:
- Decide the SINGLE most likely primary disruptor.
- Output ONLY the category word (no punctuation, no extra text).`,
    });

    // Helper: attach base64 audio if present
    const pushAudio = (dataUrl, label) => {
      if (!dataUrl || typeof dataUrl !== "string") return;
      if (!dataUrl.startsWith("data:audio")) return;

      const matches = dataUrl.match(/^data:(audio\/[^;]+);base64,(.+)$/);
      if (!matches) return;

      // NOTE: Your recorder produces webm
      content.push({
        type: "input_audio",
        input_audio: {
          data: matches[2],
          format: "webm",
        },
      });

      content.push({
        type: "text",
        text: `[Above is the ${label}]`,
      });
    };

    pushAudio(foodAudio, "FOOD RECORDING (what they eat)");
    pushAudio(routineAudio, "ROUTINE RECORDING (their typical day)");

    const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 30,
        messages: [{ role: "user", content }],
      }),
    });

    const rawText = await anthropicResp.text();

    if (!anthropicResp.ok) {
      return res.status(500).json({
        error: "Claude API error",
        status: anthropicResp.status,
        details: rawText,
      });
    }

    const data = JSON.parse(rawText);
    console.log("Claude's full response:", JSON.stringify(data, null, 2));  // <-- ADDED

    const output = (data?.content?.[0]?.text || "").toLowerCase().trim();
    console.log("Claude's raw output:", output);  // <-- ADDED

    const valid = [
      "circadian",
      "chronicstressresponse",
      "nutritionaldeficiency",
      "sedentarymetabolism",
      "digitaloverstimulation",
      "gutdysbiosis",
      "microplastic",
    ];

    const disruptor = valid.find((d) => output.includes(d)) || "circadian";
    console.log("Final disruptor chosen:", disruptor);  // <-- ADDED

    return res.status(200).json({
      ok: true,
      disruptor,
      fullName: fullName || "",
      phone: phone || "",
    });
  } catch (err) {
    return res.status(500).json({
      error: "Server crashed",
      details: String(err?.message || err),
    });
  }
}
