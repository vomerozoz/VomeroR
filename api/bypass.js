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

    const baseHeaders = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none'
    };

    // 1. Request Halaman Awal Shortener
    const response = await fetch(currentUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: baseHeaders
    });

    const finalUrl = response.url;
    const html = await response.text();
    let bypassedUrl = null;

    // 2. Ekstraksi Form AJAX Safelinku/AdLinkFly (POST ke /links/go)
    if (html.includes('links/go') || html.includes('ad_form_data') || html.includes('_csrfToken')) {
      try {
        const setCookie = response.headers.get('set-cookie');
        
        const csrfMatch = html.match(/name="_csrfToken"\s+value="([^"]+)"/i) || html.match(/"_csrfToken"\s*:\s*"([^"]+)"/i);
        const adDataMatch = html.match(/name="ad_form_data"\s+value="([^"]+)"/i) || html.match(/ad_form_data\s*=\s*["']([^"']+)["']/i);
        const tokenFieldsMatch = html.match(/name="_Token\[fields\]"\s+value="([^"]+)"/i);
        const tokenUnlockedMatch = html.match(/name="_Token\[unlocked\]"\s+value="([^"]+)"/i);

        const formData = new URLSearchParams();
        if (csrfMatch) formData.append('_csrfToken', csrfMatch[1]);
        if (adDataMatch) formData.append('ad_form_data', adDataMatch[1]);
        if (tokenFieldsMatch) formData.append('_Token[fields]', tokenFieldsMatch[1]);
        if (tokenUnlockedMatch) formData.append('_Token[unlocked]', tokenUnlockedMatch[1]);

        const urlObj = new URL(finalUrl);
        const goUrl = `${urlObj.origin}/links/go`;

        const postHeaders = {
          ...baseHeaders,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': finalUrl,
          'Origin': urlObj.origin
        };
        if (setCookie) postHeaders['Cookie'] = setCookie;

        const goResponse = await fetch(goUrl, {
          method: 'POST',
          headers: postHeaders,
          body: formData.toString()
        });

        const goJson = await goResponse.json().catch(() => null);
        if (goJson && goJson.url) {
          bypassedUrl = goJson.url;
        }
      } catch (e) {}
    }

    // 3. Ekstraksi Base64 URL (aHR0cD...) dari HTML
    if (!bypassedUrl) {
      const b64Regex = /aHR0c[a-zA-Z0-9+/=]+/g;
      const b64Matches = html.match(b64Regex);

      if (b64Matches) {
        for (const match of b64Matches) {
          try {
            let padMatch = match;
            while (padMatch.length % 4 !== 0) padMatch += '=';
            const decoded = Buffer.from(padMatch, 'base64').toString('utf-8');
            if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
              if (!decoded.includes('sfl.gl') && !decoded.includes('safelinku') && !decoded.includes('tutwuri')) {
                bypassedUrl = decoded;
                break;
              }
            }
          } catch (e) {}
        }
      }
    }

    // 4. Ekstraksi dari window.location
    if (!bypassedUrl) {
      const jsMatch = html.match(/(?:window\.location(?:\.href)?|location\.href)\s*=\s*["']([^"']+)["']/i);
      if (jsMatch && jsMatch[1]) {
        const loc = jsMatch[1];
        if (loc.startsWith('http') && !loc.includes('sfl.gl') && !loc.includes('safelinku')) {
          bypassedUrl = loc;
        }
      }
    }

    // Validasi Akhir: Jika gagal atau masih link shortener, beri respons gagal
    if (!bypassedUrl || bypassedUrl.includes('sfl.gl') || bypassedUrl.includes('safelinku')) {
      return res.status(422).json({
        status: false,
        message: "Gagal mengekstrak link asli. Shortener mengunci link atau dilindungi proteksi bot."
      });
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
