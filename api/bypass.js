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

    // Helper validasi URL asli (memfilter teks error / pesan shutdown)
    const isValidDestination = (url) => {
      if (!url || typeof url !== 'string') return false;
      if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
      const invalidKeywords = ['sfl.gl', 'safelinku', 'bypass.vip', 'discord', 'SHUT DOWN', 'LEECHERS'];
      return !invalidKeywords.some(kw => url.toLowerCase().includes(kw.toLowerCase()));
    };

    // Helper Dekoder Base64
    const decodeB64 = (str) => {
      try {
        let pad = str;
        while (pad.length % 4 !== 0) pad += '=';
        const decoded = Buffer.from(pad, 'base64').toString('utf-8');
        if (isValidDestination(decoded)) return decoded;
      } catch (e) {}
      return null;
    };

    // Engine 1: Bypass.city API
    try {
      const r2 = await fetch(`https://bypass.city/api/bypass?url=${encodeURIComponent(cleanUrl)}`);
      const d2 = await r2.json();
      const dest = d2?.destination || d2?.result;
      if (isValidDestination(dest)) {
        bypassedUrl = dest;
      }
    } catch (e) {}

    // Engine 2: Direct Redirect & Query Parameter (Base64)
    if (!bypassedUrl) {
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
        if (isValidDestination(finalUrl)) {
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
    }

    // Engine 3: Native AdLinkFly Parser (POST /links/go)
    if (!bypassedUrl) {
      try {
        const resInit = await fetch(cleanUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html'
          }
        });
        const html = await resInit.text();
        const setCookie = resInit.headers.get('set-cookie');
        
        const csrf = html.match(/name="_csrfToken"\s+value="([^"]+)"/i)?.[1];
        const adData = html.match(/name="ad_form_data"\s+value="([^"]+)"/i)?.[1];

        if (csrf && adData) {
          const body = new URLSearchParams();
          body.append('_csrfToken', csrf);
          body.append('ad_form_data', adData);

          const parsedUrl = new URL(resInit.url);
          const postRes = await fetch(`${parsedUrl.origin}/links/go`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'X-Requested-With': 'XMLHttpRequest',
              'Referer': resInit.url,
              'Cookie': setCookie || ''
            },
            body: body.toString()
          });
          const postData = await postRes.json();
          if (isValidDestination(postData?.url)) {
            bypassedUrl = postData.url;
          }
        }
      } catch (e) {}
    }

    // Validasi Akhir
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
