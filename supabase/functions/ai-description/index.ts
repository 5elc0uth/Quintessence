// Supabase Edge Function: ai-description
// Deploy:  supabase functions deploy ai-description
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-...
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { name, category } = await req.json();

    const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_KEY) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY secret not set. Run: supabase secrets set ANTHROPIC_API_KEY=your-key' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const prompt = `Write a 2-sentence product description for a ${category || 'fragrance'} product called "${name || category}" sold by Quintessence, a premium perfume brand in Nigeria. Be persuasive and sensory, mention key benefits, feel luxury yet accessible. Return ONLY the description text with no quotes, labels, or preamble.`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const raw = await anthropicRes.text();
    let anthropicData: Record<string, unknown>;
    try {
      anthropicData = JSON.parse(raw);
    } catch {
      return new Response(
        JSON.stringify({ error: `Anthropic returned non-JSON (status ${anthropicRes.status}): ${raw.slice(0, 300)}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Anthropic returned an error — pass the full message back so it's visible
    if (!anthropicRes.ok) {
      const errType = (anthropicData?.error as Record<string, unknown>)?.type ?? 'unknown';
      const errMsg  = (anthropicData?.error as Record<string, unknown>)?.message ?? JSON.stringify(anthropicData);
      return new Response(
        JSON.stringify({ error: `Anthropic ${anthropicRes.status} (${errType}): ${errMsg}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const content = anthropicData?.content as Array<{ type: string; text: string }>;
    if (content && content[0] && content[0].text) {
      return new Response(
        JSON.stringify({ description: content[0].text.trim() }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Unexpected Anthropic response shape', raw: raw.slice(0, 300) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Edge Function exception: ${String(err)}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
