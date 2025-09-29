// api/upload.js - Handle FormData uploads and store in Vercel Blob
import { put } from '@vercel/blob';
import Busboy from 'busboy';

export const config = {
  api: {
    bodyParser: false, // We'll handle parsing ourselves
  },
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      console.log("📤 Processing file upload");
      
      // Parse the multipart form data
      const { files } = await parseFormData(req);
      
      if (files.length === 0) {
        return res.status(400).json({ error: 'No file provided' });
      }
      
      const file = files[0]; // Take the first file
      console.log(`📁 Uploading file: ${file.filename} (${file.buffer.length} bytes)`);
      
      // Upload to Vercel Blob
      const blob = await put(file.filename, file.buffer, {
        access: 'public',
        addRandomSuffix: true,
      });
      
      console.log("✅ Upload complete:", blob.url);
      
      return res.status(200).json({
        url: blob.url,
        size: blob.size,
        filename: file.filename,
        originalName: file.filename
      });
      
    } catch (error) {
      console.error("💥 Upload error:", error);
      return res.status(500).json({ 
        error: "Upload failed", 
        message: error.message 
      });
    }
  }
  
  res.status(405).json({ error: "Method not allowed" });
}

// Parse multipart form data
async function parseFormData(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    const fields = {};
    const files = [];

    busboy.on('field', (fieldname, value) => {
      fields[fieldname] = value;
    });

    busboy.on('file', (fieldname, file, { filename, mimeType }) => {
      const chunks = [];
      file.on('data', chunk => chunks.push(chunk));
      file.on('end', () => {
        files.push({
          fieldname,
          filename,
          mimeType,
          buffer: Buffer.concat(chunks)
        });
      });
    });

    busboy.on('finish', () => {
      resolve({ fields, files });
    });

    busboy.on('error', reject);
    req.pipe(busboy);
  });
}
