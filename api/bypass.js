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

    const isValidDestination = (url) => {
      if (!url || typeof url !== 'string') return false;
      if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
      const invalidKeywords = ['sfl.gl', 'safelinku', 'bypass.vip', 'discord', 'SHUT DOWN', 'LEECHERS', 'tutwuri.id', 'safelinkku.com', 'wpsafelink'];
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
    } catch (e) {}

    // Engine 2: Deep HTML & Dynamic Form Resolver
    if (!bypassedUrl) {
      try {
        const fetchRes = await fetch(cleanUrl, {
          method: 'GET',
          redirect: 'follow',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5'
          }
        });

        const finalUrl = fetchRes.url;
        if (isValidDestination(finalUrl)) {
          bypassedUrl = finalUrl;
        }

        if (!bypassedUrl) {
          const html = await fetchRes.text();
          const cookieHeader = fetchRes.headers.get('set-cookie') || '';

          // Ekstraksi Base64 dari kode script HTML
          const b64Matches = html.match(/(?:aHR0c[a-zA-Z0-9+/=]+)/g) || [];
          for (const m of b64Matches) {
            const dec = decodeB64(m);
            if (dec) {
              bypassedUrl = dec;
              break;
            }
          }

          // Ekstraksi Form AJAX AdLinkFly / Safelinku
          if (!bypassedUrl) {
            const csrf = html.match(/name="_csrfToken"\s+value="([^"]+)"/i)?.[1] || html.match(/name="csrfToken"\s+value="([^"]+)"/i)?.[1];
            const adData = html.match(/name="ad_form_data"\s+value="([^"]+)"/i)?.[1];
            const tokenFields = html.match(/name="_Token\[fields\]"\s+value="([^"]+)"/i)?.[1];

            if (csrf && adData) {
              const body = new URLSearchParams();
              body.append('_csrfToken', csrf);
              body.append('ad_form_data', adData);
              if (tokenFields) body.append('_Token[fields]', tokenFields);

              const parsedUrl = new URL(finalUrl || cleanUrl);
              const postRes = await fetch(`${parsedUrl.origin}/links/go`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                  'X-Requested-With': 'XMLHttpRequest',
                  'Referer': finalUrl,
                  'Cookie': cookieHeader,
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                body: body.toString()
              });

              const postData = await postRes.json();
              if (isValidDestination(postData?.url)) {
                bypassedUrl = postData.url;
              }
            }
          }
        }
      } catch (e) {}
    }

    // Engine 3: Worker Resolver Backup
    if (!bypassedUrl) {
      try {
        const r3 = await fetch(`https://api.exray.workers.dev/bypass?url=${encodeURIComponent(cleanUrl)}`);
        const d3 = await r3.json();
        if (isValidDestination(d3?.url)) bypassedUrl = d3.url;
      } catch (e) {}
    }

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
