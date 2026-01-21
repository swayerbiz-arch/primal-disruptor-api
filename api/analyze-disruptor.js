export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      energy,
      sleepHours,
      bedtime,
      nightShifts,
      stress,
      indoorTime,
      foodAudio,
      digestive,
      routineAudio,
      bodyComp,
      fullName,
      phone
    } = req.body;

    const content = [];

    content.push({
      type: "text",
      text: `You are analyzing a testosterone assessment to determine the user's PRIMARY testosterone disruptor.

Based on the quiz answers and voice recordings, classify this person into EXACTLY ONE of these 7 categories:
- circadian
- chronicstressresponse
- nutritionaldeficiency
- sedentarymetabolism
- digitaloverstimulation
- gutdysbiosis
- microplastic

QUIZ ANSWERS:
- Energy level (1-10): ${energy}
- Sleep hours per night: ${sleepHours}
- Usual bedtime: ${bedtime}
- Works night shifts: ${nightShifts}
- Stress level (1-10): ${stress}
- Time spent indoors daily: ${indoorTime}
- Digestive issues: ${digestive}
- Body composition: ${bodyComp}

ANALYSIS GUIDELINES:
- Poor sleep schedule, late nights, irregular sleep, night shifts → circadian
- High stress, anxiety, demanding job → chronicstressresponse
- Poor diet, processed food, fast food → nutritionaldeficiency
- Sedentary lifestyle, desk job, no exercise → sedentarymetabolism
- High screen time, phone addiction → digitaloverstimulation
- Digestive problems, bloating, gut issues → gutdysbiosis
- Mentions plastic containers, processed foods → microplastic

Respond with ONLY the disruptor category name, nothing else. Just one word from the list above.`
    });

    if (foodAudio && foodAudio.startsWith('data:audio')) {
      const matches = foodAudio.match(/^data:(audio\/[^;]+);base64,(.+)$/);
      if (matches) {
        content.push({
          type: "input_audio",
          input_audio: {
            data: matches[2],
            format: "webm"
          }
        });
        content.push({
          type: "text",
          text: "[Above is the FOOD RECORDING - what they eat on a typical day]"
        });
      }
    }

    if (routineAudio && routineAudio.startsWith('data:audio')) {
      const matches = routineAudio.match(/^data:(audio\/[^;]+);base64,(.+)$/);
      if (matches) {
        content.push({
          type: "input_audio",
          input_audio: {
            data: matches[2],
            format: "webm"
          }
        });
        content.push({
          type: "text",
          text: "[Above is the ROUTINE RECORDING - their typical day from morning to night]"
        });
      }
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': proces
