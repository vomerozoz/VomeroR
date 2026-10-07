module.exports = async function handler(req, res) {
  // Header CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
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
    let currentUrl = targetUrl.trim();
    if (!currentUrl.startsWith('http://') && !currentUrl.startsWith('https://')) {
      currentUrl = 'https://' + currentUrl;
    }

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
    };

    const response = await fetch(currentUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: headers
    });

    const finalUrl = response.url;
    const html = await response.text();
    let bypassedUrl = null;

    // 1. Ekstraksi string Base64 bertema http/https (aHR0cD...) dari isi HTML
    const b64Regex = /aHR0c[a-zA-Z0-9+/=]+/g;
    const b64Matches = html.match(b64Regex);

    if (b64Matches) {
      for (const match of b64Matches) {
        try {
          let padMatch = match;
          while (padMatch.length % 4 !== 0) padMatch += '=';
          const decoded = Buffer.from(padMatch, 'base64').toString('utf-8');
          if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
            if (!decoded.includes('sfl.gl') && !decoded.includes('safelinku')) {
              bypassedUrl = decoded;
              break;
            }
          }
        } catch (e) {}
      }
    }

    // 2. Ekstraksi dari skrip redirect window.location
    if (!bypassedUrl) {
      const jsMatch = html.match(/(?:window\.location(?:\.href)?|location\.href)\s*=\s*["']([^"']+)["']/i);
      if (jsMatch && jsMatch[1]) {
        const loc = jsMatch[1];
        if (loc.startsWith('http') && !loc.includes('sfl.gl')) {
          bypassedUrl = loc;
        }
      }
    }

    // 3. Ekstraksi dari parameter URL (?url=..., ?dest=..., ?link=...)
    if (!bypassedUrl) {
      try {
        const parsed = new URL(finalUrl);
        for (const [_, val] of parsed.searchParams.entries()) {
          if (val.startsWith('http://') || val.startsWith('https://')) {
            bypassedUrl = val;
            break;
          }
          try {
            const decoded = Buffer.from(val, 'base64').toString('utf-8');
            if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
              bypassedUrl = decoded;
              break;
            }
          } catch (e) {}
        }
      } catch (e) {}
    }

    // Jika tidak ditemukan pola khusus, gunakan URL hasil HTTP Redirect
    if (!bypassedUrl) {
      bypassedUrl = (finalUrl !== currentUrl) ? finalUrl : currentUrl;
    }

    return res.status(200).json({
      status: true,
      original_url: targetUrl,
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
