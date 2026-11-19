// ID: ext_mangasusuku
// NAME: MangaSusuku
// TYPE: comic
// VERSION: 1.0.1
// COLOR: #7C4DFF
// ICON: https://mangasusuku.com/favicon.ico
// REFERER: https://mangasusuku.com/

const BASE = "https://mangasusuku.com";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Referer": BASE + "/"
};

function cleanText(str) {
  if (!str) return "";
  return str
    .replace(/<[^>]+>/g, " ")
    .replace(/&#8211;/g, "–")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractImg(block) {
  const lazy = block.match(/data-lazy-src=["']([^"']+)["']/i);
  if (lazy && !lazy[1].startsWith("data:image")) return lazy[1].trim();
  const dsrc = block.match(/data-src=["']([^"']+)["']/i);
  if (dsrc && !dsrc[1].startsWith("data:image")) return dsrc[1].trim();
  const src = block.match(/src=["']([^"']+)["']/i);
  if (src && !src[1].startsWith("data:image")) return src[1].trim();
  return "";
}

function absUrl(url) {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return BASE + url;
  return BASE + "/" + url;
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return await res.text();
}

var KonmikExtension = {
  async getList(page, query, filters) {
    page = page || 1;
    let url = "";
    if (query && query.trim().length > 0) {
      const q = encodeURIComponent(query.trim());
      // Coba 2 format search, yang umum di web ini
      url = page > 1 ? `${BASE}/page/${page}/?s=${q}` : `${BASE}/?s=${q}`;
    } else {
      // FIX UTAMA: Jangan pake /manga/?page= , pake /page/ dan /manga-list/
      if (filters && filters.sort === "popular") {
        url = page > 1 ? `${BASE}/manga-list/page/${page}/?order=popular` : `${BASE}/manga-list/?order=popular`;
      } else {
        url = page > 1 ? `${BASE}/page/${page}/` : `${BASE}/`;
      }
    }

    const html = await fetchHtml(url);
    const mangaList = [];
    const seen = new Set();

    // CARA BARU: Cari semua link yang ke /manga/ , gak peduli class-nya apa
    // Ini yang bikin tadi kosong, karena lu cuma nyari div class="bsx"
    const linkRegex = /<a[^>]+href=["']([^"']*\/manga\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      let href = m[1];
      // Skip link chapter, cuma ambil link detail manga
      if (href.includes("/chapter") || href.match(/\/manga\/[^\/]+\/[^\/]+\/?$/i) && href.split("/manga/")[1].split("/").filter(Boolean).length > 1) continue;
      if (href.includes("?") || href.endsWith("/manga/") || href.endsWith("/manga-list/")) continue;

      href = href.split("?")[0];
      if (seen.has(href)) continue;
      seen.add(href);

      const inner = m[2];
      let title = "";
      const titleAttr = m[0].match(/title=["']([^"']+)["']/i);
      if (titleAttr) title = cleanText(titleAttr[1]);
      if (!title) title = cleanText(inner);
      // Buang judul yang kepanjangan / isinya chapter
      if (!title || title.length < 2 || title.length > 150) continue;
      if (/chapter|chapter/i.test(title) && title.length > 60) continue;

      let cover = extractImg(inner);
      // Kalau cover kosong, coba cari img di sekitar link (biasanya di parent div)
      if (!cover) {
        const idx = html.indexOf(m[0]);
        const around = html.substring(Math.max(0, idx - 500), idx + 500);
        cover = extractImg(around);
      }

      mangaList.push({
        id: absUrl(href),
        title: title,
        cover_url: absUrl(cover),
        latest_chapter: "-",
        rating: "-",
        views: "-"
      });
      if (mangaList.length >= 30) break;
    }

    // FALLBACK: Kalau masih 0, coba cara lama bsx
    if (mangaList.length === 0) {
      const parts = html.split(/<div class=["']bsx["']>/i);
      for (let i = 1; i < parts.length; i++) {
        const block = parts[i];
        const linkMatch = block.match(/<a[^>]+href=["']([^"']+)["']/i);
        if (!linkMatch) continue;
        const href = linkMatch[1];
        if (seen.has(href)) continue;
        seen.add(href);
        const ttMatch = block.match(/<div class=["']tt["'][^>]*>([\s\S]*?)<\/div>/i);
        const title = cleanText(ttMatch ? ttMatch[1] : "");
        if (!title) continue;
        mangaList.push({
          id: absUrl(href),
          title: title,
          cover_url: absUrl(extractImg(block)),
          latest_chapter: "-",
          rating: "-",
          views: "-"
        });
      }
    }

    return { manga_list: mangaList };
  },

  async getDetail(slug) {
    const url = slug.startsWith("http") ? slug : absUrl(slug);
    const html = await fetchHtml(url);

    const titleMatch = html.match(/<h1 class=["']entry-title["'][^>]*>([\s\S]*?)<\/h1>/i)
      || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = titleMatch ? cleanText(titleMatch[1]) : "Unknown Title";

    const thumbBlock = html.match(/<div class=["']thumb["'][^>]*>([\s\S]*?)<\/div>/i);
    let cover = thumbBlock ? extractImg(thumbBlock[1]) : "";
    if (!cover) {
      const og = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
      if (og) cover = og[1];
    }

    const descMatch = html.match(/<div class=["']entry-content entry-content-single["'][^>]*>([\s\S]*?)<\/div>/i)
      || html.match(/<div class=["']entry-content["'][^>]*>([\s\S]*?)<\/div>/i);
    const description = descMatch ? cleanText(descMatch[1]) : "Tidak ada sinopsis.";

    const authorMatch = html.match(/(?:Author|Pengarang)<\/b>\s*<span>([\s\S]*?)<\/span>/i);
    const artistMatch = html.match(/(?:Artist|Ilustrator)<\/b>\s*<span>([\s\S]*?)<\/span>/i);
    const ratingMatch = html.match(/<div class=["']num["'][^>]*>([\s\S]*?)<\/div>/i);

    const genres = [];
    const genreBlock = html.match(/<span class=["']mgen["']>([\s\S]*?)<\/span>/i);
    if (genreBlock) {
      const gRegex = /<a[^>]*>([^<]+)<\/a>/gi;
      let gm;
      while ((gm = gRegex.exec(genreBlock[1])) !== null) {
        const g = cleanText(gm[1]);
        if (g && !genres.includes(g)) genres.push(g);
      }
    }

    const chapters = [];
    const chSection = html.match(/<div id=["']chapterlist["'][^>]*>([\s\S]*?)<\/div>/i);
    const sourceHtml = chSection ? chSection[1] : html;
    const chRegex = /<li[^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?<span class=["']chapternum["'][^>]*>([\s\S]*?)<\/span>[\s\S]*?<span class=["']chapterdate["'][^>]*>([\s\S]*?)<\/span>/gi;
    let cm;
    const seenCh = new Set();
    while ((cm = chRegex.exec(sourceHtml)) !== null) {
      const chUrl = cm[1];
      if (seenCh.has(chUrl)) continue;
      seenCh.add(chUrl);
      chapters.push({ id: chUrl, title: cleanText(cm[2]), endpoint: chUrl, date: cleanText(cm[3]) });
    }
    // Fallback chapter: cari link /chapter/ atau /manga/xxx/chapter
    if (chapters.length === 0) {
      const chRegex2 = /<a[^>]+href=["']([^"']*\/[^"']*chapter[^"']*)["'][^>]*>([^<]+)<\/a>/gi;
      let cm2;
      while ((cm2 = chRegex2.exec(html)) !== null) {
        if (seenCh.has(cm2[1])) continue;
        seenCh.add(cm2[1]);
        chapters.push({ id: cm2[1], title: cleanText(cm2[2]), endpoint: cm2[1], date: "-" });
      }
    }

    return {
      title: title,
      cover_url: absUrl(cover),
      description: description,
      author: authorMatch ? cleanText(authorMatch[1]) : "-",
      artist: artistMatch ? cleanText(artistMatch[1]) : "-",
      rating: ratingMatch ? cleanText(ratingMatch[1]) : "-",
      views: "-",
      genres: genres.length ? genres : ["Komik"],
      chapters: chapters
    };
  },

  async getChapterImages(endpoint) {
    const url = endpoint.startsWith("http") ? endpoint : absUrl(endpoint);
    const html = await fetchHtml(url);
    const tsMatch = html.match(/ts_reader\.run\(\s*(\{[\s\S]*?\})\s*\);/i);
    if (tsMatch) {
      try {
        const data = JSON.parse(tsMatch[1]);
        if (data.sources && data.sources[0] && Array.isArray(data.sources[0].images)) {
          return data.sources[0].images.filter(Boolean);
        }
      } catch (e) {}
    }
    const readerMatch = html.match(/<div id=["']readerarea["'][^>]*>([\s\S]*?)<\/div>/i);
    const areaHtml = readerMatch ? readerMatch[1] : html;
    const images = [];
    const imgRegex = /<img[^>]+(?:data-lazy-src|data-src|src)=["']([^"']+)["'][^>]*>/gi;
    let im;
    while ((im = imgRegex.exec(areaHtml)) !== null) {
      const imgUrl = im[1].trim();
      if (imgUrl && !imgUrl.startsWith("data:image") && !images.includes(imgUrl)) {
        images.push(absUrl(imgUrl));
      }
    }
    return images;
  }
};
