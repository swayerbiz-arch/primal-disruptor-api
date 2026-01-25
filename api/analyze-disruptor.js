export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

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

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY in Vercel env vars" });
    }

    const content = [];

    // UPDATED PROMPT - PRIORITIZES VOICE RECORDINGS
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

ANALYSIS PRIORITY ORDER:
1. FIRST - Analyze the voice recordings (food & routine) - these contain the MOST IMPORTANT data
2. SECOND - Use quiz answers only to support or clarify what you heard in the audio
3. If audio reveals clear patterns (bad diet, processed foods, low protein, microwave use, etc.) - PRIORITIZE THOSE OVER quiz answers

QUIZ ANSWERS (secondary context):
- Energy (1-10): ${energy ?? ""}
- Sleep hours: ${sleepHours ?? ""}
- Bedtime: ${bedtime ?? ""}
- Night shifts: ${nightShifts ?? ""}
- Stress (1-10): ${stress ?? ""}
- Indoors daily: ${indoorTime ?? ""}
- Digestive issues: ${digestive ?? ""}
- Body composition: ${bodyComp ?? ""}

VOICE RECORDING GUIDELINES (PRIMARY):
The user will describe their FOOD and DAILY ROUTINE in audio recordings below.

Listen for these HIGH-PRIORITY signals:

NUTRITIONAL DEFICIENCY signals (prioritize if heard):
- McDonald's, fast food, takeout mentioned frequently
- Low protein intake (less than 3 meals with protein)
- No mention of vegetables, fruits, or whole foods
- Skipping meals or eating once per day
- High processed food intake (frozen meals, packaged snacks)
- No mention of healthy fats (eggs, meat, fish, nuts)
- Very low calorie intake or restrictive eating

MICROPLASTIC signals (prioritize if heard):
- Microwaving food in plastic containers
- Drinking from plastic water bottles daily
- Eating mostly packaged/wrapped foods
- Using plastic tupperware for hot food
- Frequent mention of "plastic" or "containers"

GUT DYSBIOSIS signals (prioritize if heard):
- Bloating, gas, constipation, diarrhea mentioned
- Eating very late at night (within 2 hours of bed)
- High sugar intake
- Alcohol consumption mentioned
- Antibiotic use or recent illness

SEDENTARY METABOLISM signals (prioritize if heard):
- Sitting all day, no movement mentioned
- Desk job with no exercise
- No resistance training or gym
- Less than 5,000 steps daily

DIGITAL OVERSTIMULATION signals (prioritize if heard):
- Phone use mentioned excessively
- Scrolling before bed
- Gaming for hours
- Screen time dominating routine

CIRCADIAN signals (only if audio confirms):
- Irregular sleep schedule described in detail
- Night shift work WITH poor sleep quality
- Staying up past 2am regularly WITH daytime fatigue

CHRONIC STRESS signals (only if audio confirms):
- High-pressure job WITH burnout symptoms
- Multiple life stressors mentioned explicitly
- Anxiety/panic attacks mentioned

IMPORTANT DECISION RULES:
- If food recording mentions McDonald's 3x/day or similar = nutritionaldeficiency (override other signals)
- If routine mentions plastic everywhere = microplastic (override other signals)
- If digestive issues are mentioned in audio = gutdysbiosis (strong signal)
- Do NOT default to circadian or stress unless audio explicitly supports it
- Quiz answers showing "high stress" or "late bedtime" should NOT override clear audio evidence of nutrition/plastic/gut issues

Output ONLY the category word (no punctuation, no extra text).`,
    });

    // Helper: attach base64 audio if present
    const pushAudio = (dataUrl, label) => {
      if (!dataUrl || typeof dataUrl !== "string") return;
      if (!dataUrl.startsWith("data:audio")) return;

      const matches = dataUrl.match(/^data:(audio\/[^;]+);base64,(.+)$/);
      if (!matches) return;

      content.push({
        type: "input_audio",
        input_audio: {
          data: matches[2],
          format: "webm",
        },
      });

      content.push({
        type: "text",
        text: `[Above is the ${label} - ANALYZE THIS CAREFULLY FOR PRIMARY DISRUPTOR]`,
      });
    };

    pushAudio(foodAudio, "FOOD RECORDING (what they eat daily)");
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
    console.log("Claude's full response:", JSON.stringify(data, null, 2));

    const output = (data?.content?.[0]?.text || "").toLowerCase().trim();
    console.log("Claude's raw output:", output);

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
    console.log("Final disruptor chosen:", disruptor);

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
