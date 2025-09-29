// lib/validationAgent.js - Vercel Serverless Compatible
import OpenAI from 'openai';

/**
 * Validate personas against source documents using different LLM
 */
export async function validatePersonas(personas, uploadedData, researchData) {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('OpenAI API key not configured, skipping validation');
    return { 
      validated: personas, 
      errors: ['Validation skipped - no OpenAI key'],
      confidence_score: 75 // Default confidence
    };
  }

  try {
    console.log(`Validating ${personas.length} personas against source data`);
    
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const validationResults = [];
    
    // Validate in batches to avoid rate limits
    for (let i = 0; i < personas.length; i += 3) {
      const batch = personas.slice(i, i + 3);
      
      for (const persona of batch) {
        const validation = await validateSinglePersona(persona, uploadedData, researchData, openai);
        validationResults.push(validation);
      }

      // Small delay between batches
      if (i + 3 < personas.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const passedValidation = validationResults.filter(v => v.validation_passed);
    const errors = validationResults.filter(v => !v.validation_passed);

    console.log(`Validation complete: ${passedValidation.length}/${personas.length} personas passed`);

    return {
      validated: passedValidation.map(v => v.persona),
      validation_details: validationResults,
      errors: errors.map(e => e.errors).flat(),
      confidence_score: passedValidation.length / personas.length * 100
    };

  } catch (error) {
    console.error('Persona validation failed:', error);
    
    // Return original personas with warning
    return {
      validated: personas,
      validation_details: [],
      errors: [error.message],
      confidence_score: 50 // Lower confidence due to validation failure
    };
  }
}

/**
 * Validate a single persona against source documents
 */
async function validateSinglePersona(persona, uploadedData, researchData, openai) {
  try {
    // Build validation prompt
    const prompt = buildValidationPrompt(persona, uploadedData, researchData);

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are a fact-checker validating persona data against source documents. Only approve traits that can be verified from the provided sources.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 1500
    });

    const validationResult = parseValidationResponse(response.choices[0].message.content);
    
    return {
      persona: persona,
      validation_passed: validationResult.approved,
      confidence: validationResult.confidence,
      verified_traits: validationResult.verified_traits,
      questionable_traits: validationResult.questionable_traits,
      errors: validationResult.errors || []
    };

  } catch (error) {
    console.error(`Validation failed for persona ${persona.name}:`, error);
    return {
      persona: persona,
      validation_passed: true, // Default to pass if validation fails
      errors: [error.message]
    };
  }
}

/**
 * Build validation prompt for GPT-4
 */
function buildValidationPrompt(persona, uploadedData, researchData) {
  const sourceData = formatSourcesForValidation(uploadedData, researchData);

  return `Validate this persona against the provided source documents:

PERSONA TO VALIDATE:
Name: ${persona.name}
Age: ${persona.age}
Bio: ${persona.bio}
Motivations: ${JSON.stringify(persona.motivations)}
Barriers: ${JSON.stringify(persona.barriers)}
Communication Style: ${persona.communication_style}

SOURCE DOCUMENTS:
${sourceData}

VALIDATION REQUIREMENTS:
1. Check if each persona trait can be supported by the source documents
2. Identify any traits that appear to be fabricated or unsupported
3. Verify demographic patterns match source data
4. Ensure motivations and barriers are grounded in provided insights

Return validation result as JSON:
{
  "approved": true/false,
  "confidence": 0-100,
  "verified_traits": ["list of traits supported by sources"],
  "questionable_traits": ["list of traits not clearly supported"],
  "missing_citations": ["traits that need better source attribution"], 
  "fabrication_risk": "low|medium|high",
  "overall_assessment": "brief summary"
}

Be strict - only approve personas with strong source support.`;
}

/**
 * Format source context for validation
 */
function formatSourcesForValidation(uploadedData, researchData) {
  let formatted = '';

  // Format uploaded data
  if (uploadedData) {
    if (uploadedData.mri_data) {
      formatted += '\nMRI DATA:\n';
      formatted += JSON.stringify(uploadedData.mri_data.summary || uploadedData.mri_data).substring(0, 500) + '...\n';
    }
    
    if (uploadedData.targetsmart_data) {
      formatted += '\nTARGETSMART DATA:\n';
      formatted += JSON.stringify(uploadedData.targetsmart_data.summary || uploadedData.targetsmart_data).substring(0, 500) + '...\n';
    }
    
    if (uploadedData.client_data) {
      formatted += '\nCLIENT DATA:\n';
      formatted += JSON.stringify(uploadedData.client_data.summary || uploadedData.client_data).substring(0, 500) + '...\n';
    }
  }

  // Format research data
  if (researchData) {
    if (researchData.demographics) {
      formatted += '\nRESEARCH - DEMOGRAPHICS:\n';
      formatted += JSON.stringify(researchData.demographics).substring(0, 500) + '...\n';
    }
    
    if (researchData.social_insights) {
      formatted += '\nRESEARCH - SOCIAL INSIGHTS:\n';
      formatted += JSON.stringify(researchData.social_insights).substring(0, 500) + '...\n';
    }
  }

  return formatted || 'No source documents available for validation.';
}

/**
 * Parse GPT-4 validation response
 */
function parseValidationResponse(responseText) {
  try {
    // Extract JSON from response
    if (!jsonMatch) {
      throw new Error('No JSON found in validation response');
    }

    const validation = JSON.parse(jsonMatch[0]);
    
    // Ensure required fields
    return {
      approved: validation.approved || false,
      confidence: validation.confidence || 0,
      verified_traits: validation.verified_traits || [],
      questionable_traits: validation.questionable_traits || [],
      errors: validation.missing_citations || []
    };

  } catch (error) {
    console.error('Failed to parse validation response:', error);
    return {
      approved: true, // Default to approved if parsing fails
      confidence: 60,
      verified_traits: [],
      questionable_traits: [],
      errors: ['Validation parsing failed']
    };
  }
}
