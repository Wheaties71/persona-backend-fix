// lib/personaAgent.js - Vercel Serverless Compatible
import Anthropic from '@anthropic-ai/sdk';

/**
 * Generate personas using Claude with RAG-based approach
 */
export async function generatePersonas(campaignData, uploadedData, researchData, personaCount = 10) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key not configured');
  }

  try {
    console.log(`Generating ${personaCount} personas for ${campaignData.matter}`);

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    // Build context from uploaded files and research
    const sourceContext = buildSourceContext(uploadedData, researchData);

    // Validate we have sufficient data
    const validation = validateDataSufficiency(sourceContext);
    if (!validation.sufficient) {
      throw new Error(`Insufficient data for persona generation: ${validation.missing.join(', ')}`);
    }

    // Create the persona generation prompt
    const prompt = buildPersonaPrompt(campaignData, sourceContext, personaCount);

    // Generate personas using Claude
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    // Parse and validate the response
    const personas = parsePersonaResponse(response.content[0].text);
    
    // Add source citations to each persona
    const citedPersonas = addSourceCitations(personas, sourceContext);

    // Final validation
    const validatedPersonas = validatePersonas(citedPersonas);

    console.log(`Successfully generated ${validatedPersonas.length} validated personas`);
    
    return {
      personas: validatedPersonas,
      sources_used: extractSourceSummary(sourceContext),
      validation: validation,
      generation_timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Persona generation failed:', error);
    throw error;
  }
}

/**
 * Build source context from uploaded data and research
 */
function buildSourceContext(uploadedData, researchData) {
  const context = {
    demographic_data: [],
    case_data: [],
    social_insights: [],
    consumer_behavior: [],
    client_data: [],
    total_sources: 0
  };

  // Process uploaded data
  if (uploadedData) {
    if (uploadedData.mri_data) {
      context.demographic_data.push({
        content: JSON.stringify(uploadedData.mri_data.summary || uploadedData.mri_data),
        metadata: { source: 'mri_file', type: 'demographic' }
      });
    }
    
    if (uploadedData.targetsmart_data) {
      context.demographic_data.push({
        content: JSON.stringify(uploadedData.targetsmart_data.summary || uploadedData.targetsmart_data),
        metadata: { source: 'targetsmart_file', type: 'demographic' }
      });
    }
    
    if (uploadedData.client_data) {
      context.client_data.push({
        content: JSON.stringify(uploadedData.client_data.summary || uploadedData.client_data),
        metadata: { source: 'client_file', type: 'client' }
      });
    }
  }

  // Process research data
  if (researchData) {
    if (researchData.demographics) {
      context.demographic_data.push({
        content: JSON.stringify(researchData.demographics),
        metadata: { source: 'perplexity_research', type: 'demographic' }
      });
    }
    
    if (researchData.social_insights) {
      context.social_insights.push({
        content: JSON.stringify(researchData.social_insights),
        metadata: { source: 'perplexity_research', type: 'social' }
      });
    }
    
    if (researchData.consumer_behavior) {
      context.consumer_behavior.push({
        content: JSON.stringify(researchData.consumer_behavior),
        metadata: { source: 'perplexity_research', type: 'behavior' }
      });
    }
  }

  // Calculate total sources
  context.total_sources = Object.values(context)
    .filter(val => Array.isArray(val))
    .reduce((sum, arr) => sum + arr.length, 0);

  return context;
}

/**
 * Validate data sufficiency for persona generation
 */
function validateDataSufficiency(sourceContext) {
  const validation = {
    sufficient: false,
    missing: [],
    available: [],
    confidence: 0
  };

  const categories = ['demographic_data', 'social_insights', 'consumer_behavior'];
  let availableCount = 0;

  categories.forEach(category => {
    if (sourceContext[category] && sourceContext[category].length > 0) {
      availableCount++;
      validation.available.push(category);
    } else {
      validation.missing.push(category);
    }
  });

  validation.confidence = (availableCount / categories.length) * 100;
  validation.sufficient = availableCount >= 1; // Require at least 1 data category

  return validation;
}

/**
 * Build comprehensive persona generation prompt
 */
