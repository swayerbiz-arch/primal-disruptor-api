export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    return res.status(200).json({ ok: true, message: "analyze-disruptor endpoint is live" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
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
      debug, // <-- send {debug:true} to receive debug payload
    } = body;

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ ok: false, error: "Missing ANTHROPIC_API_KEY in Vercel env vars" });
    }

    // --- DEBUG: prove what we received ---
    const received = {
      hasFoodAudio: typeof foodAudio === "string" && foodAudio.length > 0,
      hasRoutineAudio: typeof routineAudio === "string" && routineAudio.length > 0,
      foodAudioPrefix: typeof foodAudio === "string" ? foodAudio.slice(0, 30) : null,
      routineAudioPrefix: typeof routineAudio === "string" ? routineAudio.slice(0, 30) : null,
      foodAudioLength: typeof foodAudio === "string" ? foodAudio.length : 0,
      routineAudioLength: typeof routineAudio === "string" ? routineAudio.length : 0,
    };

    const content = [];

    // Keep prompt simple but explicit about audio priority
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

PRIORITY:
- If audio exists, prioritize what you HEAR in FOOD/ROUTINE over the quiz.
- Do NOT default to circadian or chronicstressresponse unless audio supports it.

QUIZ:
- Energy (1-10): ${energy ?? ""}
- Sleep hours: ${sleepHours ?? ""}
- Bedtime: ${bedtime ?? ""}
- Night shifts: ${nightShifts ?? ""}
- Stress (1-10): ${stress ?? ""}
- Indoors daily: ${indoorTime ?? ""}
- Digestive issues: ${digestive ?? ""}
- Body composition: ${bodyComp ?? ""}

Audio will appear next if provided.
Output ONLY the category word.`,
    });

    // Helper: attach base64 audio if present
    const audioAttach = { foodAttached: false, routineAttached: false, foodMime: null, routineMime: null };

    const pushAudio = (dataUrl, label, which) => {
      if (!dataUrl || typeof dataUrl !== "string") return false;
      if (!dataUrl.startsWith("data:audio")) return false;

      const matches = dataUrl.match(/^data:(audio\/[^;]+);base64,(.+)$/);
      if (!matches) return false;

      const mime = matches[1]; // e.g. audio/webm
      const base64 = matches[2];

      // Claude wants format like "webm" not "audio/webm"
      const format = mime.split("/")[1] || "webm";

      content.push({
        type: "input_audio",
        input_audio: { data: base64, format },
      });
      content.push({ type: "text", text: `[Above is the ${label}]` });

      if (which === "food") {
        audioAttach.foodAttached = true;
        audioAttach.foodMime = mime;
      } else if (which === "routine") {
        audioAttach.routineAttached = true;
        audioAttach.routineMime = mime;
      }

      return true;
    };

    pushAudio(foodAudio, "FOOD RECORDING (what they eat)", "food");
    pushAudio(routineAudio, "ROUTINE RECORDING (their typical day)", "routine");

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
        temperature: 0,
        messages: [{ role: "user", content }],
      }),
    });

    const rawText = await anthropicResp.text();

    if (!anthropicResp.ok) {
      // Return the REAL reason in the response (no logs needed)
      return res.status(500).json({
        ok: false,
        error: "Claude API error",
        status: anthropicResp.status,
        details: rawText,
        received,
        audioAttach,
      });
    }

    const data = JSON.parse(rawText);

    // Some responses may have multiple content blocks; combine all text blocks
    const allText = Array.isArray(data?.content)
      ? data.content
          .filter((c) => c && c.type === "text" && typeof c.text === "string")
          .map((c) => c.text)
          .join("\n")
      : "";

    const output = (allText || "").toLowerCase().trim();

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

    // If debug=true, return proof of what happened
    if (debug === true) {
      return res.status(200).json({
        ok: true,
        disruptor,
        debug: {
          received,
          audioAttach,
          claudeText: allText,
        },
      });
    }

    return res.status(200).json({
      ok: true,
      disruptor,
      fullName: fullName || "",
      phone: phone || "",
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Server crashed",
      details: String(err?.message || err),
    });
  }
}
