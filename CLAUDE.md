# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Signal Digital Twin Platform - AI-powered persona modeling for legal advertising. This is a Vercel-hosted serverless application that generates AI personas based on case data, target audience descriptions, and social insights for legal advertising campaigns.

## Architecture

### Core Components
- **Frontend**: Single-page HTML application (`index.html`) with vanilla JavaScript
- **API Layer**: Vercel serverless functions in `/api/` directory
- **Library Layer**: Modular agents in `/lib/` directory for different AI tasks
- **Data Sources**: Google Sheets integration + file uploads (MRI, TargetSmart, client data)

### Key API Endpoints
- `api/generate-personas-v2.js` - Main persona generation workflow (13-minute timeout)
- `api/chat-persona.js` - Individual persona chat interface
- `api/upload.js` - File upload handler for user data
- `api/test-logging.js` - Testing and debugging endpoint

### Agent Architecture
The system uses specialized AI agents in `/lib/`:
- `personaAgent.js` - Core persona generation using Anthropic Claude
- `researchAgent.js` - Social media and demographic research
- `documentAgent.js` - Legal document analysis
- `validationAgent.js` - Data validation and quality checks
- `reportAgent.js` - Output formatting and reporting
- `sheetsService.js` - Google Sheets integration

## Common Development Commands

### Local Development
```bash
npm run dev          # Start Vercel development server
npm run start        # Alias for dev command
```

### Building
```bash
npm run build        # Build project (currently just echoes "Build complete")
```

### Dependencies
- Node.js 18.0.0+ required
- Uses ES modules (`"type": "module"` in package.json)
- Anthropic Claude SDK for AI generation
- Google Sheets API for data persistence
- Vercel Blob for file storage

## Environment Variables Required
- `ANTHROPIC_API_KEY` - For Claude AI persona generation
- Google Sheets API credentials (in deployed environment)

## File Upload System
- Supports Excel files (.xlsx, .xls) up to 10MB for data files
- PDF files up to 10MB for legal documents
- Images (JPG, PNG, GIF) up to 5MB each for ad creatives
- Uses Vercel Blob storage via `/api/upload` endpoint

## Deployment
- Deployed on Vercel with serverless functions
- Configured via `vercel.json` with proper routing
- API routes auto-deploy as serverless functions
- Static assets served from root directory

## Key Business Logic
1. **Persona Generation**: Takes campaign description + uploaded data → generates N personas via Claude
2. **Polling**: Send questions to all generated personas and aggregate responses
3. **Individual Chat**: Create custom personas on-demand for interactive conversations
4. **Data Integration**: Combines MRI data, TargetSmart data, legal documents, and research

## Testing
- Use `api/simple-test.js` for basic API testing
- `api/test-logging.js` for debugging and log testing
- No formal test framework configured

## Important Notes
- Maximum execution time: 780 seconds (13 minutes) for persona generation
- All AI operations use Anthropic Claude via official SDK
- Google Sheets serves as the database for generated personas
- CORS enabled for cross-origin requests