function buildPersonaPrompt(campaignData, sourceContext, personaCount) {
  const sourceData = formatSourceContext(sourceContext);

  return `You are an expert at creating realistic consumer personas for legal advertising campaigns based ONLY on provided data sources.

CRITICAL REQUIREMENTS:
- Generate EXACTLY ${personaCount} distinct personas
- Base ALL persona traits on the provided source data below
- Include specific citations for each trait using [Source: source_name]
- Do NOT create any traits not found in the source data
- If insufficient data exists for a trait, omit it rather than fabricate it

CAMPAIGN DETAILS:
- Case Type: ${campaignData.matter}
- Target Audience: ${campaignData.target_description}
- Keywords: ${campaignData.keywords}

SOURCE DATA AVAILABLE:
${sourceData}

PERSONA REQUIREMENTS:
Each persona must be a complete, realistic individual with traits traceable to the source data above.

REQUIRED JSON STRUCTURE - return ONLY valid JSON array:
[
  {
    "name": "realistic name appropriate for demographics",
    "age": number_from_source_data,
    "gender": "from_demographic_data",
    "location": "City, State from geographic data",
    "bio": "background based on source patterns with [Source: X] citations",
    "motivations": ["array of motivations from source data"],
    "barriers": ["array of barriers from source data"],
    "personality": {
      "openness": "very_low|low|moderate|high|very_high",
      "conscientiousness": "very_low|low|moderate|high|very_high", 
      "extraversion": "very_low|low|moderate|high|very_high",
      "agreeableness": "very_low|low|moderate|high|very_high",
      "neuroticism": "very_low|low|moderate|high|very_high"
    },
    "communication_style": "style based on source insights",
    "example_quote": "quote reflecting this person's authentic voice",
    "data_sources": ["list of source files/categories used for this persona"],
    "confidence_score": number_0_to_100_based_on_source_data_quality
  }
]

Generate ${personaCount} evidence-based personas now:`;
}

/**
 * Format source context for prompt inclusion
 */
function formatSourceContext(sourceContext) {
  let formatted = '';

  if (sourceContext.demographic_data && sourceContext.demographic_data.length > 0) {
    formatted += '\nDEMOGRAPHIC DATA:\n';
    sourceContext.demographic_data.forEach((item, index) => {
      formatted += `[${item.metadata.source}] ${item.content.substring(0, 300)}...\n`;
    });
  }

  if (sourceContext.social_insights && sourceContext.social_insights.length > 0) {
    formatted += '\nSOCIAL INSIGHTS:\n';
    sourceContext.social_insights.forEach((item, index) => {
      formatted += `[${item.metadata.source}] ${item.content.substring(0, 300)}...\n`;
    });
  }

  if (sourceContext.consumer_behavior && sourceContext.consumer_behavior.length > 0) {
    formatted += '\nCONSUMER BEHAVIOR DATA:\n';
    sourceContext.consumer_behavior.forEach((item, index) => {
      formatted += `[${item.metadata.source}] ${item.content.substring(0, 300)}...\n`;
    });
  }

  if (sourceContext.client_data && sourceContext.client_data.length > 0) {
    formatted += '\nCLIENT DATA:\n';
    sourceContext.client_data.forEach((item, index) => {
      formatted += `[${item.metadata.source}] ${item.content.substring(0, 300)}...\n`;
    });
  }

  return formatted || 'No specific source data available - generation may be limited.';
}

/**
 * Parse Claude's response and extract personas
 */
function parsePersonaResponse(responseText) {
  try {
    // Clean the response text
    let cleanText = responseText.trim();
    
    // Extract JSON array from response
    const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in Claude response');
    }

    const personas = JSON.parse(jsonMatch[0]);
    
    if (!Array.isArray(personas)) {
      throw new Error('Response is not an array of personas');
    }

    return personas;

  } catch (error) {
    console.error('Failed to parse persona response:', error);
    throw new Error(`Persona parsing failed: ${error.message}`);
  }
}

/**
 * Add source citations to personas
 */
function addSourceCitations(personas, sourceContext) {
  return personas.map(persona => {
    persona.source_citations = {
      primary_sources: persona.data_sources || [],
      data_categories: Object.keys(sourceContext).filter(key => 
        sourceContext[key] && Array.isArray(sourceContext[key]) && sourceContext[key].length > 0
      ),
      confidence_factors: {
        source_diversity: persona.data_sources ? persona.data_sources.length : 0,
        data_points: sourceContext.total_sources,
        citation_coverage: persona.data_sources ? 'cited' : 'limited'
      }
    };

    return persona;
  });
}

