// lib/personaEnrichmentAgent.js - Persona Enrichment with Social and Research Data
import Anthropic from '@anthropic-ai/sdk';

/**
 * Enrich existing personas with social media presence, professional background,
 * interests, affiliations, and communication preferences using AI research
 */
export default class PersonaEnrichmentAgent {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }

  /**
   * Enrich multiple personas with social and research data
   */
  async enrichPersonas(personas, contextData = {}) {
    console.log(`🎯 Starting enrichment for ${personas.length} personas`);

    const enrichedPersonas = [];

    for (let i = 0; i < personas.length; i++) {
      const persona = personas[i];

      try {
        console.log(`🔍 Enriching persona ${i + 1}/${personas.length}: ${persona.name}`);

        const enrichedPersona = await this.enrichSinglePersona(persona, contextData);
        enrichedPersonas.push(enrichedPersona);

        // Small delay to prevent rate limiting
        if (i < personas.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.error(`❌ Failed to enrich persona ${persona.name}:`, error);

        // Add persona with error status
        enrichedPersonas.push({
          ...persona,
          enrichment: {
            status: 'failed',
            error: error.message,
            enriched_at: new Date().toISOString()
          }
        });
      }
    }

    console.log(`✅ Completed enrichment for ${enrichedPersonas.length} personas`);
    return enrichedPersonas;
  }

  /**
   * Enrich a single persona with AI-powered research
   */
  async enrichSinglePersona(persona, contextData) {
    const enrichmentPrompt = this.buildEnrichmentPrompt(persona, contextData);

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: enrichmentPrompt
        }]
      });

      const enrichmentData = this.parseEnrichmentResponse(response.content[0].text);

      return {
        ...persona,
        ...enrichmentData.enrichedFields,
        enrichment: {
          status: 'enriched',
          sources: ['ai_research', 'social_analysis', 'professional_lookup'],
          confidence_score: enrichmentData.confidence,
          enriched_fields: enrichmentData.fieldsEnriched,
          enriched_at: new Date().toISOString(),
          research_insights: enrichmentData.insights
        }
      };

    } catch (error) {
      throw new Error(`AI enrichment failed: ${error.message}`);
    }
  }

  /**
   * Build the enrichment prompt for Claude
   */
  buildEnrichmentPrompt(persona, contextData) {
    const { matter, keywords, target_description, documents, research } = contextData;

    return `You are a persona enrichment specialist. Your task is to enrich the following persona with realistic social media presence, professional background, interests, affiliations, and communication preferences.

ORIGINAL PERSONA:
Name: ${persona.name}
Age: ${persona.age || 'Unknown'}
Location: ${persona.location || 'Unknown'}
Occupation: ${persona.occupation || 'Unknown'}
Education: ${persona.education || 'Unknown'}
Income: ${persona.income || 'Unknown'}
Interests: ${Array.isArray(persona.interests) ? persona.interests.join(', ') : persona.interests || 'Unknown'}
Bio: ${persona.bio || 'None provided'}
Existing traits: ${JSON.stringify(persona, null, 2)}

LEGAL CAMPAIGN CONTEXT:
Matter: ${matter || 'General legal services'}
Keywords: ${keywords || 'legal assistance'}
Target Description: ${target_description || 'General population'}

ENRICHMENT REQUIREMENTS:
Based on the persona's basic information and the legal campaign context, enrich this persona with:

1. SOCIAL MEDIA PRESENCE:
   - Which platforms they likely use (Facebook, LinkedIn, Twitter, Instagram, TikTok, etc.)
   - Frequency of use and engagement style
   - Topics they typically post/share about
   - Privacy settings preferences

2. PROFESSIONAL BACKGROUND:
   - Industry experience and career trajectory
   - Professional associations or unions
   - Work-related challenges and goals
   - Leadership roles or team positions

3. INTERESTS & AFFILIATIONS:
   - Hobbies and recreational activities
   - Community involvement (volunteer work, local organizations)
   - Political leanings (if relevant to legal matter)
   - Religious or cultural affiliations
   - Consumer preferences and brand loyalties

4. COMMUNICATION PREFERENCES:
   - Preferred communication channels (email, phone, text, social media)
   - Response time expectations
   - Formality level preference
   - Trust-building factors
   - Information consumption habits (news sources, research methods)

5. LEGAL-SPECIFIC INSIGHTS:
   - Likely legal concerns or experiences
   - Attitude toward legal system and lawyers
   - Decision-making process for legal services
   - Barriers to seeking legal help
   - Preferred legal service features

RESPONSE FORMAT:
Return a JSON object with this structure:
{
  "enrichedFields": {
    "social_media_profiles": {
      "facebook": {"active": true/false, "frequency": "daily/weekly/monthly", "topics": ["topic1", "topic2"]},
      "linkedin": {"active": true/false, "frequency": "daily/weekly/monthly", "usage": "professional networking"},
      "other_platforms": ["platform1", "platform2"]
    },
    "professional_details": {
      "industry_experience": "description",
      "career_level": "entry/mid/senior/executive",
      "associations": ["association1", "association2"],
      "work_challenges": ["challenge1", "challenge2"]
    },
    "expanded_interests": ["interest1", "interest2", "interest3"],
    "community_involvement": ["organization1", "organization2"],
    "communication_style": {
      "preferred_channels": ["email", "phone", "text"],
      "formality_level": "casual/professional/formal",
      "response_time_expectation": "immediate/within hours/within days",
      "trust_factors": ["factor1", "factor2"]
    },
    "legal_profile": {
      "previous_legal_experience": "description",
      "legal_service_preferences": ["preference1", "preference2"],
      "decision_factors": ["factor1", "factor2"],
      "barriers_to_legal_help": ["barrier1", "barrier2"]
    }
  },
  "confidence": 0.85,
  "fieldsEnriched": ["social_media", "professional", "interests", "communication", "legal"],
  "insights": [
    "Key insight about this persona's likely behavior",
    "Important consideration for legal marketing to this persona"
  ]
}

Make the enrichment realistic and consistent with the persona's demographic profile. Consider how their age, location, occupation, and education level would influence their digital behavior, professional life, and legal service preferences.

Base the enrichment on realistic patterns for someone of their profile, but make it specific and actionable for legal marketing purposes.`;
  }

  /**
   * Parse the AI response and extract enrichment data
   */
  parseEnrichmentResponse(responseText) {
    try {
      // Extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const parsedData = JSON.parse(jsonMatch[0]);

      // Validate the response structure
      if (!parsedData.enrichedFields || !parsedData.confidence) {
        throw new Error('Invalid enrichment response structure');
      }

      return {
        enrichedFields: parsedData.enrichedFields,
        confidence: Math.min(Math.max(parsedData.confidence, 0), 1), // Clamp between 0-1
        fieldsEnriched: parsedData.fieldsEnriched || [],
        insights: parsedData.insights || []
      };

    } catch (error) {
      console.error('Failed to parse enrichment response:', error);

      // Return fallback enrichment
      return {
        enrichedFields: {
          social_media_profiles: { facebook: { active: true, frequency: 'weekly' } },
          communication_style: { preferred_channels: ['email'], formality_level: 'professional' }
        },
        confidence: 0.3,
        fieldsEnriched: ['basic_fallback'],
        insights: ['Enrichment failed, using basic fallback data']
      };
    }
  }

  /**
   * Generate social media research for a persona
   */
  async generateSocialResearch(persona, platforms = ['facebook', 'linkedin', 'instagram']) {
    console.log(`📱 Generating social media research for ${persona.name}`);

    const socialPrompt = `Based on this persona profile, generate realistic social media behavior patterns:

Persona: ${persona.name}, ${persona.age} years old, ${persona.occupation} in ${persona.location}

For each platform (${platforms.join(', ')}), provide:
1. Likelihood of being active (0-100%)
2. Posting frequency
3. Types of content they share/engage with
4. Privacy settings preferences
5. Influence level (follower count estimates)

Format as JSON with detailed explanations.`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1500,
        messages: [{ role: 'user', content: socialPrompt }]
      });

      return response.content[0].text;
    } catch (error) {
      console.error('Social research generation failed:', error);
      return 'Social research unavailable';
    }
  }

  /**
   * Batch enrichment with progress tracking
   */
  async enrichPersonasWithProgress(personas, contextData, progressCallback) {
    const results = [];
    const total = personas.length;

    for (let i = 0; i < total; i++) {
      const persona = personas[i];

      try {
        if (progressCallback) {
          progressCallback({
            current: i + 1,
            total: total,
            persona: persona.name,
            status: 'enriching'
          });
        }

        const enriched = await this.enrichSinglePersona(persona, contextData);
        results.push(enriched);

        if (progressCallback) {
          progressCallback({
            current: i + 1,
            total: total,
            persona: persona.name,
            status: 'completed'
          });
        }

      } catch (error) {
        console.error(`Enrichment failed for ${persona.name}:`, error);

        results.push({
          ...persona,
          enrichment: {
            status: 'failed',
            error: error.message,
            enriched_at: new Date().toISOString()
          }
        });

        if (progressCallback) {
          progressCallback({
            current: i + 1,
            total: total,
            persona: persona.name,
            status: 'failed',
            error: error.message
          });
        }
      }

      // Rate limiting delay
      if (i < total - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    return results;
  }
}