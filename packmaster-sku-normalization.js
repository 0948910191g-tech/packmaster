(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterSkuNormalization = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Microsoft/NECTEC Windows Thai font substitutions used by some PDF exporters.
  // These PUA glyphs are presentation variants, not distinct SKU characters.
  const thaiPdfCharacters = new Map([
    [0xF700, 0x0E10],
    [0xF701, 0x0E34], [0xF702, 0x0E35], [0xF703, 0x0E36],
    [0xF704, 0x0E37], [0xF705, 0x0E48], [0xF706, 0x0E49],
    [0xF707, 0x0E4A], [0xF708, 0x0E4B], [0xF709, 0x0E4C],
    [0xF70A, 0x0E48], [0xF70B, 0x0E49], [0xF70C, 0x0E4A],
    [0xF70D, 0x0E4B], [0xF70E, 0x0E4C], [0xF70F, 0x0E0D],
    [0xF710, 0x0E31], [0xF711, 0x0E4D], [0xF712, 0x0E47],
    [0xF713, 0x0E48], [0xF714, 0x0E49], [0xF715, 0x0E4A],
    [0xF716, 0x0E4B], [0xF717, 0x0E4C], [0xF718, 0x0E38],
    [0xF719, 0x0E39], [0xF71A, 0x0E3A]
  ]);

  function repairThaiPdfGlyphs(text) {
    return text.replace(/[\uF700-\uF71A]/g, glyph => {
      const replacement = thaiPdfCharacters.get(glyph.codePointAt(0));
      return replacement === undefined ? glyph : String.fromCodePoint(replacement);
    });
  }

  // Footer content from the last label row may be assigned to the Seller SKU
  // column by PDF text-position extraction. Remove ONLY known, labelled fields.
  function cleanPdfSellerSku(value) {
    if (typeof value !== 'string') return '';
    const footer = /(?:^|\s)(?:Qty\s*Total|Order\s*ID|Shipping\s*Date|Estimated\s*Date)\s*:/i.exec(value);
    return (footer ? value.slice(0, footer.index) : value).trim();
  }

  // Exact SKU comparison with typographic PDF variations normalized. Never
  // infer an SKU from product titles, keyword rules, or loose substrings.
  function normalizeSellerSku(value) {
    if (typeof value !== 'string') return '';
    return repairThaiPdfGlyphs(value)
      .normalize('NFKC')
      // Thai PDFs may emit nikhahit before a tone mark while marketplace text
      // stores the same visible syllable as tone mark + nikhahit.
      .replace(/\u0E4D([\u0E48-\u0E4B])/g, '$1\u0E4D')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      // PDF text may insert a space between a quantity and its pack or sheet unit.
      .replace(/([0-9])\s+(ห่อ|แผ่น)(?=$|[\s,|])/gu, '$1$2')
      .toUpperCase();
  }

  function normalizeCatalogText(value) {
    return normalizeSellerSku(value).replace(/\s+/g, '');
  }

  // Thai text skeleton for fuzzy-safe fallback: strips Thai vowels/tones/diacritics
  // and non-alphanumeric chars to bridge PDF font extraction glitches and reordered marks.
  function normalizeThaiSkeleton(value) {
    if (typeof value !== 'string') return '';
    return repairThaiPdfGlyphs(value)
      .normalize('NFKD')
      .replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '')
      .normalize('NFKC')
      .replace(/[^A-Z0-9\u0E00-\u0E2E]/gi, '')
      .toUpperCase();
  }

  return { cleanPdfSellerSku, normalizeSellerSku, normalizeCatalogText, normalizeThaiSkeleton, repairThaiPdfGlyphs };
});