/**
 * Validate generated personas
 */
function validatePersonas(personas) {
  const validated = [];
  const requiredFields = ['name', 'age', 'bio', 'motivations', 'barriers', 'communication_style'];

  personas.forEach((persona, index) => {
    const validation = {
      complete: true,
      missing_fields: [],
      quality_score: 0
    };

    // Check required fields
    requiredFields.forEach(field => {
      if (!persona[field] || (Array.isArray(persona[field]) && persona[field].length === 0)) {
        validation.complete = false;
        validation.missing_fields.push(field);
      }
    });

    // Calculate quality score
    let qualityScore = 0;
    if (persona.source_citations && persona.source_citations.primary_sources.length > 0) {
      qualityScore += 30;
    }
    if (persona.confidence_score && persona.confidence_score > 70) {
      qualityScore += 25;
    }
    if (validation.complete) {
      qualityScore += 25;
    }
    if (persona.bio && persona.bio.length > 100) {
      qualityScore += 20;
    }

    validation.quality_score = qualityScore;

    // Only include personas that meet minimum quality standards
    if (validation.complete && validation.quality_score >= 50) {
      persona.validation = validation;
      validated.push(persona);
    } else {
      console.warn(`Persona ${index + 1} failed validation:`, validation);
    }
  });

  return validated;
}

/**
 * Extract summary of sources used
 */
function extractSourceSummary(sourceContext) {
  const summary = {
    total_documents: sourceContext.total_sources,
    categories: {},
    quality_indicators: []
  };

  Object.entries(sourceContext).forEach(([category, data]) => {
    if (Array.isArray(data) && data.length > 0) {
      summary.categories[category] = {
        document_count: data.length,
        sources: [...new Set(data.map(item => item.metadata.source))]
      };
    }
  });

  // Quality indicators
  if (summary.total_documents >= 3) {
    summary.quality_indicators.push('Sufficient data volume');
  }
  if (Object.keys(summary.categories).length >= 2) {
    summary.quality_indicators.push('Diverse data sources');
  }

  return summary;
}

/**
 * Enrich existing personas with additional document insights and research data
 */
export async function enrichPersonas(existingPersonas, campaignData, uploadedData, researchData) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key not configured');
  }

  try {
    console.log(`Enriching ${existingPersonas.length} existing personas with document insights`);

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    // Build context from uploaded files and research
    const sourceContext = buildSourceContext(uploadedData, researchData);

    const enrichedPersonas = [];

    for (let i = 0; i < existingPersonas.length; i++) {
      const persona = existingPersonas[i];

      try {
        console.log(`Enriching persona ${i + 1}/${existingPersonas.length}: ${persona.name}`);

        // Create enrichment prompt for this specific persona
        const enrichmentPrompt = buildPersonaEnrichmentPrompt(persona, campaignData, sourceContext);

        // Get AI enrichment
        const response = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 2000,
          temperature: 0.2,
          messages: [{
            role: 'user',
            content: enrichmentPrompt
          }]
        });

        // Parse enrichment response
        const enrichmentData = parseEnrichmentResponse(response.content[0].text);

        // Merge enrichment with original persona
        const enrichedPersona = {
          ...persona,
          ...enrichmentData.additions,
          document_insights: enrichmentData.insights,
          legal_profile: enrichmentData.legal_profile,
          enrichment_metadata: {
            enriched_by: 'persona_agent',
            enriched_at: new Date().toISOString(),
            source_data_points: sourceContext.total_sources,
            confidence_improvement: enrichmentData.confidence_delta,
            original_source: persona.source || 'julius_sheet'
          }
        };

        enrichedPersonas.push(enrichedPersona);

        // Small delay to prevent rate limiting
        if (i < existingPersonas.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.error(`Failed to enrich persona ${persona.name}:`, error);

        // Add persona with enrichment error status
        enrichedPersonas.push({
          ...persona,
          enrichment_metadata: {
            enriched_by: 'persona_agent',
            enriched_at: new Date().toISOString(),
            enrichment_error: error.message,
            original_source: persona.source || 'julius_sheet'
          }
        });
      }
    }

    console.log(`✅ Completed persona enrichment: ${enrichedPersonas.length} personas processed`);

    return {
      personas: enrichedPersonas,
      sourceDataCount: sourceContext.total_sources,
      confidence: calculateAverageConfidence(enrichedPersonas),
      hasMediaInsights: sourceContext.media_insights?.length > 0
    };

  } catch (error) {
    console.error('Persona enrichment failed:', error);
    throw error;
  }
}

