module.exports = async function handler(req, res) {
  // Anti Cache & CORS Header
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-api-key');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();

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

    // Engine 1: Resolver External VIP
    try {
      const r1 = await fetch(`https://api.bypass.vip/bypass?url=${encodeURIComponent(cleanUrl)}`);
      const d1 = await r1.json();
      if (d1?.destination && !d1.destination.includes('sfl.gl') && !d1.destination.includes('safelinku')) {
        bypassedUrl = d1.destination;
      }
    } catch (e) {}

    // Engine 2: Resolver External City
    if (!bypassedUrl) {
      try {
        const r2 = await fetch(`https://bypass.city/api/bypass?url=${encodeURIComponent(cleanUrl)}`);
        const d2 = await r2.json();
        if (d2?.destination && !d2.destination.includes('sfl.gl') && !d2.destination.includes('safelinku')) {
          bypassedUrl = d2.destination;
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
          if (postData?.url && !postData.url.includes('sfl.gl')) {
            bypassedUrl = postData.url;
          }
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
