// api/simple-test.js
// Create this file to test basic functionality

export default async function handler(req, res) {
  
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    return res.status(200).json({
      success: true,
      message: "API is working!",
      method: req.method,
      timestamp: new Date().toISOString(),
      note: "No n8n, no complex imports - just basic functionality"
    });
    
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