/**
 * Build enrichment prompt for existing persona
 */
function buildPersonaEnrichmentPrompt(persona, campaignData, sourceContext) {
  return `You are a legal marketing persona enrichment specialist. Your task is to enhance an existing persona with insights from legal documents and research data, specifically for the legal campaign context.

EXISTING PERSONA:
Name: ${persona.name}
Age: ${persona.age || 'Unknown'}
Location: ${persona.location || 'Unknown'}
Occupation: ${persona.occupation || 'Unknown'}
Education: ${persona.education || 'Unknown'}
Bio: ${persona.bio || 'None provided'}
Interests: ${Array.isArray(persona.interests) ? persona.interests.join(', ') : persona.interests || 'Unknown'}
Current traits: ${JSON.stringify(persona, null, 2)}

LEGAL CAMPAIGN CONTEXT:
Matter: ${campaignData.matter}
Keywords: ${campaignData.keywords}
Target Description: ${campaignData.target_description}

AVAILABLE DATA FOR ENRICHMENT:
${buildSourceContextSummary(sourceContext)}

ENRICHMENT OBJECTIVES:
1. Add legal-specific motivations and barriers based on the document analysis
2. Enhance communication preferences with legal service context
3. Add case-specific concerns and decision factors
4. Include document-derived insights about legal service preferences
5. Update persona with campaign-relevant behavioral patterns

RESPONSE FORMAT - Return ONLY valid JSON:
{
  "additions": {
    "legal_motivations": ["motivation1", "motivation2"],
    "legal_barriers": ["barrier1", "barrier2"],
    "case_specific_concerns": ["concern1", "concern2"],
    "preferred_legal_communication": "description of how they prefer to communicate with lawyers",
    "decision_timeline": "description of how quickly/slowly they make legal decisions",
    "trust_factors_legal": ["factor1", "factor2"]
  },
  "insights": [
    "Key insight from documents about this persona type",
    "Important legal service preference derived from research"
  ],
  "legal_profile": {
    "likely_legal_experience": "description",
    "service_preferences": ["preference1", "preference2"],
    "communication_style_legal": "formal/casual/consultative",
    "urgency_perception": "high/medium/low"
  },
  "confidence_delta": 0.15
}

Base the enrichment specifically on the provided legal documents and research. Make it actionable for legal marketing to this persona type. Keep the original persona intact and only ADD new legal-specific insights.`;
}

/**
 * Parse persona enrichment response
 */
function parseEnrichmentResponse(responseText) {
  try {
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in enrichment response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      additions: parsed.additions || {},
      insights: parsed.insights || [],
      legal_profile: parsed.legal_profile || {},
      confidence_delta: parsed.confidence_delta || 0
    };

  } catch (error) {
    console.error('Failed to parse enrichment response:', error);

    // Return fallback enrichment
    return {
      additions: {
        legal_motivations: ['seeking legal resolution'],
        legal_barriers: ['cost concerns', 'complexity fears']
      },
      insights: ['Enrichment parsing failed, using fallback data'],
      legal_profile: { likely_legal_experience: 'limited' },
      confidence_delta: 0
    };
  }
}

/**
 * Calculate average confidence across personas
 */
function calculateAverageConfidence(personas) {
  if (!personas.length) return 0;

  const confidenceScores = personas
    .map(p => p.confidence_score || 0)
    .filter(score => score > 0);

  if (!confidenceScores.length) return 0;

  return confidenceScores.reduce((sum, score) => sum + score, 0) / confidenceScores.length;
}

/**
 * Build summary of source context for prompts
 */
function buildSourceContextSummary(sourceContext) {
  let summary = `Total source documents: ${sourceContext.total_sources}\n\n`;

  Object.entries(sourceContext).forEach(([category, data]) => {
    if (Array.isArray(data) && data.length > 0 && category !== 'total_sources') {
      summary += `${category.toUpperCase()} (${data.length} items):\n`;
      data.slice(0, 3).forEach(item => {
        summary += `- ${item.content.substring(0, 150)}...\n`;
      });
      summary += '\n';
    }
  });

  return summary;
}
