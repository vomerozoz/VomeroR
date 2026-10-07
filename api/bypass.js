module.exports = async function handler(req, res) {
  // Header CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-api-key'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const secretKey = req.headers['x-api-key'] || req.query.apikey || req.body?.apikey;
  const targetUrl = req.query.url || req.body?.url;
  const MY_SECRET_KEY = "vomerow_secret_key_123";

  if (secretKey !== MY_SECRET_KEY) {
    return res.status(401).json({ status: false, message: "API Key rahasia tidak valid!" });
  }

  if (!targetUrl) {
    return res.status(400).json({ status: false, message: "Parameter URL wajib diisi!" });
  }

  try {
    let cleanUrl = targetUrl.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }

    let bypassedUrl = null;

    // METODE 1: Menggunakan Resolver Engine untuk nembus Cloudflare sfl.gl
    try {
      const apiRes = await fetch(`https://api.bypass.vip/bypass?url=${encodeURIComponent(cleanUrl)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const apiData = await apiRes.json();
      if (apiData && apiData.destination) {
        bypassedUrl = apiData.destination;
      } else if (apiData && apiData.result) {
        bypassedUrl = apiData.result;
      }
    } catch (e) {}

    // METODE 2: Dekoder Base64 Cadangan dari HTML
    if (!bypassedUrl) {
      try {
        const response = await fetch(cleanUrl, {
          method: 'GET',
          redirect: 'follow',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });
        const html = await response.text();

        const b64Regex = /aHR0c[a-zA-Z0-9+/=]+/g;
        const b64Matches = html.match(b64Regex);

        if (b64Matches) {
          for (const match of b64Matches) {
            try {
              let pad = match;
              while (pad.length % 4 !== 0) pad += '=';
              const decoded = Buffer.from(pad, 'base64').toString('utf-8');
              if ((decoded.startsWith('http://') || decoded.startsWith('https://')) && !decoded.includes('sfl.gl') && !decoded.includes('safelinku')) {
                bypassedUrl = decoded;
                break;
              }
            } catch (e) {}
          }
        }
      } catch (e) {}
    }

    // Jika gagal, kembalikan status 422 (bukan mengembalikan link sfl.gl yang sama)
    if (!bypassedUrl || bypassedUrl.includes('sfl.gl') || bypassedUrl.includes('safelinku')) {
      return res.status(422).json({
        status: false,
        message: "Gagal mengekstrak link asli dari shortener."
      });
    }

    return res.status(200).json({
      status: true,
      original_url: cleanUrl,
      result: bypassedUrl
    });

  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Gagal memproses bypass link",
      error: err.message
    });
  }
};
