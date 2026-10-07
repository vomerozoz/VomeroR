module.exports = async function handler(req, res) {
  // Ambil API Key dan URL dari request
  const secretKey = req.headers['x-api-key'] || req.query.apikey || req.body?.apikey;
  const targetUrl = req.query.url || req.body?.url;

  // API Key rahasia kamu
  const MY_SECRET_KEY = "vomerow_secret_key_123";

  // Cek validasi API Key
  if (secretKey !== MY_SECRET_KEY) {
    return res.status(401).json({ 
      status: false, 
      message: "API Key rahasia tidak valid!" 
    });
  }

  // Cek jika URL target kosong
  if (!targetUrl) {
    return res.status(400).json({ 
      status: false, 
      message: "Parameter URL wajib diisi!" 
    });
  }

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    return res.status(200).json({
      status: true,
      original_url: targetUrl,
      result: response.url
    });
  } catch (err) {
    return res.status(500).json({ 
      status: false, 
      message: "Gagal memproses bypass link",
      error: err.message 
    });
  }
};
