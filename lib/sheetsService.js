// lib/sheetsService.js - Vercel Serverless Compatible
import { google } from 'googleapis';

/**
 * Store personas in Google Sheets
 */
export async function storePersonas(personas, campaignData) {
  try {
    const sheets = await initializeSheets();
    const timestamp = new Date().toISOString();
    const rows = [];

    // Prepare rows for each persona
    for (const persona of personas) {
      rows.push([
        persona.name,
        persona.age,
        `${persona.gender || 'N/A'}, ${persona.location || 'N/A'}`,
        persona.bio,
        Array.isArray(persona.motivations) ? persona.motivations.join('; ') : persona.motivations,
        Array.isArray(persona.barriers) ? persona.barriers.join('; ') : persona.barriers,
        persona.communication_style,
        persona.example_quote,
        timestamp,
        campaignData.matter,
        JSON.stringify(persona.personality || {}),
        'ready_for_testing',
        campaignData.session_id,
        persona.confidence_score || 0,
        JSON.stringify(persona.source_citations || {}),
        persona.validation?.quality_score || 0
      ]);
    }

    // Append to Google Sheets
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: 'Sheet1!A:P',
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: rows
      }
    });

    console.log(`Stored ${personas.length} personas in Google Sheets`);
    
    return {
      success: true,
      rows_added: rows.length,
      sheet_url: `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEETS_ID}`,
      updated_range: response.data.updates.updatedRange
    };

  } catch (error) {
    console.error('Failed to store personas in Google Sheets:', error);
    throw error;
  }
}

/**
 * Get persona by name from Google Sheets
 */
export async function getPersonaByName(name) {
  try {
    const sheets = await initializeSheets();
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: 'Sheet1!A:P'
    });

    const rows = response.data.values || [];
    
    if (rows.length <= 1) {
      throw new Error(`Persona not found: ${name}`);
    }

    // Find persona by name
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      
      if (row[0] && row[0].toLowerCase() === name.toLowerCase()) {
        return {
          name: row[0],
          age: parseInt(row[1]),
          demographics: row[2],
          bio: row[3],
          motivations: row[4] ? row[4].split('; ') : [],
          barriers: row[5] ? row[5].split('; ') : [],
          communication_style: row[6],
          example_quote: row[7],
          created_date: row[8],
          case_type: row[9],
          personality: safeJsonParse(row[10]),
          status: row[11],
          run_id: row[12],
          confidence_score: parseFloat(row[13]) || 0,
          source_citations: safeJsonParse(row[14]),
          validation_score: parseFloat(row[15]) || 0
        };
      }
    }

    throw new Error(`Persona not found: ${name}`);

  } catch (error) {
    console.error('Failed to get persona:', error);
    throw error;
  }
}

/**
 * Get all personas from Google Sheets
 */
export async function getAllPersonas() {
  try {
    const sheets = await initializeSheets();
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: 'Sheet1!A:P'
    });

    const rows = response.data.values || [];
    
    if (rows.length <= 1) {
      return [];
    }

    const personas = [];
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      
      try {
        const persona = {
          name: row[0],
          age: parseInt(row[1]),
          demographics: row[2],
          bio: row[3],
          motivations: row[4] ? row[4].split('; ') : [],
          barriers: row[5] ? row[5].split('; ') : [],
          communication_style: row[6],
          example_quote: row[7],
          created_date: row[8],
          case_type: row[9],
          personality: safeJsonParse(row[10]),
          status: row[11],
          run_id: row[12],
          confidence_score: parseFloat(row[13]) || 0,
          source_citations: safeJsonParse(row[14]),
          validation_score: parseFloat(row[15]) || 0
        };

        personas.push(persona);

      } catch (parseError) {
        console.warn(`Failed to parse persona row ${i + 1}:`, parseError);
      }
    }

    console.log(`Retrieved ${personas.length} personas from Google Sheets`);
    return personas;

  } catch (error) {
    console.error('Failed to get personas from Google Sheets:', error);
    throw error;
  }
}

/**
 * Initialize Google Sheets API
 */
async function initializeGoogleSheetsService() {
  try {
    // For Vercel, credentials should be in environment variables
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    
    return sheets;

  } catch (error) {
    console.error('Failed to initialize Google Sheets API:', error);
    throw error;
  }
}

/**
 * Fetch personas from external Google Sheets URL (Julius personas)
 */
