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
      const invalidKeywords = ['sfl.gl', 'safelinku', 'bypass.vip', 'discord', 'SHUT DOWN', 'LEECHERS', 'tutwuri.id', 'safelinkku.com', 'wpsafelink', 'google.com/search'];
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

    // Engine 1: Bypass.city API
    try {
      const r1 = await fetch(`https://bypass.city/api/bypass?url=${encodeURIComponent(cleanUrl)}`);
      const d1 = await r1.json();
      const dest = d1?.destination || d1?.result;
      if (isValidDestination(dest)) bypassedUrl = dest;
      logs.push(`Engine1 Result: ${dest || 'null'}`);
    } catch (e) {
      logs.push(`Engine1 Error: ${e.message}`);
    }

    // Engine 2: Deep Redirect & Script Extraction
    if (!bypassedUrl) {
      try {
        const fetchRes = await fetch(cleanUrl, {
          method: 'GET',
          redirect: 'follow',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8'
          }
        });

        const finalUrl = fetchRes.url;
        logs.push(`Final URL: ${finalUrl}`);

        if (isValidDestination(finalUrl)) {
          bypassedUrl = finalUrl;
        } else {
          const html = await fetchRes.text();
          logs.push(`HTML Length: ${html.length}`);

          // Cari tautan langsung dalam tag script (var go_url / location.href)
          const scriptMatches = html.match(/(?:href|url|location|go_url)["']?\s*[:=]\s*["'](https?:\/\/[^"'\s]+)["']/gi) || [];
          for (const match of scriptMatches) {
            const extracted = match.match(/https?:\/\/[^"'\s]+/i)?.[0];
            if (isValidDestination(extracted)) {
              bypassedUrl = extracted;
              logs.push(`Found in script: ${bypassedUrl}`);
              break;
            }
          }

          // Dekode Base64 dalam HTML
          if (!bypassedUrl) {
            const b64Matches = html.match(/aHR0c[a-zA-Z0-9+/=]+/g) || [];
            for (const m of b64Matches) {
              const dec = decodeB64(m);
              if (dec) {
                bypassedUrl = dec;
                logs.push(`Found Base64: ${bypassedUrl}`);
                break;
              }
            }
          }

          // Ekstraksi Form AJAX
          if (!bypassedUrl) {
            const csrf = html.match(/name="_csrfToken"\s+value="([^"]+)"/i)?.[1] || html.match(/name="csrfToken"\s+value="([^"]+)"/i)?.[1];
            const adData = html.match(/name="ad_form_data"\s+value="([^"]+)"/i)?.[1];

            if (csrf && adData) {
              const body = new URLSearchParams();
              body.append('_csrfToken', csrf);
              body.append('ad_form_data', adData);

              const parsedUrl = new URL(finalUrl || cleanUrl);
              const postRes = await fetch(`${parsedUrl.origin}/links/go`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                  'X-Requested-With': 'XMLHttpRequest',
                  'Referer': finalUrl,
                  'Cookie': fetchRes.headers.get('set-cookie') || '',
                  'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36'
                },
                body: body.toString()
              });

              const postData = await postRes.json().catch(() => ({}));
              if (isValidDestination(postData?.url)) {
                bypassedUrl = postData.url;
              }
              logs.push(`AJAX POST Result: ${JSON.stringify(postData)}`);
            }
          }
        }
      } catch (e) {
        logs.push(`Engine2 Error: ${e.message}`);
      }
    }

    if (!isValidDestination(bypassedUrl)) {
      return res.status(400).json({
        status: false,
        message: "Gagal mengekstrak link asli dari Safelinku.",
        debug_info: isDebug ? logs : undefined
      });
    }

    return res.status(200).json({
      status: true,
      original_url: cleanUrl,
      result: bypassedUrl,
      debug_info: isDebug ? logs : undefined
    });

  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Gagal memproses bypass link",
      error: err.message
    });
  }
};
