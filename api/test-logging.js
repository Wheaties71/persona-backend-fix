// api/test-logging.js
// Create this file to test if logging works at all

export default async function handler(req, res) {
  console.log('🧪 TEST: Logging test started');
  console.log('🧪 TEST: Method:', req.method);
  console.log('🧪 TEST: Headers:', req.headers);
  console.log('🧪 TEST: Current time:', new Date().toISOString());
  
  try {
    console.log('🧪 TEST: About to return response');
    
    return res.status(200).json({
      success: true,
      message: 'Logging test completed',
      timestamp: new Date().toISOString(),
      method: req.method
    });
    
  } catch (error) {
    console.error('🧪 TEST ERROR:', error);
    return res.status(500).json({ error: error.message });
  }
}