export async function fetchPersonasFromExternalSheet(sheetUrl) {
  try {
    console.log(`Fetching personas from external sheet: ${sheetUrl}`);

    // Extract spreadsheet ID and gid from URL
    const { spreadsheetId, gid } = extractSheetInfo(sheetUrl);

    // Use Google Sheets API with service account authentication
    console.log(`Using Google Sheets service account for spreadsheet: ${spreadsheetId}`);
    const sheets = await initializeGoogleSheetsService();

    // Get sheet data using the spreadsheet ID
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: 'A:Z' // Get all columns
    });

    const rows = response.data.values;
    if (!rows || rows.length <= 1) {
      throw new Error('No persona data found in the sheet or only headers present');
    }

    console.log(`Successfully fetched ${rows.length} rows from Google Sheets service account`)

    // Parse header row to understand column structure
    const headers = rows[0].map(h => h.toLowerCase().trim());
    console.log('Found headers:', headers);

    const personas = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];

      try {
        const persona = parsePersonaFromRow(row, headers);
        if (persona && persona.name) {
          personas.push(persona);
        }
      } catch (parseError) {
        console.warn(`Failed to parse persona row ${i + 1}:`, parseError);
      }
    }

    console.log(`Retrieved ${personas.length} personas from external sheet`);
    return personas;

  } catch (error) {
    console.error('Failed to fetch personas from external sheet:', error);
    throw new Error(`Failed to access Julius personas sheet: ${error.message}`);
  }
}

/**
 * Extract spreadsheet ID and gid from Google Sheets URL
 */
