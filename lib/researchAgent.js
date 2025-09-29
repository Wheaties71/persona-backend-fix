// lib/researchAgent.js - Vercel Serverless Compatible
import axios from 'axios';

/**
 * Conduct comprehensive research using Perplexity API
 */
export async function conductResearch(caseType, keywords, targetDescription) {
  if (!process.env.PERPLEXITY_API_KEY) {
    console.warn('Perplexity API key not configured, skipping research');
    return { error: 'Research API not configured' };
  }

  try {
    console.log(`Starting research for case type: ${caseType}`);

    const research = await Promise.all([
      researchDemographics(caseType, targetDescription),
      researchSocialInsights(keywords),
      researchLegalTrends(caseType),
      researchConsumerBehavior(caseType, keywords)
    ]);

    const combinedResearch = {
      demographics: research[0],
      social_insights: research[1],
      legal_trends: research[2],
      consumer_behavior: research[3],
      research_timestamp: new Date().toISOString(),
      case_type: caseType,
      keywords
    };

    return combinedResearch;

  } catch (error) {
    console.error('Research failed:', error);
    return { error: error.message, partial_data: null };
  }
}

/**
 * Research demographic patterns and statistics
 */
async function researchDemographics(caseType, targetDescription) {
  const prompt = `Research demographic data and statistics for legal cases involving ${caseType}. 

Target audience: ${targetDescription}

Find specific data on:
1. Age demographics most affected
2. Income levels and socioeconomic patterns
3. Geographic distribution
4. Gender patterns if relevant
5. Education levels
6. Employment status patterns

Provide structured JSON with sources:
{
  "age_demographics": {"pattern": "description", "source": "URL"},
  "income_patterns": {"pattern": "description", "source": "URL"},
  "geographic_data": {"pattern": "description", "source": "URL"},
  "education_levels": {"pattern": "description", "source": "URL"},
  "key_statistics": [{"stat": "description", "source": "URL"}],
  "research_quality": "high|medium|low",
  "limitations": ["any data gaps or limitations"]
}

Only include factual, cited information from authoritative sources.`;

  return await makePerplexityRequest(prompt, 'demographics');
}

/**
 * Research social media insights and consumer sentiment
 */
async function researchSocialInsights(keywords) {
  const prompt = `Search recent discussions on Reddit, X (Twitter), Facebook about: ${keywords}

Focus on authentic consumer experiences and sentiment:
1. Common pain points and frustrations
2. Objections or skepticism toward legal action
3. Emotional language patterns
4. Trust factors and credibility concerns
5. Communication preferences
6. Past experiences with similar legal issues

Output structured JSON with sources:
{
  "pain_points": [{"point": "description", "frequency": "high|medium|low", "source": "platform"}],
  "objections": [{"objection": "description", "frequency": "high|medium|low", "source": "platform"}],
  "emotional_tone": [{"emotion": "angry|frustrated|hopeful|etc", "context": "description"}],
  "trust_factors": [{"factor": "what builds credibility", "importance": "high|medium|low"}],
  "communication_preferences": [{"channel": "phone|email|text", "preference_level": "high|medium|low"}],
  "example_quotes": [{"quote": "actual quote", "platform": "source", "context": "situation"}],
  "research_timestamp": "${new Date().toISOString()}"
}

Only include real, verifiable social media insights with proper attribution.`;

  return await makePerplexityRequest(prompt, 'social_insights');
}

/**
 * Research current legal trends and case outcomes
 */
async function researchLegalTrends(caseType) {
  const prompt = `Research current legal trends and statistics for ${caseType} cases:

Find data on:
1. Recent settlement amounts and patterns
2. Success rates and case outcomes
3. Typical case timelines
4. Common legal challenges
5. Recent regulatory changes
6. Industry response patterns

Provide structured JSON:
{
  "settlement_patterns": {"range": "description", "trends": "description", "source": "URL"},
  "success_rates": {"rate": "percentage", "timeframe": "description", "source": "URL"},
  "case_timelines": {"average": "duration", "factors": "description", "source": "URL"},
  "legal_challenges": [{"challenge": "description", "frequency": "high|medium|low"}],
  "recent_developments": [{"development": "description", "date": "YYYY-MM", "source": "URL"}],
  "data_reliability": "high|medium|low"
}

Focus on authoritative legal sources and recent data only.`;

  return await makePerplexityRequest(prompt, 'legal_trends');
}

/**
 * Research consumer behavior patterns
 */
async function researchConsumerBehavior(caseType, keywords) {
  const prompt = `Research consumer behavior patterns related to ${caseType} and ${keywords}:

Investigate:
1. Decision-making factors for legal action
2. Information-seeking behavior
3. Preferred communication channels
4. Timing of legal consultations
5. Barriers to taking legal action
6. Trust-building factors

Output JSON:
{
  "decision_factors": [{"factor": "description", "importance": "high|medium|low", "source": "study/survey"}],
  "information_seeking": {"primary_channels": [], "timing": "description", "sources": []},
  "communication_preferences": {"preferred_initial_contact": "method", "follow_up_preferences": []},
  "timing_patterns": {"typical_delay": "timeframe", "peak_contact_times": []},
  "barriers": [{"barrier": "description", "frequency": "high|medium|low", "solutions": []}],
  "trust_builders": [{"factor": "description", "effectiveness": "high|medium|low"}],
  "research_methodology": "description of how data was gathered"
}

Only include research from credible consumer behavior studies and surveys.`;

  return await makePerplexityRequest(prompt, 'consumer_behavior');
}

/**
 * Make request to Perplexity API with error handling
 */
async function makePerplexityRequest(prompt, requestType) {
  try {
    const response = await axios.post('https://api.perplexity.ai/chat/completions', {
      model: 'sonar-pro',
      messages: [
        {
          role: 'system',
          content: 'You are a research analyst providing factual, cited information for legal marketing strategy. Only provide information that can be verified from authoritative sources. Include proper citations and source URLs.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    const content = response.data.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('Empty response from Perplexity API');
    }

    // Try to parse JSON response
    try {
      const parsedData = JSON.parse(content);
      parsedData._raw_response = content;
      parsedData._request_type = requestType;
      return parsedData;
    } catch (parseError) {
      console.warn(`Could not parse JSON for ${requestType}, returning raw text`);
      return {
        _raw_response: content,
        _request_type: requestType,
        _parse_error: parseError.message,
        error: 'Could not parse structured response'
      };
    }

  } catch (error) {
    console.error(`Perplexity API request failed for ${requestType}:`, error);
    
    if (error.response) {
      throw new Error(`Perplexity API error: ${error.response.status} - ${error.response.data?.error || 'Unknown error'}`);
    } else if (error.request) {
      throw new Error('Perplexity API request timeout or network error');
    } else {
      throw new Error(`Research request failed: ${error.message}`);
    }
  }
}
