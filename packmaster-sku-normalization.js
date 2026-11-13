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
  // Invisible characters that PDFs and marketplace copies add or drop without
  // changing the words: soft hyphen, zero-width space/non-joiner/joiner, word
  // joiner, and byte-order mark.
  const INVISIBLE_CHARACTERS = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g;

  function stripInvisible(value) {
    return typeof value === 'string' ? value.replace(INVISIBLE_CHARACTERS, '') : '';
  }

  // Seller SKU rule and canonical display form. Whitespace runs collapse to one
  // space; a space is never deleted, so SKUs that differ by one internal space
  // stay distinct. Invisible characters are removed before anything else.
  function normalizeSellerSku(value) {
    if (typeof value !== 'string') return '';
    return repairThaiPdfGlyphs(stripInvisible(value))
      .normalize('NFKC')
      // Thai PDFs may emit nikhahit before a tone mark while marketplace text
      // stores the same visible syllable as tone mark + nikhahit.
      .replace(/\u0E4D([\u0E48-\u0E4B])/g, '$1\u0E4D')
      .replace(/\s+/g, ' ')
      .trim()
      // PDF text may insert a space between a quantity and its pack or sheet unit.
      .replace(/([0-9])\s+(ห่อ|แผ่น)(?=$|[\s,|])/gu, '$1$2')
      .toUpperCase();
  }

  // Key for catalog text, alias text and Local product text (not for Seller SKU).
  // Spaces are removed, except a space between two digits, which keeps numbers
  // apart ("1 2" is not "12"). Texts that differ only by spaces, line breaks,
  // NBSP or invisible characters get the same key.
  // Thai digits count too, so "๑ ๒" keeps its space and is not "๑๒".
  const isDigit = character => character !== undefined && /[0-9๐-๙]/.test(character);
  function normalizeMatchKey(value) {
    return normalizeSellerSku(value).replace(/ /g, (space, offset, text) =>
      isDigit(text[offset - 1]) && isDigit(text[offset + 1]) ? ' ' : '');
  }

  // Kept as a name for existing callers; it is the same rule, not a second one.
  const normalizeCatalogText = normalizeMatchKey;

  // Thai text skeleton for the fuzzy-safe fallback. It bridges PDF glitches: tone marks and
  // above/below vowels that PDFs reorder are stripped, so their order does not matter.
  // Numbers stay apart: Thai digits become ASCII digits, and '.', '+', '/' and a space are kept
  // only between two digits (1.5 is not 15, 5+5 is not 55, 1 2 is not 12). Leading vowels
  // (U+0E40 to U+0E44) are kept. Everything else that is not a Thai consonant, A-Z or 0-9 is dropped.
  function normalizeThaiSkeleton(value) {
    if (typeof value !== 'string') return '';
    const withAsciiDigits = repairThaiPdfGlyphs(stripInvisible(value))
      // PDF-font quirk: a doubled sara e is read as \u0E41.
      .replace(/\u0E40\u0E40/g, '\u0E41')
      .replace(/[\u0E50-\u0E59]/g, glyph => String.fromCharCode(glyph.charCodeAt(0) - 0x0E50 + 0x30))
      .replace(/\s+/g, ' ')
      .normalize('NFKD')
      .replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '')
      .normalize('NFKC')
      // A space around a digit separator is not kept ("5 + 5" is "5+5"), as in normalizeMatchKey.
      .replace(/([0-9]) ?([.+\/]) ?(?=[0-9])/g, '$1$2');
    return withAsciiDigits
      .replace(/(?<=[0-9])([.+\/ ])(?=[0-9])|[^A-Z0-9\u0E00-\u0E2E\u0E40-\u0E44]/gi, (match, separator) => separator ?? '')
      .toUpperCase();
  }

  return { cleanPdfSellerSku, normalizeSellerSku, normalizeMatchKey, normalizeCatalogText, normalizeThaiSkeleton, repairThaiPdfGlyphs, stripInvisible };
});
