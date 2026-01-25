export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method === "GET") return res.status(200).json({ ok: true, message: "analyze-disruptor is live" });
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const body = req.body || {};
    const {
      energy, sleepHours, bedtime, nightShifts, stress, indoorTime, digestive, bodyComp,
      foodAudio, routineAudio,
      debug
    } = body;

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ ok: false, error: "Missing ANTHROPIC_API_KEY" });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ ok: false, error: "Missing OPENAI_API_KEY" });
    }

    // ---------- helpers ----------
    const parseDataUrlAudio = (dataUrl) => {
      if (!dataUrl || typeof dataUrl !== "string") return null;
      const m = dataUrl.match(/^data:(audio\/[^;]+);base64,(.+)$/);
      if (!m) return null;
      const mime = m[1];               // e.g. audio/webm
      const base64 = m[2];
      return { mime, base64 };
    };

    const base64ToBuffer = (b64) => Buffer.from(b64, "base64");

    // Calls OpenAI Speech-to-Text and returns transcript text
    const transcribeWithOpenAI = async (dataUrl, label) => {
      const parsed = parseDataUrlAudio(dataUrl);
      if (!parsed) return "";

      const { mime, base64 } = parsed;
      const buf = base64ToBuffer(base64);

      // Create a "file" via Blob for multipart form-data
      const ext = (mime.split("/")[1] || "webm").replace(/[^a-z0-9]/gi, "");
      const filename = `${label}.${ext}`;
      const blob = new Blob([buf], { type: mime });

      const form = new FormData();
      // Use a higher-quality transcribe model if you want:
      // model: "gpt-4o-mini-transcribe" or "whisper-1"
      form.append("model", "gpt-4o-mini-transcribe");
      form.append("file", blob, filename);

      const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: form,
      });

      const text = await r.text();
      if (!r.ok) {
        // Return a clear error so you can see what failed
        throw new Error(`OpenAI transcription failed (${r.status}): ${text}`);
      }

      const json = JSON.parse(text);
      return (json?.text || "").trim();
    };

    // ---------- transcribe ----------
    const foodTranscript = await transcribeWithOpenAI(foodAudio, "food");
    const routineTranscript = await transcribeWithOpenAI(routineAudio, "routine");

    // ---------- build Claude prompt ----------
    const prompt = `You are analyzing a testosterone assessment to determine the user's PRIMARY testosterone disruptor.

Return EXACTLY ONE of these 7 categories (one word only):
circadian
chronicstressresponse
nutritionaldeficiency
sedentarymetabolism
digitaloverstimulation
gutdysbiosis
microplastic

PRIORITY:
- The FOOD + ROUTINE transcripts are the MOST IMPORTANT signals.
- Use quiz answers only as secondary context.
- Do NOT default to circadian/chronicstressresponse unless the transcripts support it.

QUIZ:
- Energy (1-10): ${energy ?? ""}
- Sleep hours: ${sleepHours ?? ""}
- Bedtime: ${bedtime ?? ""}
- Night shifts: ${nightShifts ?? ""}
- Stress (1-10): ${stress ?? ""}
- Indoors daily: ${indoorTime ?? ""}
- Digestive issues: ${digestive ?? ""}
- Body composition: ${bodyComp ?? ""}

FOOD TRANSCRIPT (primary):
${foodTranscript || "[no food transcript]"}

ROUTINE TRANSCRIPT (primary):
${routineTranscript || "[no routine transcript]"}

OVERRIDES:
- If they mention fast food (e.g., McDonald's) multiple times/day → nutritionaldeficiency
- If they mention microwaving plastic / bottled water daily / packaged foods → microplastic
- If they mention reflux/bloating/constipation/diarrhea → gutdysbiosis

Output ONLY the category word.`;

    // ---------- call Claude ----------
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
        messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
      }),
    });

    const rawClaude = await anthropicResp.text();
    if (!anthropicResp.ok) {
      return res.status(500).json({ ok: false, error: "Claude API error", status: anthropicResp.status, details: rawClaude });
    }

    const data = JSON.parse(rawClaude);
    const allText = Array.isArray(data?.content)
      ? data.content.filter((c) => c?.type === "text" && typeof c.text === "string").map((c) => c.text).join("\n")
      : "";

    const output = (allText || "").toLowerCase().trim();

    const valid = [
      "circadian","chronicstressresponse","nutritionaldeficiency",
      "sedentarymetabolism","digitaloverstimulation","gutdysbiosis","microplastic",
    ];

    const disruptor = valid.find((d) => output.includes(d)) || "circadian";

    if (debug === true) {
      return res.status(200).json({
        ok: true,
        disruptor,
        debug: {
          foodTranscript,
          routineTranscript,
          claudeText: allText
        }
      });
    }

    return res.status(200).json({ ok: true, disruptor });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Server crashed", details: String(err?.message || err) });
  }
}
