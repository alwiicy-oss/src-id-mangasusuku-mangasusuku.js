// ID: ext_mangasusuku
// NAME: MangaSusuku
// TYPE: comic
// VERSION: 1.0.0
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
      url = page > 1 ? `${BASE}/page/${page}/?s=${q}` : `${BASE}/?s=${q}`;
    } else {
      const order = filters && filters.sort === "popular" ? "popular" : "update";
      url = `${BASE}/manga/?page=${page}&order=${order}`;
    }

    const html = await fetchHtml(url);
    const mangaList = [];
    const seen = new Set();
    const parts = html.split(/<div class=["']bsx["']>/i);

    for (let i = 1; i < parts.length; i++) {
      const block = parts[i].split(/<\/div>\s*<\/div>/i)[0] || parts[i];
      const linkMatch = block.match(/<a[^>]+href=["']([^"']+)["'][^>]*>/i);
      if (!linkMatch) continue;

      const href = linkMatch[1];
      if (seen.has(href)) continue;
      seen.add(href);

      const titleAttr = block.match(/title=["']([^"']+)["']/i);
      const ttMatch = block.match(/<div class=["']tt["'][^>]*>([\s\S]*?)<\/div>/i);
      const title = cleanText(ttMatch ? ttMatch[1] : (titleAttr ? titleAttr[1] : ""));
      if (!title) continue;

      const chMatch = block.match(/<div class=["']epxs["'][^>]*>([\s\S]*?)<\/div>/i);
      const scoreMatch = block.match(/<div class=["']numscore["'][^>]*>([\s\S]*?)<\/div>/i);

      mangaList.push({
        id: absUrl(href),
        title: title,
        cover_url: absUrl(extractImg(block)),
        latest_chapter: chMatch ? cleanText(chMatch[1]) : "-",
        rating: scoreMatch ? cleanText(scoreMatch[1]) : "-",
        views: "-"
      });
    }

    return { manga_list: mangaList };
  },

  async getDetail(slug) {
    const url = slug.startsWith("http") ? slug : `${BASE}/manga/${slug}/`;
    const html = await fetchHtml(url);

    const titleMatch = html.match(/<h1 class=["']entry-title["'][^>]*>([\s\S]*?)<\/h1>/i);
    const title = titleMatch ? cleanText(titleMatch[1]) : "Unknown Title";

    const thumbBlock = html.match(/<div class=["']thumb["'][^>]*>([\s\S]*?)<\/div>/i);
    let cover = thumbBlock ? extractImg(thumbBlock[1]) : "";
    if (!cover) {
      const og = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
      if (og) cover = og[1];
    }

    const descMatch = html.match(/<div class=["']entry-content entry-content-single["'][^>]*>([\s\S]*?)<\/div>/i);
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
      chapters.push({
        id: chUrl,
        title: cleanText(cm[2]),
        endpoint: chUrl,
        date: cleanText(cm[3])
      });
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
    const url = endpoint.startsWith("http") ? endpoint : `${BASE}/${endpoint}`;
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
