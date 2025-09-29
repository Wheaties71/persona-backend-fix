// api/generate-personas-v2.js (Enhanced with Detailed Debugging)
import { Readable } from 'stream';

export const config = {
  api: {
    bodyParser: true, // Enable default body parser
    maxDuration: 780 // 13 minutes for Vercel Pro
  }
};

// Helper function to parse form data
function parseForm(req) {
  return new Promise((resolve, reject) => {
    try {
      // If body is already parsed by Vercel
      if (req.body && typeof req.body === 'object') {
        resolve({ fields: req.body, files: {} });
        return;
      }

      // Manual parsing for multipart data
      let body = '';
      req.setEncoding('utf8');

      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', () => {
        try {
          // Try JSON first
          const parsed = JSON.parse(body);
          resolve({ fields: parsed, files: {} });
        } catch {
          // Parse as form data
          const fields = {};
          const pairs = body.split('&');
          for (const pair of pairs) {
            const [key, value] = pair.split('=');
            if (key && value) {
              fields[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
            }
          }
          resolve({ fields, files: {} });
        }
      });

      req.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

export default async function handler(req, res) {
  const sessionId = Math.random().toString(36).substring(2, 8);

  // CORS headers
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
    console.log(`🔧 [${sessionId}] Parsing form data...`);
    console.log(`🔧 [${sessionId}] Content-Type: ${req.headers['content-type']}`);

    // Parse form data
    try {
      const { fields } = await parseForm(req);
      console.log(`✅ [${sessionId}] Form parsing successful, got ${Object.keys(fields).length} fields`);
      req.body = fields; // Set parsed fields as req.body
    } catch (parseError) {
      console.error(`❌ [${sessionId}] Form parsing failed:`, parseError);
      return res.status(400).json({
        error: 'Failed to parse form data',
        details: parseError.message
      });
    }
    console.log(`🚀 [${sessionId}] === PERSONA GENERATION STARTED ===`);
    console.log(`📝 [${sessionId}] REQUEST DETAILS:`);
    console.log(`   - Method: ${req.method}`);
    console.log(`   - Headers: ${JSON.stringify(req.headers, null, 2)}`);
    console.log(`   - Body keys: ${Object.keys(req.body || {}).join(', ')}`);
    
    const {
      matter,
      keywords,
      target_description,
      persona_count,
      julius_personas_sheet_url,
      complaint_file_url,
      research_file_url
    } = req.body;
    
    console.log(`📋 [${sessionId}] FORM DATA RECEIVED:`);
    console.log(`   - Matter: ${matter}`);
    console.log(`   - Keywords: ${keywords}`);
    console.log(`   - Target: ${target_description}`);
    console.log(`   - Persona count: ${persona_count}`);
    console.log(`   - Julius Personas Sheet: ${julius_personas_sheet_url ? '✅ Provided' : '❌ Generate mode'}`);
    
    console.log(`📎 [${sessionId}] BACKGROUND DOCUMENTS:`);
    console.log(`   - Complaint: ${complaint_file_url ? '✅ ' + complaint_file_url.substring(0, 50) + '...' : '❌ none'}`);
    console.log(`   - Research: ${research_file_url ? '✅ ' + research_file_url.substring(0, 50) + '...' : '❌ none'}`);
    
    // Count total files
    const fileUrls = [complaint_file_url, research_file_url].filter(Boolean);
    console.log(`📊 [${sessionId}] TOTAL FILES TO PROCESS: ${fileUrls.length}`);
    
    // Basic validation
    if (!matter || !keywords || !target_description) {
      console.log(`❌ [${sessionId}] VALIDATION FAILED: Missing required fields`);
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Matter, keywords, and target description are required'
      });
    }

    // Validate Google Sheets URL if provided
    if (julius_personas_sheet_url) {
      const sheetsUrlPattern = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+/;
      if (!sheetsUrlPattern.test(julius_personas_sheet_url)) {
        console.log(`❌ [${sessionId}] VALIDATION FAILED: Invalid Google Sheets URL`);
        return res.status(400).json({
          error: 'Invalid Google Sheets URL',
          message: 'Please provide a valid Google Sheets URL (https://docs.google.com/spreadsheets/d/...)',
          sessionId: sessionId
        });
      }

      // Additional URL validation - check for required parts
      try {
        const url = new URL(julius_personas_sheet_url);
        if (url.hostname !== 'docs.google.com') {
          throw new Error('URL must be from docs.google.com');
        }
        if (!url.pathname.includes('/spreadsheets/d/')) {
          throw new Error('URL must be a Google Sheets document');
        }
      } catch (urlError) {
        console.log(`❌ [${sessionId}] VALIDATION FAILED: Invalid URL format: ${urlError.message}`);
        return res.status(400).json({
          error: 'Invalid Google Sheets URL Format',
          message: `URL validation failed: ${urlError.message}`,
          sessionId: sessionId
        });
      }

      console.log(`✅ [${sessionId}] Google Sheets URL validated successfully`);
    }
    
    console.log(`✅ [${sessionId}] VALIDATION PASSED`);

    // Determine workflow mode
    const isEnrichmentMode = !!julius_personas_sheet_url;
    console.log(`🔄 [${sessionId}] WORKFLOW MODE: ${isEnrichmentMode ? 'ENRICHMENT' : 'GENERATION'}`);

    if (isEnrichmentMode) {
      // ENRICHMENT WORKFLOW: Import existing personas and enrich them
      return await handlePersonaEnrichment(req, res, sessionId, {
        matter,
        keywords,
        target_description,
        julius_personas_sheet_url,
        complaint_file_url,
        research_file_url
      });
    }

    // GENERATION WORKFLOW: Original persona generation flow
    // STEP 1: Process uploaded files
    console.log(`📁 [${sessionId}] === STEP 1: PROCESSING UPLOADED FILES ===`);
    let uploadedData = [];
    
    if (fileUrls.length > 0) {
      try {
        console.log(`📥 [${sessionId}] Importing document agent...`);
        const { default: DocumentAgent } = await import('../lib/documentAgent.js');
        console.log(`✅ [${sessionId}] Document agent imported successfully`);
        
        // Create file objects from URLs
        const fileObjects = [];
        
        if (mri_file_url) {
          console.log(`📄 [${sessionId}] Processing MRI file: ${mri_file_url}`);
          try {
            const response = await fetch(mri_file_url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const buffer = await response.arrayBuffer();
            fileObjects.push({
              filename: 'MRI_Data.xlsx',
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              buffer: Buffer.from(buffer)
            });
            console.log(`✅ [${sessionId}] MRI file downloaded: ${buffer.byteLength} bytes`);
          } catch (error) {
            console.log(`❌ [${sessionId}] MRI file download failed: ${error.message}`);
          }
        }
        
        if (targetsmart_file_url) {
          console.log(`📄 [${sessionId}] Processing TargetSmart file: ${targetsmart_file_url}`);
          try {
            const response = await fetch(targetsmart_file_url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const buffer = await response.arrayBuffer();
            fileObjects.push({
              filename: 'TargetSmart_Data.xlsx',
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              buffer: Buffer.from(buffer)
            });
            console.log(`✅ [${sessionId}] TargetSmart file downloaded: ${buffer.byteLength} bytes`);
          } catch (error) {
            console.log(`❌ [${sessionId}] TargetSmart file download failed: ${error.message}`);
          }
        }
        
        if (client_file_url) {
          console.log(`📄 [${sessionId}] Processing Client file: ${client_file_url}`);
          try {
            const response = await fetch(client_file_url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const buffer = await response.arrayBuffer();
            fileObjects.push({
              filename: 'Client_Data.xlsx',
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              buffer: Buffer.from(buffer)
            });
            console.log(`✅ [${sessionId}] Client file downloaded: ${buffer.byteLength} bytes`);
          } catch (error) {
            console.log(`❌ [${sessionId}] Client file download failed: ${error.message}`);
          }
        }
        
        if (complaint_file_url) {
          console.log(`📄 [${sessionId}] Processing Complaint file: ${complaint_file_url}`);
          try {
            const response = await fetch(complaint_file_url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const buffer = await response.arrayBuffer();
            fileObjects.push({
              filename: 'Complaint.pdf',
              mimeType: 'application/pdf',
              buffer: Buffer.from(buffer)
            });
            console.log(`✅ [${sessionId}] Complaint file downloaded: ${buffer.byteLength} bytes`);
          } catch (error) {
            console.log(`❌ [${sessionId}] Complaint file download failed: ${error.message}`);
          }
        }
        
        if (research_file_url) {
          console.log(`📄 [${sessionId}] Processing Research file: ${research_file_url}`);
          try {
            const response = await fetch(research_file_url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const buffer = await response.arrayBuffer();
            fileObjects.push({
              filename: 'Research.pdf',
              mimeType: 'application/pdf',
              buffer: Buffer.from(buffer)
            });
            console.log(`✅ [${sessionId}] Research file downloaded: ${buffer.byteLength} bytes`);
          } catch (error) {
            console.log(`❌ [${sessionId}] Research file download failed: ${error.message}`);
          }
        }
        
        console.log(`📊 [${sessionId}] FILES READY FOR PROCESSING: ${fileObjects.length}`);
        
        if (fileObjects.length > 0) {
          console.log(`🔄 [${sessionId}] Calling DocumentAgent.processFiles()...`);
          uploadedData = await DocumentAgent.processFiles(fileObjects);
          console.log(`✅ [${sessionId}] Document processing complete: ${uploadedData.length} processed`);
          
          // Log each processed file
          uploadedData.forEach((data, i) => {
            console.log(`📋 [${sessionId}] File ${i+1}: ${data.filename} (${data.type}) - ${data.content?.length || 0} chars`);
            if (data.insights) {
              console.log(`   📊 Insights: ${Object.keys(data.insights).join(', ')}`);
            }
          });
        } else {
          console.log(`⚠️ [${sessionId}] No files could be downloaded for processing`);
        }
        
      } catch (error) {
        console.log(`❌ [${sessionId}] Document processing error: ${error.message}`);
        console.log(`🔍 [${sessionId}] Error stack: ${error.stack}`);
      }
    } else {
      console.log(`ℹ️ [${sessionId}] No files uploaded - proceeding with research data only`);
    }

    // STEP 2: Research
    console.log(`🔬 [${sessionId}] === STEP 2: CONDUCTING RESEARCH ===`);
    let researchData = {};
    
    try {
      console.log(`📥 [${sessionId}] Importing research agent...`);
      const { conductResearch } = await import('../lib/researchAgent.js');
      console.log(`✅ [${sessionId}] Research agent imported successfully`);

      console.log(`🔍 [${sessionId}] Starting research for: ${matter} | ${keywords}`);
      researchData = await conductResearch(matter, keywords, target_description);
      
      console.log(`✅ [${sessionId}] Research completed`);
      console.log(`📊 [${sessionId}] Research categories: ${Object.keys(researchData).join(', ')}`);
      
      // Log research data size
      Object.keys(researchData).forEach(key => {
        const data = researchData[key];
        if (Array.isArray(data)) {
          console.log(`   - ${key}: ${data.length} items`);
        } else if (typeof data === 'object' && data !== null) {
          console.log(`   - ${key}: object with ${Object.keys(data).length} keys`);
        } else {
          console.log(`   - ${key}: ${typeof data}`);
        }
      });
      
    } catch (error) {
      console.log(`❌ [${sessionId}] Research failed: ${error.message}`);
      console.log(`🔍 [${sessionId}] Error stack: ${error.stack}`);
      throw error;
    }

    // STEP 3: Generate Personas
    console.log(`🎭 [${sessionId}] === STEP 3: GENERATING PERSONAS ===`);
    
    try {
      console.log(`📥 [${sessionId}] Importing persona agent...`);
      const { generatePersonas } = await import('../lib/personaAgent.js');
      console.log(`✅ [${sessionId}] Persona agent imported successfully`);

      console.log(`🔄 [${sessionId}] Calling generatePersonas()...`);
      console.log(`📊 [${sessionId}] Input data summary:`);
      console.log(`   - Research data: ${Object.keys(researchData).length} categories`);
      console.log(`   - Uploaded data: ${uploadedData.length} files`);
      console.log(`   - Persona count: ${persona_count}`);

      const personaResult = await generatePersonas(
        { matter, keywords, target_description }, uploadedData, researchData, parseInt(persona_count) || 5
      );

      if (!personaResult.success) {
        console.log(`❌ [${sessionId}] Persona generation failed: ${personaResult.error}`);
        console.log(`📋 [${sessionId}] Failure details: ${personaResult.message}`);
        return res.status(422).json(personaResult);
      }

      const personas = personaResult.personas;
      console.log(`✅ [${sessionId}] Persona generation successful: ${personas.length} personas created`);
      
      // Log each persona
      personas.forEach((persona, i) => {
        console.log(`🎭 [${sessionId}] Persona ${i+1}: ${persona.name} (age ${persona.age}) - confidence: ${persona.confidence_score}`);
      });

      console.log(`🎉 [${sessionId}] === WORKFLOW COMPLETED SUCCESSFULLY ===`);
      
      return res.status(200).json({
        success: true,
        sessionId: sessionId,
        personas: personas,
        dataAnalysis: {
          totalDataPoints: personaResult.sourceDataCount,
          confidence: personaResult.confidence,
          filesProcessed: uploadedData.length,
          researchCategories: Object.keys(researchData),
          hasMediaInsights: personaResult.hasMediaInsights
        },
        processingTime: new Date().toISOString()
      });

    } catch (error) {
      console.log(`❌ [${sessionId}] Persona generation error: ${error.message}`);
      console.log(`🔍 [${sessionId}] Error stack: ${error.stack}`);
      throw error;
    }

  } catch (error) {
    console.error(`💥 [${sessionId}] FATAL ERROR: ${error.message}`);
    console.error(`📍 [${sessionId}] Stack trace: ${error.stack}`);

    return res.status(500).json({
      error: 'PROCESSING_FAILED',
      message: error.message,
      sessionId: sessionId,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Handle persona enrichment workflow
 */
async function handlePersonaEnrichment(req, res, sessionId, params) {
  try {
    console.log(`🔄 [${sessionId}] === STARTING PERSONA ENRICHMENT WORKFLOW ===`);

    const {
      matter,
      keywords,
      target_description,
      julius_personas_sheet_url,
      complaint_file_url,
      research_file_url
    } = params;

    // STEP 1: Import Julius personas from Google Sheets
    console.log(`📥 [${sessionId}] === STEP 1: IMPORTING JULIUS PERSONAS ===`);

    const { fetchPersonasFromExternalSheet, validatePersonas } = await import('../lib/sheetsService.js');

    let importedPersonas;
    try {
      importedPersonas = await fetchPersonasFromExternalSheet(julius_personas_sheet_url);
      console.log(`✅ [${sessionId}] Imported ${importedPersonas.length} personas from Julius sheet`);
    } catch (error) {
      console.error(`❌ [${sessionId}] Failed to import personas from Julius sheet: ${error.message}`);

      // Return specific error based on the type of failure
      let errorMessage = 'Failed to access Julius personas sheet';
      let errorDetails = error.message;

      if (error.message.includes('permission') || error.message.includes('access') || error.message.includes('403')) {
        errorMessage = 'Permission denied accessing Julius sheet';
        errorDetails = 'Please ensure the Google Sheet is shared publicly or with our service account. Go to Share > General access > Anyone with the link > Viewer.';
      } else if (error.message.includes('not found') || error.message.includes('404')) {
        errorMessage = 'Julius sheet not found';
        errorDetails = 'The Google Sheet URL appears to be invalid or the sheet has been deleted.';
      } else if (error.message.includes('No persona data found')) {
        errorMessage = 'Empty personas sheet';
        errorDetails = 'The Julius sheet appears to be empty or contains no valid persona data.';
      }

      return res.status(400).json({
        error: 'SHEET_ACCESS_FAILED',
        message: errorMessage,
        details: errorDetails,
        sessionId: sessionId,
        troubleshooting: {
          steps: [
            'Verify the Google Sheets URL is correct',
            'Ensure the sheet is shared publicly (Anyone with the link > Viewer)',
            'Check that the sheet contains persona data with proper headers',
            'Make sure the sheet is not empty'
          ]
        }
      });
    }

    // Check if we got any personas at all
    if (!importedPersonas || importedPersonas.length === 0) {
      console.log(`❌ [${sessionId}] No personas found in Julius sheet`);
      return res.status(400).json({
        error: 'EMPTY_PERSONAS_SHEET',
        message: 'No personas found in the Julius sheet',
        details: 'The sheet appears to be empty or contains no recognizable persona data.',
        sessionId: sessionId,
        troubleshooting: {
          expectedFormat: 'The sheet should have headers like: name, age, location, occupation, interests, etc.',
          minRequirements: 'At least a name column with persona names is required'
        }
      });
    }

    // STEP 2: Validate imported personas
    console.log(`✔️ [${sessionId}] === STEP 2: VALIDATING PERSONAS ===`);

    const validation = validatePersonas(importedPersonas);
    console.log(`📊 [${sessionId}] Validation Results:`);
    console.log(`   - Valid personas: ${validation.summary.valid_personas}`);
    console.log(`   - Personas with warnings: ${validation.summary.personas_with_warnings}`);
    console.log(`   - Invalid personas: ${validation.summary.invalid_personas}`);

    // Enhanced validation error handling
    if (validation.summary.valid_personas === 0) {
      console.log(`❌ [${sessionId}] No valid personas after validation`);

      return res.status(400).json({
        error: 'NO_VALID_PERSONAS',
        message: 'No valid personas found in the Julius sheet after validation',
        validationDetails: {
          total_imported: validation.summary.total_imported,
          validation_errors: validation.errors.slice(0, 5), // Show first 5 errors
          common_issues: [
            'Missing required name field',
            'Invalid data formats',
            'Empty rows'
          ]
        },
        sessionId: sessionId,
        suggestion: 'Please check the persona data format and ensure each persona has at least a name.'
      });
    }

    // Show warnings but continue if we have some valid personas
    if (validation.summary.personas_with_warnings > 0) {
      console.log(`⚠️ [${sessionId}] Found ${validation.summary.personas_with_warnings} personas with warnings - continuing with enrichment`);
    }

    // STEP 3: Process background documents
    console.log(`📁 [${sessionId}] === STEP 3: PROCESSING BACKGROUND DOCUMENTS ===`);

    let uploadedData = [];
    const fileUrls = [complaint_file_url, research_file_url].filter(Boolean);

    if (fileUrls.length > 0) {
      const { default: DocumentAgent } = await import('../lib/documentAgent.js');

      // Process each file (similar to generation workflow but focused on context)
      const fileObjects = [];

      // Add file processing logic here (simplified for now)
      for (const fileUrl of fileUrls) {
        try {
          const response = await fetch(fileUrl);
          if (response.ok) {
            const buffer = await response.arrayBuffer();
            fileObjects.push({
              filename: fileUrl.split('/').pop() || 'document',
              buffer: Buffer.from(buffer)
            });
          }
        } catch (error) {
          console.log(`⚠️ [${sessionId}] Failed to process file: ${fileUrl}`);
        }
      }

      if (fileObjects.length > 0) {
        uploadedData = await DocumentAgent.analyzeFiles(fileObjects, {
          campaignType: matter,
          targetAudience: target_description
        });
        console.log(`✅ [${sessionId}] Processed ${uploadedData.length} documents for context`);
      }
    }

    // STEP 4: Conduct research for enrichment context
    console.log(`🔬 [${sessionId}] === STEP 4: GATHERING ENRICHMENT CONTEXT ===`);

    const { conductResearch } = await import('../lib/researchAgent.js');
    const researchData = await conductResearch(matter, keywords, target_description);
    console.log(`✅ [${sessionId}] Research completed for enrichment context`);

    // STEP 5: Enrich personas using AI agent
    console.log(`🎯 [${sessionId}] === STEP 5: ENRICHING PERSONAS ===`);

    const { default: PersonaEnrichmentAgent } = await import('../lib/personaEnrichmentAgent.js');
    const enrichmentAgent = new PersonaEnrichmentAgent();

    const enrichmentContext = {
      matter,
      keywords,
      target_description,
      documents: uploadedData,
      research: researchData
    };

    // First: Social and research enrichment via PersonaEnrichmentAgent
    const socialEnrichedPersonas = await enrichmentAgent.enrichPersonas(
      validation.valid,
      enrichmentContext
    );

    // Second: Document-based legal enrichment via PersonaAgent
    console.log(`📄 [${sessionId}] === STEP 6: ADDING DOCUMENT-BASED LEGAL INSIGHTS ===`);

    const { enrichPersonas } = await import('../lib/personaAgent.js');
    const legalEnrichmentResult = await enrichPersonas(
      socialEnrichedPersonas,
      { matter, keywords, target_description },
      uploadedData,
      researchData
    );

    const finalEnrichedPersonas = legalEnrichmentResult.personas;

    // STEP 7: Export enriched personas to Google Sheets
    console.log(`📤 [${sessionId}] === STEP 7: EXPORTING ENRICHED PERSONAS ===`);

    const { exportEnrichedPersonas } = await import('../lib/sheetsService.js');

    const exportResult = await exportEnrichedPersonas(
      finalEnrichedPersonas,
      { matter, keywords, target_description },
      { }
    );

    console.log(`✅ [${sessionId}] Exported to: ${exportResult.sheet_url}`);
    console.log(`✅ [${sessionId}] Persona enrichment completed successfully`);

    return res.status(200).json({
      success: true,
      sessionId: sessionId,
      mode: 'enrichment',
      personas: finalEnrichedPersonas,
      enrichmentSummary: {
        imported_count: importedPersonas.length,
        valid_count: validation.summary.valid_personas,
        social_enriched_count: socialEnrichedPersonas.length,
        final_enriched_count: finalEnrichedPersonas.length,
        validation_warnings: validation.warnings.length,
        validation_errors: validation.errors.length,
        enrichment_steps: ['social_research', 'document_analysis', 'legal_insights']
      },
      dataAnalysis: {
        documentsProcessed: uploadedData.length,
        researchCategories: Object.keys(researchData),
        source_sheet: julius_personas_sheet_url,
        legal_confidence: legalEnrichmentResult.confidence,
        has_media_insights: legalEnrichmentResult.hasMediaInsights
      },
      exportResults: {
        exported_sheet_url: exportResult.sheet_url,
        exported_sheet_id: exportResult.spreadsheet_id,
        rows_exported: exportResult.rows_exported
      },
      processingTime: new Date().toISOString()
    });

  } catch (error) {
    console.error(`❌ [${sessionId}] Enrichment workflow error: ${error.message}`);
    console.error(`🔍 [${sessionId}] Error stack: ${error.stack}`);

    return res.status(500).json({
      error: 'ENRICHMENT_FAILED',
      message: error.message,
      sessionId: sessionId,
      timestamp: new Date().toISOString()
    });
  }
}
