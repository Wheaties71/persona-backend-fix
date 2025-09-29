// ========================
// api/chat-persona.js (Updated for Multi-AI)
// ========================
import Anthropic from '@anthropic-ai/sdk';
import { getPersonaByName } from '../lib/sheetsService.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
    maxDuration: 60,
  },
};

export default async function handler(req, res) {
  console.log('💬 Multi-AI Persona Chat API called - Method:', req.method);
  
  // Add CORS headers
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
    const { persona_name, message, persona_attributes } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log('💬 Chat request received');

    // Initialize Claude
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('Anthropic API key not configured');
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    let persona = null;
    let chatType = '';

    // Handle existing persona from Google Sheets
    if (persona_name && persona_name.trim()) {
      console.log(`🔍 Looking up persona: ${persona_name}`);
      try {
        persona = await getPersonaByName(persona_name.trim());
        chatType = 'existing_persona';
      } catch (error) {
        console.warn(`Persona lookup failed: ${error.message}`);
      }
    }

    // Handle custom persona attributes
    if (!persona && persona_attributes && persona_attributes.trim()) {
      console.log('🛠️ Using custom persona attributes');
      persona = await generateQuickPersona(persona_attributes.trim());
      chatType = 'custom_persona';
    }

    // If no persona found, create a generic one
    if (!persona) {
      console.log('⚡ Creating generic persona');
      persona = {
        name: 'AI Assistant',
        bio: 'A helpful AI assistant ready to discuss legal matters',
        communication_style: 'Professional and empathetic',
        case_type: 'General Legal',
        motivations: ['Getting helpful information'],
        barriers: ['Uncertainty about legal processes'],
        example_quote: 'I want to understand my options.'
      };
      chatType = 'generic_persona';
    }

    console.log(`🎭 Chatting with persona: ${persona.name}`);

    // Build system prompt for persona consistency
    const systemPrompt = buildPersonaSystemPrompt(persona);

    // Generate response with Claude
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        { role: 'user', content: message.trim() }
      ]
    });

    const personaResponse = response.content[0].text;

    console.log('✅ Chat response generated');

    return res.status(200).json({
      success: true,
      persona_name: persona.name,
      persona_response: personaResponse,
      timestamp: new Date().toISOString(),
      chat_type: chatType,
      conversation_id: `${persona.name}_${Date.now()}` // For future conversation tracking
    });

  } catch (error) {
    console.error('💥 Chat error:', error.message);
    
    // Return a graceful error response
    return res.status(500).json({ 
      success: false,
      error: 'Chat temporarily unavailable',
      message: 'I apologize, but I\'m having trouble responding right now. Please try again in a moment.',
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Build system prompt for persona consistency
 */
function buildPersonaSystemPrompt(persona) {
  const motivations = Array.isArray(persona.motivations) 
    ? persona.motivations.join(', ') 
    : persona.motivations;
  
  const barriers = Array.isArray(persona.barriers) 
    ? persona.barriers.join(', ') 
    : persona.barriers;

  return `You are ${persona.name}.

BACKGROUND: ${persona.bio}

YOUR CHARACTERISTICS:
- Motivations: ${motivations}
- Main Concerns: ${barriers}
- Communication Style: ${persona.communication_style}
- Case Type: ${persona.case_type}

CRITICAL INSTRUCTIONS:
1. Stay completely in character as ${persona.name} throughout the conversation
2. Respond authentically based on your background and concerns
3. Use your specified communication style consistently
4. Remember you are someone who might need legal help
5. Respond as a real person would, not as an AI assistant
6. Keep responses conversational and natural, typically 1-3 sentences
7. Show emotion and personality that matches your character

${persona.example_quote ? `Example of how you speak: "${persona.example_quote}"` : ''}

Never break character or mention that you are an AI. You are ${persona.name}, and this is a real conversation.`;
}

/**
 * Generate a quick persona from description
 */
async function generateQuickPersona(description) {
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    const prompt = `Create a realistic persona for chat based on this description: ${description}

Return ONLY JSON:
{
  "name": "realistic first name",
  "bio": "brief realistic background",
  "communication_style": "how they naturally communicate",
  "motivations": ["why they might seek legal help"],
  "barriers": ["main concerns"],
  "case_type": "type of legal issue",
  "example_quote": "something they might say"
}`;

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 800,
      temperature: 0.6,
      messages: [{ role: 'user', content: prompt }]
    });

    const jsonMatch = response.content[0].text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not generate quick persona');
    }

    return JSON.parse(jsonMatch[0]);

  } catch (error) {
    console.error('Quick persona generation failed:', error);
    
    // Return fallback persona
    return {
      name: 'Alex',
      bio: description,
      communication_style: 'Direct and practical',
      motivations: ['Getting help with legal issue'],
      barriers: ['Cost concerns', 'Process complexity'],
      case_type: 'General Legal',
      example_quote: 'I need to understand my options.'
    };
  }
}
