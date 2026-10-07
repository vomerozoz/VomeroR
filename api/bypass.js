module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-api-key');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const secretKey = req.headers['x-api-key'] || req.query.apikey || req.body?.apikey;
  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : (req.query.url || req.body?.url);
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

    // Helper Dekoder Base64
    const decodeB64 = (str) => {
      try {
        let pad = str;
        while (pad.length % 4 !== 0) pad += '=';
        const decoded = Buffer.from(pad, 'base64').toString('utf-8');
        if ((decoded.startsWith('http://') || decoded.startsWith('https://')) && !decoded.includes('sfl.gl') && !decoded.includes('safelinku')) {
          return decoded;
        }
      } catch (e) {}
      return null;
    };

    // Engine 1: Cek Redirect & Query Parameter (Base64)
    try {
      const fetchRes = await fetch(cleanUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      
      const finalUrl = fetchRes.url;
      if (finalUrl && !finalUrl.includes('sfl.gl') && !finalUrl.includes('safelinku')) {
        bypassedUrl = finalUrl;
      } else {
        const u = new URL(finalUrl || cleanUrl);
        const rParam = u.searchParams.get('r') || u.searchParams.get('url') || u.searchParams.get('link');
        if (rParam) {
          const dec = decodeB64(rParam);
          if (dec) bypassedUrl = dec;
        }
      }

      if (!bypassedUrl) {
        const html = await fetchRes.text();
        const matches = html.match(/aHR0c[a-zA-Z0-9+/=]+/g);
        if (matches) {
          for (const m of matches) {
            const dec = decodeB64(m);
            if (dec) {
              bypassedUrl = dec;
              break;
            }
          }
        }
      }
    } catch (e) {}

    // Engine 2: Resolver VIP External
    if (!bypassedUrl) {
      try {
        const r1 = await fetch(`https://api.bypass.vip/bypass?url=${encodeURIComponent(cleanUrl)}`);
        const d1 = await r1.json();
        const dest = d1?.destination || d1?.result;
        if (dest && !dest.includes('sfl.gl') && !dest.includes('safelinku')) {
          bypassedUrl = dest;
        }
      } catch (e) {}
    }

    // Engine 3: Resolver City External
    if (!bypassedUrl) {
      try {
        const r2 = await fetch(`https://bypass.city/api/bypass?url=${encodeURIComponent(cleanUrl)}`);
        const d2 = await r2.json();
        if (d2?.destination && !d2.destination.includes('sfl.gl') && !d2.destination.includes('safelinku')) {
          bypassedUrl = d2.destination;
        }
      } catch (e) {}
    }

    // Validasi Akhir
    if (!bypassedUrl || bypassedUrl.includes('sfl.gl') || bypassedUrl.includes('safelinku')) {
      return res.status(400).json({
        status: false,
        message: "Gagal mengekstrak link asli dari Safelinku."
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
