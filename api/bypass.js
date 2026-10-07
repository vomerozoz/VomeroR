module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-api-key');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const secretKey = req.headers['x-api-key'] || req.query.apikey || req.body?.apikey;
  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : (req.query.url || req.body?.url);
  const isDebug = req.query.debug === 'true' || req.query.debug === '1';
  const MY_SECRET_KEY = "vomerow_secret_key_123";

  if (secretKey !== MY_SECRET_KEY) {
    return res.status(401).json({ status: false, message: "API Key rahasia tidak valid!" });
  }

  if (!rawUrl) {
    return res.status(400).json({ status: false, message: "Parameter URL wajib diisi!" });
  }

  try {
    let cleanUrl = String(rawUrl).trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }

    let bypassedUrl = null;
    let logs = [];

    const isValidDestination = (url) => {
      if (!url || typeof url !== 'string') return false;
      if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
      const invalidKeywords = [
        'sfl.gl', 'safelinku', 'bypass.vip', 'discord', 'shutdown', 'leechers', 
        'tutwuri.id', 'safelinkku.com', 'wpsafelink', 'google.com', 'cloudflare.com', 'error-1005'
      ];
      return !invalidKeywords.some(kw => url.toLowerCase().includes(kw));
    };

    // Mesin 1: External API Resolver
    const bypassServices = [
      `https://bypass.city/api/bypass?url=${encodeURIComponent(cleanUrl)}`,
      `https://api.bypass.vip/bypass?url=${encodeURIComponent(cleanUrl)}`
    ];

    for (const serviceUrl of bypassServices) {
      try {
        const response = await fetch(serviceUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const data = await response.json();
        const resultUrl = data?.destination || data?.result || data?.url;

        if (isValidDestination(resultUrl)) {
          bypassedUrl = resultUrl;
          logs.push(`Servis Berhasil: ${serviceUrl} -> ${resultUrl}`);
          break;
        } else {
          logs.push(`Servis Gagal/Invalid: ${serviceUrl}`);
        }
      } catch (e) {
        logs.push(`Servis Error (${serviceUrl}): ${e.message}`);
      }
    }

    // Mesin 2: Scraping Proxy kalau Mesin 1 belum dapet
    if (!bypassedUrl) {
      try {
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(cleanUrl)}`;
        const resProxy = await fetch(proxyUrl);
        const dataProxy = await resProxy.json();
        const html = dataProxy?.contents || '';

        logs.push(`HTML Proxy Length: ${html.length}`);

        // Ekstraksi Base64
        const b64Matches = html.match(/aHR0c[a-zA-Z0-9+/=]+/g) || [];
        for (const m of b64Matches) {
          try {
            let pad = m.trim();
            while (pad.length % 4 !== 0) pad += '=';
            const decoded = Buffer.from(pad, 'base64').toString('utf-8');
            if (isValidDestination(decoded)) {
              bypassedUrl = decoded;
              logs.push(`Base64 Extracted: ${bypassedUrl}`);
              break;
            }
          } catch (e) {}
        }
      } catch (e) {
        logs.push(`Proxy Scraper Error: ${e.message}`);
      }
    }

    if (!isValidDestination(bypassedUrl)) {
      return res.status(400).json({
        status: false,
        message: "Gagal mengekstrak link asli dari Safelinku.",
        debug_logs: isDebug ? logs : undefined
      });
    }

    return res.status(200).json({
      status: true,
      original_url: cleanUrl,
      result: bypassedUrl,
      debug_logs: isDebug ? logs : undefined
    });

  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Gagal memproses bypass link",
      error: err.message
    });
  }
};
