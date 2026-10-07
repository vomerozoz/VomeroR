module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-api-key');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const secretKey = req.headers['x-api-key'] || req.query.apikey || req.body?.apikey;
  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : (req.query.url || req.body?.url);
  const isDebug = req.query.debug === 'true';
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

    const decodeB64 = (str) => {
      try {
        let pad = str.trim();
        while (pad.length % 4 !== 0) pad += '=';
        const decoded = Buffer.from(pad, 'base64').toString('utf-8');
        if (isValidDestination(decoded)) return decoded;
      } catch (e) {}
      return null;
    };

    // Engine 1: Public Bypass APIs
    const apis = [
      `https://bypass.city/api/bypass?url=${encodeURIComponent(cleanUrl)}`,
      `https://api.exray.workers.dev/bypass?url=${encodeURIComponent(cleanUrl)}`
    ];

    for (const apiUrl of apis) {
      try {
        const r = await fetch(apiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const d = await r.json();
        const dest = d?.destination || d?.result || d?.url;
        if (isValidDestination(dest)) {
          bypassedUrl = dest;
          logs.push(`API Success: ${apiUrl} -> ${dest}`);
          break;
        }
      } catch (e) {
        logs.push(`API Fail: ${apiUrl}`);
      }
    }

    // Engine 2: Multi-Proxy HTML Extraction
    if (!bypassedUrl) {
      const targets = [
        cleanUrl,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(cleanUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(cleanUrl)}`
      ];

      for (const target of targets) {
        try {
          const fetchRes = await fetch(target, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
          });

          const finalUrl = fetchRes.url;
          if (isValidDestination(finalUrl)) {
            bypassedUrl = finalUrl;
            logs.push(`Direct Redirect: ${finalUrl}`);
            break;
          }

          const html = await fetchRes.text();
          logs.push(`Target ${target} HTML Len: ${html.length}`);

          // Cari Base64
          const b64Matches = html.match(/aHR0c[a-zA-Z0-9+/=]+/g) || [];
          for (const m of b64Matches) {
            const dec = decodeB64(m);
            if (dec) {
              bypassedUrl = dec;
              logs.push(`Base64 Found: ${bypassedUrl}`);
              break;
            }
          }
          if (bypassedUrl) break;

          // Cari JS variables & href
          const urlMatches = html.match(/(?:href|url|location|go_url|link)["']?\s*[:=]\s*["'](https?:\/\/[^"'\s]+)["']/gi) || [];
          for (const match of urlMatches) {
            const extracted = match.match(/https?:\/\/[^"'\s]+/i)?.[0];
            if (isValidDestination(extracted)) {
              bypassedUrl = extracted;
              logs.push(`JS Link Found: ${bypassedUrl}`);
              break;
            }
          }
          if (bypassedUrl) break;

        } catch (e) {
          logs.push(`Fetch Err: ${e.message}`);
        }
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