export function extractSheetInfo(url) {
  try {
    // Extract spreadsheet ID from URL
    const spreadsheetMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!spreadsheetMatch) {
      throw new Error('Invalid Google Sheets URL format');
    }

    const spreadsheetId = spreadsheetMatch[1];

    // Extract gid if present
    const gidMatch = url.match(/[#&]gid=([0-9]+)/);
    const gid = gidMatch ? gidMatch[1] : null;

    return { spreadsheetId, gid };
  } catch (error) {
    throw new Error(`Failed to parse Google Sheets URL: ${error.message}`);
  }
}

/**
 * Validate imported personas data quality and completeness
 */
export function validatePersonas(personas) {
  const validation = {
    valid: [],
    warnings: [],
    errors: [],
    summary: {
      total_imported: personas.length,
      valid_personas: 0,
      personas_with_warnings: 0,
      invalid_personas: 0
    }
  };

  for (let i = 0; i < personas.length; i++) {
    const persona = personas[i];
    const personaValidation = validateSinglePersona(persona, i + 1);

    if (personaValidation.isValid) {
      validation.valid.push(persona);
      validation.summary.valid_personas++;

      if (personaValidation.warnings.length > 0) {
        validation.warnings.push({
          persona_name: persona.name,
          row: i + 1,
          warnings: personaValidation.warnings
        });
        validation.summary.personas_with_warnings++;
      }
    } else {
      validation.errors.push({
        persona_name: persona.name || `Row ${i + 1}`,
        row: i + 1,
        errors: personaValidation.errors
      });
      validation.summary.invalid_personas++;
    }
  }

  return validation;
}

/**
 * Validate a single persona
 */
function validateSinglePersona(persona, rowNumber) {
  const result = {
    isValid: true,
    warnings: [],
    errors: []
  };

  // Required fields validation
  if (!persona.name || persona.name.trim() === '') {
    result.errors.push('Name is required');
    result.isValid = false;
  }

  // Age validation
  if (persona.age !== undefined) {
    if (isNaN(persona.age) || persona.age < 0 || persona.age > 120) {
      result.warnings.push(`Age ${persona.age} seems unusual`);
    }
  } else {
    result.warnings.push('Age not provided');
  }

  // Data quality warnings
  if (!persona.location) {
    result.warnings.push('Location not provided');
  }

  if (!persona.occupation) {
    result.warnings.push('Occupation not provided');
  }

  if (!persona.bio && !persona.description) {
    result.warnings.push('No biography or description provided');
  }

  if (!persona.interests || (Array.isArray(persona.interests) && persona.interests.length === 0)) {
    result.warnings.push('No interests provided');
  }

  // Data format validation
  if (persona.interests && !Array.isArray(persona.interests)) {
    result.warnings.push('Interests should be a list');
  }

  if (persona.motivations && !Array.isArray(persona.motivations)) {
    result.warnings.push('Motivations should be a list');
  }

  if (persona.barriers && !Array.isArray(persona.barriers)) {
    result.warnings.push('Barriers should be a list');
  }

  return result;
}

/**
 * Parse persona data from a row based on headers
 */
function parsePersonaFromRow(row, headers) {
  const persona = {};

  // Map common column names to persona properties
  const columnMapping = {
    'name': 'name',
    'first name': 'name',
    'full name': 'name',
    'age': 'age',
    'gender': 'gender',
    'location': 'location',
    'city': 'location',
    'state': 'location',
    'income': 'income',
    'household income': 'income',
    'education': 'education',
    'occupation': 'occupation',
    'job': 'occupation',
    'interests': 'interests',
    'hobbies': 'interests',
    'values': 'values',
    'communication style': 'communication_style',
    'communication_style': 'communication_style',
    'bio': 'bio',
    'biography': 'bio',
    'description': 'bio',
    'motivations': 'motivations',
    'barriers': 'barriers',
    'concerns': 'barriers',
    'personality': 'personality',
    'traits': 'personality'
  };

  // Process each column
  for (let j = 0; j < headers.length && j < row.length; j++) {
    const header = headers[j];
    const value = row[j];

    if (!value || value.trim() === '') continue;

    // Map header to persona property
    const mappedProperty = columnMapping[header];
    if (mappedProperty) {
      if (mappedProperty === 'age') {
        persona[mappedProperty] = parseInt(value) || 0;
      } else if (mappedProperty === 'interests' || mappedProperty === 'motivations' || mappedProperty === 'barriers') {
        // Handle comma-separated lists
        persona[mappedProperty] = value.split(/[,;]/).map(item => item.trim()).filter(item => item);
      } else {
        persona[mappedProperty] = value.trim();
      }
    } else {
      // Store unmapped columns as additional properties
      persona[header.replace(/\s+/g, '_')] = value.trim();
    }
  }

  // Ensure required properties have defaults
  if (!persona.name) return null;

  persona.source = 'julius_sheet';
  persona.imported_at = new Date().toISOString();

  return persona;
}

/**
 * Export enriched personas to a new Google Sheets document
 */
export async function exportEnrichedPersonas(enrichedPersonas, campaignData, options = {}) {
  try {
    console.log(`Exporting ${enrichedPersonas.length} enriched personas to Google Sheets`);

    const sheets = await initializeSheets();

    // Create a new spreadsheet or use existing one
    const spreadsheetId = options.targetSpreadsheetId || await createNewSpreadsheet(
      `Enriched Personas - ${campaignData.matter} - ${new Date().toISOString().split('T')[0]}`,
      sheets
    );

    // Prepare headers for enriched persona data
    const headers = [
      'Name', 'Age', 'Gender', 'Location', 'Occupation', 'Education', 'Income',
      'Original Bio', 'Interests', 'Values', 'Communication Style',
      'Social Media - Facebook', 'Social Media - LinkedIn', 'Social Media - Other',
      'Professional Background', 'Community Involvement',
      'Legal Motivations', 'Legal Barriers', 'Legal Experience',
      'Preferred Legal Communication', 'Decision Timeline', 'Trust Factors',
      'Document Insights', 'Enrichment Sources', 'Confidence Score',
      'Original Source', 'Enriched Date', 'Campaign Matter'
    ];

    // Prepare rows
    const rows = [headers];

    enrichedPersonas.forEach(persona => {
      const row = [
        persona.name || '',
        persona.age || '',
        persona.gender || '',
        persona.location || '',
        persona.occupation || '',
        persona.education || '',
        persona.income || '',
        persona.bio || '',
        Array.isArray(persona.interests) ? persona.interests.join('; ') : persona.interests || '',
        Array.isArray(persona.values) ? persona.values.join('; ') : persona.values || '',
        persona.communication_style || '',

        // Social media data
        persona.social_media_profiles?.facebook ?
          `Active: ${persona.social_media_profiles.facebook.active}, Frequency: ${persona.social_media_profiles.facebook.frequency}` : '',
        persona.social_media_profiles?.linkedin ?
          `Active: ${persona.social_media_profiles.linkedin.active}, Usage: ${persona.social_media_profiles.linkedin.usage}` : '',
        persona.social_media_profiles?.other_platforms ?
          persona.social_media_profiles.other_platforms.join(', ') : '',

        // Professional details
        persona.professional_details?.industry_experience || '',
        Array.isArray(persona.community_involvement) ? persona.community_involvement.join('; ') : '',

        // Legal enrichment data
        Array.isArray(persona.legal_motivations) ? persona.legal_motivations.join('; ') : '',
        Array.isArray(persona.legal_barriers) ? persona.legal_barriers.join('; ') : '',
        persona.legal_profile?.likely_legal_experience || '',
        persona.preferred_legal_communication || '',
        persona.decision_timeline || '',
        Array.isArray(persona.trust_factors_legal) ? persona.trust_factors_legal.join('; ') : '',

        // Enrichment metadata
        Array.isArray(persona.document_insights) ? persona.document_insights.join('; ') : '',
        persona.enrichment?.sources ? persona.enrichment.sources.join(', ') : '',
        persona.enrichment?.confidence_score || '',
        persona.source || 'julius_sheet',
        persona.enrichment?.enriched_at || persona.enrichment_metadata?.enriched_at || '',
        campaignData.matter || ''
      ];

      rows.push(row);
    });

    // Write data to spreadsheet
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId,
      range: 'Sheet1!A1:AB' + rows.length,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: rows
      }
    });

    console.log(`✅ Exported ${enrichedPersonas.length} enriched personas to Google Sheets`);

    return {
      success: true,
      spreadsheet_id: spreadsheetId,
      sheet_url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
      rows_exported: rows.length - 1, // Exclude header row
      updated_range: response.data.updatedRange
    };

  } catch (error) {
    console.error('Failed to export enriched personas:', error);
    throw new Error(`Export failed: ${error.message}`);
  }
}

