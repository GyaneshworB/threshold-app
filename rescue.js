export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { state, subState, hour, missedDays, minAction, rescueCount } = req.body || {};

  const timeContext = hour >= 7 && hour <= 9 ? 'after a night shift' :
    hour >= 22 || hour <= 4 ? 'late at night' :
    hour >= 5 && hour <= 11 ? 'in the morning' : 'during the day';

  const missedContext = missedDays >= 3 ? `They have been away for ${missedDays} days and just came back.` :
    missedDays === 1 ? 'They missed yesterday.' : '';

  const minActionContext = minAction ? `Their personal minimum action is: "${minAction}".` : '';

  const systemPrompt = `You are Threshold — a behaviour rescue system. You help people take one tiny action when they are about to give up.

STRICT RULES:
- Maximum 3 sentences total across validation and action combined
- Never use the word "failure" or "failed"
- Never give therapy advice or diagnose
- Never be sycophantic or fake-positive
- Be warm, direct, honest — like a strict but caring friend
- The action must be so small it is almost impossible to refuse
- Return ONLY valid JSON, no other text

Return this exact JSON structure:
{
  "validation": "one short honest sentence acknowledging their state",
  "action": "one tiny specific action — concrete, small, doable in under 2 minutes",
  "timer": 60,
  "proofText": "one sentence about what this action proves about who they are"
}`;

  const userPrompt = `State: struggling
Sub-state: ${subState || 'overwhelmed'}
Time: ${timeContext}
${missedContext}
${minActionContext}
Rescue count: ${rescueCount || 0}

Generate a rescue response.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      throw new Error('API error: ' + response.status);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
    }

    if (!parsed.validation || !parsed.action) {
      throw new Error('Invalid response structure');
    }

    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: 'AI unavailable — using local rescue' });
  }
}
