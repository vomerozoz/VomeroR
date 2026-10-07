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

    // Tapis URL supaya tidak menganggap pautan ralat/block sebagai hasil berjaya
    const isValidDestination = (url) => {
      if (!url || typeof url !== 'string') return false;
      if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
      const invalidKeywords = [
        'sfl.gl', 'safelinku', 'bypass.vip', 'discord', 'shutdown', 'leechers', 
        'tutwuri.id', 'safelinkku.com', 'wpsafelink', 'google.com', 'cloudflare.com', 'error-1005'
      ];
      return !invalidKeywords.some(kw => url.toLowerCase().includes(kw));
    };

    const decodeB64 = (str) => {
      try {
        let pad = str.trim();
        while (pad.length % 4 !== 0) pad += '=';
        const decoded = Buffer.from(pad, 'base64').toString('utf-8');
        if (isValidDestination(decoded)) return decoded;
      } catch (e) {}
      return null;
    };

    // Engine 1: External Resolver (Bypass City)
    try {
      const r1 = await fetch(`https://bypass.city/api/bypass?url=${encodeURIComponent(cleanUrl)}`);
      const d1 = await r1.json();
      const dest = d1?.destination || d1?.result;
      if (isValidDestination(dest)) bypassedUrl = dest;
    } catch (e) {}

    // Engine 2: Proxy Fetching (Melepasi Sekatan Cloudflare IP Vercel)
    if (!bypassedUrl) {
      const proxyList = [
        `https://corsproxy.io/?${encodeURIComponent(cleanUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(cleanUrl)}`
      ];

      for (const proxy of proxyList) {
        try {
          const fetchRes = await fetch(proxy, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            }
          });

          const finalUrl = fetchRes.url;
          if (isValidDestination(finalUrl)) {
            bypassedUrl = finalUrl;
            break;
          }

          const html = await fetchRes.text();

          // Dekod Base64 tersembunyi
          const b64Matches = html.match(/aHR0c[a-zA-Z0-9+/=]+/g) || [];
          for (const m of b64Matches) {
            const dec = decodeB64(m);
            if (dec) {
              bypassedUrl = dec;
              break;
            }
          }
          if (bypassedUrl) break;

          // Ekstrak pautan daripada skrip JS (var go_url / location.href)
          const scriptMatches = html.match(/(?:href|url|location|go_url)["']?\s*[:=]\s*["'](https?:\/\/[^"'\s]+)["']/gi) || [];
          for (const match of scriptMatches) {
            const extracted = match.match(/https?:\/\/[^"'\s]+/i)?.[0];
            if (isValidDestination(extracted)) {
              bypassedUrl = extracted;
              break;
            }
          }
          if (bypassedUrl) break;

        } catch (e) {}
      }
    }

    // Pengesahan Akhir
    if (!isValidDestination(bypassedUrl)) {
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