/**
 * Create a new Google Spreadsheet
 */
async function createNewSpreadsheet(title, sheets) {
  try {
    const response = await sheets.spreadsheets.create({
      resource: {
        properties: {
          title: title
        },
        sheets: [{
          properties: {
            title: 'Enriched Personas'
          }
        }]
      }
    });

    return response.data.spreadsheetId;
  } catch (error) {
    console.error('Failed to create new spreadsheet:', error);
    throw error;
  }
}

/**
 * Update existing personas with enrichment data in the original Julius sheet
 */
export async function updateJuliusSheetWithEnrichment(enrichedPersonas, juliusSheetUrl, options = {}) {
  try {
    console.log(`Updating Julius sheet with enrichment data for ${enrichedPersonas.length} personas`);

    // Extract spreadsheet ID from Julius sheet URL
    const { spreadsheetId, gid } = extractSheetInfo(juliusSheetUrl);
    const sheets = await initializeSheets();

    // Get current sheet data to find the right columns to update
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: 'A1:Z1' // Get headers
    });

    const headers = response.data.values?.[0] || [];

    // Find or add enrichment columns
    const enrichmentColumns = [
      'enrichment_status',
      'social_media_summary',
      'legal_insights',
      'confidence_score',
      'enriched_date'
    ];

    // Determine which columns to update (this is a simplified approach)
    // In a real implementation, you'd want to be more sophisticated about column mapping

    console.log(`📊 Found ${headers.length} columns in Julius sheet`);
    console.log(`🎯 Planning to add enrichment data in additional columns`);

    // For now, we'll append enrichment data as new columns
    // This preserves the original Julius data while adding our enrichments

    const updates = [];

    for (let i = 0; i < enrichedPersonas.length; i++) {
      const persona = enrichedPersonas[i];
      const rowIndex = i + 2; // Assuming row 1 is headers, start from row 2

      // Prepare enrichment summary for this persona
      const enrichmentSummary = [
        'enriched', // status
        persona.social_media_profiles ? 'Added social profiles' : '', // social media summary
        persona.legal_motivations ? persona.legal_motivations.slice(0, 2).join('; ') : '', // legal insights
        persona.enrichment?.confidence_score || '', // confidence
        persona.enrichment?.enriched_at || '' // date
      ];

      // Add this as an update (you'd need to determine the right columns)
      updates.push({
        range: `${String.fromCharCode(65 + headers.length)}${rowIndex}:${String.fromCharCode(65 + headers.length + enrichmentSummary.length - 1)}${rowIndex}`,
        values: [enrichmentSummary]
      });
    }

    if (updates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: spreadsheetId,
        resource: {
          valueInputOption: 'USER_ENTERED',
          data: updates
        }
      });
    }

    console.log(`✅ Updated Julius sheet with enrichment data`);

    return {
      success: true,
      spreadsheet_id: spreadsheetId,
      sheet_url: juliusSheetUrl,
      personas_updated: enrichedPersonas.length
    };

  } catch (error) {
    console.error('Failed to update Julius sheet:', error);
    throw new Error(`Julius sheet update failed: ${error.message}`);
  }
}

/**
 * Helper function to safely parse JSON
 */
function safeJsonParse(jsonString) {
  try {
    return jsonString ? JSON.parse(jsonString) : {};
  } catch (error) {
    return {};
  }
}
