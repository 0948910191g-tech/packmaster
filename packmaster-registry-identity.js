(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports
    ? require('./packmaster-sku-normalization.js')
    : root.PackMasterSkuNormalization);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterRegistryIdentity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (skuNormalization) {
  'use strict';

  if (!skuNormalization) throw new Error('Seller SKU normalization module is required');
  const PLATFORMS = ['TIKTOK', 'SHOPEE'];
  // One text rule for every comparison; see packmaster-sku-normalization.js.
  const normalizeSellerSku = skuNormalization.normalizeSellerSku;
  const normalizeMatchKey = skuNormalization.normalizeMatchKey;
  const normalizeCatalogText = normalizeMatchKey;
  const stripInvisible = skuNormalization.stripInvisible;
  const normalizeThaiSkeleton = skuNormalization.normalizeThaiSkeleton;

  const candidateKey = candidate =>
    JSON.stringify([
      candidate.platform,
      candidate.productId,
      candidate.modelId || null,
      candidate.modelId ? null : (String(candidate.variantName || '').trim() || null)
    ]);

  const addCandidate = (map, key, candidate) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    const entries = map.get(key);
    if (!entries.some(entry => candidateKey(entry) === candidateKey(candidate))) entries.push(candidate);
  };

  const buildIndex = (storeCandidate, registryApi) => {
    if (!registryApi || typeof registryApi.validateStore !== 'function') {
      throw new Error('Registry validation API is required');
    }
    const store = registryApi.validateStore(storeCandidate);
    const index = {};
    for (const platform of PLATFORMS) {
      const data = store.platforms[platform] || null;
      const sellerSkus = new Map();
      const catalogTexts = new Map();
      const catalogSkeletons = new Map();
      const catalogRows = typeof registryApi.getNameableRows === 'function'
        ? registryApi.getNameableRows(data, platform)
        : (data?.skuRows || []);
      for (const row of catalogRows) {
        const productName = platform === 'TIKTOK' ? row.productName : row.title;
        const candidate = {
          platform,
          sellerSku: row.sellerSku || null,
          productId: platform === 'TIKTOK' ? row.productId : row.itemId,
          productName,
          modelId: row.modelId || null,
          variantName: row.variantName || null
        };
        addCandidate(sellerSkus, normalizeSellerSku(row.sellerSku), candidate);
        addCandidate(catalogTexts, normalizeCatalogText(productName), candidate);
        addCandidate(
          catalogTexts,
          normalizeCatalogText([productName, row.variantName].filter(Boolean).join(' ')),
          candidate
        );
        addCandidate(catalogSkeletons, normalizeThaiSkeleton(productName), candidate);
        addCandidate(
          catalogSkeletons,
          normalizeThaiSkeleton([productName, row.variantName].filter(Boolean).join(' ')),
          candidate
        );
      }
      index[platform] = {
        sellerSkus,
        catalogTexts,
        catalogSkeletons,
        catalogRowsList: catalogRows.map(r => ({
          candidate: {
            platform,
            sellerSku: r.sellerSku || null,
            productId: platform === 'TIKTOK' ? r.productId : r.itemId,
            productName: platform === 'TIKTOK' ? r.productName : r.title,
            modelId: r.modelId || null,
            variantName: r.variantName || null
          },
          titleSkeleton: normalizeThaiSkeleton(platform === 'TIKTOK' ? r.productName : r.title),
          fullSkeleton: normalizeThaiSkeleton([platform === 'TIKTOK' ? r.productName : r.title, r.variantName].filter(Boolean).join(' '))
        })),
        registryRows: catalogRows.map(row => ({
          platform,
          sellerSku: row.sellerSku || null,
          productId: platform === 'TIKTOK' ? row.productId : row.itemId,
          productName: platform === 'TIKTOK' ? row.productName : row.title,
          modelId: row.modelId || null,
          variantName: row.variantName || null
        })),
        captureDate: data?.source?.captureDate || null,
        localProducts: (store.localProducts || []).filter(row => row.platform === platform)
      };
    }
    return index;
  };

  const extractSellerSku = (platform, item) => {
    if (!PLATFORMS.includes(platform) || !item) return null;
    if (typeof item.sellerSku === 'string' && item.sellerSku.trim()) {
      return skuNormalization.cleanPdfSellerSku(stripInvisible(item.sellerSku)) || null;
    }
    const text = typeof item === 'string' ? stripInvisible(item) : stripInvisible(item.text);
    if (typeof text !== 'string') return null;
    const explicit = text.match(/(?:^|[|\n])\s*Seller\s*SKU\s*[:：]\s*([^|\n]+)/i);
    if (explicit?.[1]?.trim()) return skuNormalization.cleanPdfSellerSku(explicit[1]) || null;
    if (platform === 'TIKTOK') {
      const pieces = text.split('|');
      if (pieces.length === 3 && pieces.every(piece => piece.trim())) {
        return skuNormalization.cleanPdfSellerSku(pieces[2]) || null;
      }
    }
    return null;
  };

  const extractCatalogText = (platform, item) => {
    if (!PLATFORMS.includes(platform) || !item) return null;
    if (typeof item.catalogText === 'string' && stripInvisible(item.catalogText).trim()) return stripInvisible(item.catalogText).trim();
    const text = typeof item === 'string' ? stripInvisible(item) : stripInvisible(item.text);
    if (typeof text !== 'string' || !text.trim()) return null;
    if (platform === 'TIKTOK') {
      const pieces = text.split('|').map(piece => piece.trim()).filter(Boolean);
      if (pieces.length >= 2) return [pieces[0], pieces[1]].join(' ');
      return null;
    }
    return text.trim();
  };

  const extractCatalogPair = (platform, item) => {
    if (!PLATFORMS.includes(platform) || !item) return null;
    if (Array.isArray(item.catalogPair) && item.catalogPair.length === 2 && item.catalogPair.every(value => typeof value === 'string' && stripInvisible(value).trim())) {
      return item.catalogPair.map(value => stripInvisible(value).trim());
    }
    const text = typeof item === 'string' ? stripInvisible(item) : stripInvisible(item.text);
    if (platform === 'TIKTOK' && typeof text === 'string') {
      const pieces = text.split('|').map(piece => piece.trim());
      if ((pieces.length === 2 || pieces.length === 3) && pieces[0] && pieces[1]) return pieces.slice(0, 2);
    }
    const catalogText = extractCatalogText(platform, item);
    return catalogText ? [catalogText.trim(), ''] : null;
  };

  // Whole-token variant matching. A variant must stand alone: "3" is not inside "30", "3.5" or "5+5".
  const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const isDigitChar = character => /[0-9๐-๙]/.test(character || '');
  const variantPattern = value => {
    const text = normalizeSellerSku(value);
    let pattern = '';
    for (let i = 0; i < text.length; i++) {
      if (text[i] === ' ') continue;
      pattern += escapeRegex(text[i]);
      if (isDigitChar(text[i]) && text[i + 1] === ' ' && isDigitChar(text[i + 2])) {
        // "5 5" in the PDF is one space between two digits; the variant "55" never gets a gap.
        pattern += '\\s';
        i++;
      } else if (!(isDigitChar(text[i]) && isDigitChar(text[i + 1]))) {
        pattern += '\\s*';
      }
    }
    return pattern;
  };
  const TOKEN_BEFORE = '(?<![\\p{L}\\p{N}])(?<!\\p{N}[.+/])';
  const TOKEN_AFTER = '(?![\\p{L}\\p{N}])(?![.+/]\\p{N})';
  const variantAppears = (text, variant) => {
    const pattern = variantPattern(variant);
    if (!pattern) return false;
    return new RegExp(`${TOKEN_BEFORE}${pattern}${TOKEN_AFTER}`, 'u').test(normalizeSellerSku(text));
  };
  // The whole text is this variant, e.g. the piece after an ellipsis.
  const variantIsWhole = (text, variant) => {
    const pattern = variantPattern(variant);
    if (!pattern) return false;
    return new RegExp(`^${pattern}$`, 'u').test(normalizeSellerSku(text));
  };
  // The text ends with this variant as a whole token. Returns the text before it, or null.
  const textBeforeVariant = (text, variant) => {
    const pattern = variantPattern(variant);
    if (!pattern) return null;
    const match = new RegExp(`^(.*?)\\s*${TOKEN_BEFORE}${pattern}${TOKEN_AFTER}$`, 'u')
      .exec(normalizeSellerSku(text));
    return match ? match[1] : null;
  };

  // Variant comparison for contradiction checks only. Spaces, commas and other punctuation do not
  // count, so "สีฟ้า, ขนาด L" agrees with "สีฟ้า ขนาด L". Digits and the "." "+" "/" signs do count,
  // so "3.5" is not "35" and "5+5" is not "55". Two variants agree when one is a whole-word
  // prefix of the other, which is how a truncated PDF variant looks.
  const variantWords = value => normalizeSellerSku(value)
    .split(/[\s,;:|]+/)
    .map(word => normalizeThaiSkeleton(word.replace(/\./g, 'DOT').replace(/\+/g, 'PLUS').replace(/\//g, 'SLASH')))
    .filter(Boolean);
  const variantsAgree = (a, b) => {
    const x = variantWords(a);
    const y = variantWords(b);
    if (!x.length || !y.length) return false;
    const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x];
    return shorter.every((word, i) => word === longer[i]);
  };

  // Truncated Shopee/TikTok titles. Used only after exact and skeleton lookups fail.
  // A name prefix alone never matches: the variant must match as a whole token.
  const ELLIPSIS = /\.{3,}|…/;
  const MIN_NAME_KEY = 6;
  // Length gates count the letters and digits of a skeleton, not its leading vowels or digit
  // separators (ticket 15 keeps those in the skeleton). Otherwise a leading vowel in the title
  // would shrink the head's share of it and change which truncated names pass.
  const gateLength = key => key.replace(/[เ-ไ.+\/ ]/g, '').length;
  // A name head must be long enough to identify the product: at least 12 characters and at
  // least half of the candidate's title. "Synthetic" or "Synthetic Gloves Nit" are not enough.
  const MIN_HEAD_KEY = 12;
  const headIsLongEnough = (headKey, titleSkeleton) =>
    gateLength(headKey) >= MIN_HEAD_KEY && gateLength(headKey) * 2 >= gateLength(titleSkeleton);
  // A head that ends in a digit must not stop inside a longer number ("Pack 3" inside "Pack 30").
  // The row's next character may be a digit, or a kept separator ("." "+" "/" or a space) followed
  // by a digit: "Pack 5" stops inside "Pack 5+5" and "Pack 1" stops inside "Pack 1.5".
  const cutsNumber = (headKey, skeleton) => {
    if (!isDigitChar(headKey.charAt(headKey.length - 1))) return false;
    const next = skeleton.charAt(headKey.length);
    return isDigitChar(next) ||
      (next !== '' && '.+/ '.includes(next) && isDigitChar(skeleton.charAt(headKey.length + 1)));
  };
  // The head is the complete title of another product, so it is not a truncation for this row.
  const isCompleteTitleOfOtherProduct = (rows, row, headKey) =>
    rows.some(other => other.candidate.productId !== row.candidate.productId && other.titleSkeleton === headKey);
  const headNamesRow = (rows, row, headKey, skeletons) =>
    skeletons.some(skeleton => skeleton.startsWith(headKey) && !cutsNumber(headKey, skeleton)) &&
    headIsLongEnough(headKey, row.titleSkeleton) &&
    !isCompleteTitleOfOtherProduct(rows, row, headKey);
  // A piece after an ellipsis passes when it is the row's whole variant, or when it is a
  // long name fragment that appears in the row (the legacy rule). Short pieces must be the variant.
  // Ticket 14: the tail pieces follow the head in the row's own order. Each piece must be found
  // at or after the end of the previous one (the head is first). Returns the end position, or -1.
  const tailEnd = (row, piece, from) => {
    const variant = row.candidate.variantName;
    const key = normalizeThaiSkeleton(piece);
    const isVariant = Boolean(variant) && variantIsWhole(piece, variant);
    if (!isVariant && gateLength(key) < MIN_NAME_KEY) return -1;
    const at = row.fullSkeleton.indexOf(key, from);
    return at < 0 ? -1 : at + key.length;
  };
  const tailsInOrder = (row, headKey, tails) => {
    let position = headKey.length;
    for (const piece of tails) {
      position = tailEnd(row, piece, position);
      if (position < 0) return false;
    }
    return true;
  };
  const truncatedCandidates = (rows, rawText) => {
    if (ELLIPSIS.test(rawText)) {
      const [head, ...rest] = rawText.split(/\.{3,}|…/);
      const headKey = normalizeThaiSkeleton(head);
      const tails = rest.map(piece => piece.trim()).filter(piece => normalizeThaiSkeleton(piece));
      if (gateLength(headKey) < MIN_HEAD_KEY || tails.length === 0) return null;
      return {
        candidates: rows.filter(row =>
          headNamesRow(rows, row, headKey, [row.fullSkeleton, row.titleSkeleton]) &&
          // A row with a variant needs that variant as a whole token somewhere in the text.
          (!row.candidate.variantName || variantAppears(rawText, row.candidate.variantName)) &&
          tailsInOrder(row, headKey, tails)),
        foundReason: 'ellipsis_catalog_match',
        duplicateReason: 'duplicate_ellipsis_catalog_match'
      };
    }
    // No ellipsis: "name prefix + variant". The variant must end the text as a whole token.
    return {
      candidates: rows.filter(row => {
        const variant = row.candidate.variantName;
        if (!variant) return false;
        const before = textBeforeVariant(rawText, variant);
        if (before === null) return false;
        const headKey = normalizeThaiSkeleton(before);
        return gateLength(headKey) >= MIN_HEAD_KEY && headNamesRow(rows, row, headKey, [row.titleSkeleton]);
      }),
      foundReason: 'truncated_catalog_match',
      duplicateReason: 'duplicate_truncated_catalog_match'
    };
  };

  const resolveCatalog = (index, platform, item) => {
    const rawText = extractCatalogText(platform, item);
    const catalogKey = normalizeCatalogText(rawText);
    if (!catalogKey) return { status: 'no_identity', reason: 'catalog_text_not_explicit' };
    const candidates = index[platform].catalogTexts.get(catalogKey) || [];
    if (candidates.length > 1) {
      return {
        status: 'ambiguous',
        reason: 'duplicate_catalog_text',
        identityType: 'catalog_row',
        catalogKey,
        candidateCount: candidates.length
      };
    }
    if (candidates.length === 1) {
      return {
        status: 'found',
        identityType: 'catalog_row',
        sellerSku: null,
        catalogKey,
        candidate: { ...candidates[0] },
        captureDate: index[platform].captureDate
      };
    }

    // Secondary fallback: normalized Thai skeleton match (handles PUA glyphs, displaced karan, tone reordering)
    const skeletonKey = normalizeThaiSkeleton(rawText);
    if (skeletonKey && index[platform].catalogSkeletons) {
      const skeletonCandidates = index[platform].catalogSkeletons.get(skeletonKey) || [];
      if (skeletonCandidates.length === 1) {
        return {
          status: 'found',
          identityType: 'catalog_row',
          sellerSku: null,
          catalogKey,
          candidate: { ...skeletonCandidates[0] },
          captureDate: index[platform].captureDate,
          reason: 'skeleton_catalog_match'
        };
      }
      if (skeletonCandidates.length > 1) {
        return {
          status: 'ambiguous',
          reason: 'duplicate_catalog_skeleton',
          identityType: 'catalog_row',
          catalogKey,
          candidateCount: skeletonCandidates.length
        };
      }
    }

    // Tertiary fallback: truncated titles (with or without "..."), variant matched as a whole token.
    // Length gate ignores whitespace runs so that line breaks do not change which path runs.
    if (Array.isArray(index[platform].catalogRowsList) && rawText.replace(/\s+/g, ' ').length >= 20) {
      const truncated = truncatedCandidates(index[platform].catalogRowsList, rawText);
      if (truncated?.candidates.length === 1) {
        return {
          status: 'found',
          identityType: 'catalog_row',
          sellerSku: null,
          catalogKey,
          candidate: { ...truncated.candidates[0].candidate },
          captureDate: index[platform].captureDate,
          reason: truncated.foundReason
        };
      }
      if (truncated?.candidates.length > 1) {
        return {
          status: 'ambiguous',
          reason: truncated.duplicateReason,
          identityType: 'catalog_row',
          catalogKey,
          candidateCount: truncated.candidates.length
        };
      }
    }

    return {
      status: 'not_found',
      reason: 'catalog_text_not_found',
      identityType: 'catalog_row',
      catalogKey
    };
  };

  // B9: a unique exact Seller SKU keeps its row unless the PDF text contradicts it.
  // Variant helpers (whole-token matching) are defined above resolveCatalog.
  // The SKU row's product name can contain variant words ("Cup Mini"), so it is removed first.
  const withoutProductName = (text, productName) => {
    const body = normalizeSellerSku(text);
    const name = normalizeSellerSku(productName || '');
    return name ? body.split(name).join(' ') : body;
  };
  // The longest product name that starts the PDF text ("Synthetic Cup Set Family Pack แพ็ค 3"
  // names Family Pack) belongs to a different product than the SKU row. Used only as a veto
  // that sends the row to Review; it never creates a match.
  const namesOtherProduct = (index, platform, item, productId) => {
    // TikTok keeps the product name in its own column, so "Cup | Mini" is not "Cup Mini".
    const text = normalizeSellerSku(extractCatalogPair(platform, item)?.[0] || '');
    if (!text) return false;
    let longest = 0;
    let owners = new Set();
    for (const row of index[platform].registryRows || []) {
      const name = normalizeSellerSku(row.productName || '');
      if (!name || !(text === name || text.startsWith(name + ' '))) continue;
      if (name.length > longest) {
        longest = name.length;
        owners = new Set();
      }
      if (name.length === longest) owners.add(row.productId);
    }
    return owners.size > 0 && !owners.has(productId);
  };

  // Only a full TikTok "name | variant | SKU" text has a variant column.
  // "name | Seller SKU: X" has two pieces, so its second piece is not a variant.
  const tikTokVariantColumn = (platform, item) => {
    if (platform !== 'TIKTOK') return '';
    const text = typeof item === 'string' ? stripInvisible(item) : stripInvisible(item?.text);
    if (typeof text !== 'string') return '';
    const pieces = text.split('|').map(piece => piece.trim());
    return pieces.length === 3 && pieces.every(Boolean) ? pieces[1] : '';
  };

  // true = the SKU row is contradicted, so the caller returns Review.
  const skuRowContradicted = (index, platform, item, skuCandidate, guessCandidate) => {
    const body = withoutProductName(extractCatalogText(platform, item) || '', skuCandidate.productName);
    const productVariants = [...new Set((index[platform].registryRows || [])
      .filter(row => row.productId === skuCandidate.productId && row.variantName)
      .map(row => String(row.variantName).trim()))];
    const named = productVariants.filter(variant => variantAppears(body, variant));
    if (named.length > 1) return true; // the PDF names two variants of this product
    if (namesOtherProduct(index, platform, item, skuCandidate.productId)) return true;
    const skuVariant = String(skuCandidate.variantName || '').trim();
    if (!guessCandidate) {
      // No name guess: a TikTok variant column that genuinely conflicts with the SKU row's variant contradicts it.
      const pdfVariantColumn = tikTokVariantColumn(platform, item);
      return Boolean(pdfVariantColumn && skuVariant && !variantsAgree(pdfVariantColumn, skuVariant));
    }
    if (guessCandidate.productId !== skuCandidate.productId) return true; // a different product
    const guessVariant = String(guessCandidate.variantName || '').trim();
    if (guessVariant && variantAppears(body, guessVariant)) return true;
    if (named.length === 0) {
      // No registry variant in the text: only a TikTok variant column that matches none of the product's variants contradicts.
      const pdfVariantColumn = platform === 'TIKTOK'
        ? String(extractCatalogPair(platform, item)?.[1] || '').trim()
        : '';
      return Boolean(pdfVariantColumn) && !productVariants.some(variant => variantsAgree(pdfVariantColumn, variant));
    }
    return !(skuVariant && named[0] === skuVariant);
  };

  const resolve = (index, platform, item) => {
    if (!PLATFORMS.includes(platform) || !index?.[platform]) {
      return { status: 'unavailable', reason: 'platform_or_registry_unavailable' };
    }

    const skuText = extractSellerSku(platform, item);
    const skuKey = normalizeSellerSku(skuText);
    if (skuKey) {
      const candidates = index[platform].sellerSkus.get(skuKey) || [];
      if (candidates.length === 0) {
        const rawText = typeof item === 'string' ? stripInvisible(item) : (typeof item?.text === 'string' ? stripInvisible(item.text) : null);
        let productTitle = null;
        if (rawText && rawText.includes('|')) {
          const pieces = rawText.split('|').map(piece => piece.trim()).filter(Boolean);
          if (pieces.length > 0) productTitle = pieces[0];
        }
        if (!productTitle && item && typeof item === 'object') {
          if (typeof item.productName === 'string' && item.productName.trim()) {
            productTitle = item.productName.trim();
          } else if (typeof item.title === 'string' && item.title.trim()) {
            productTitle = item.title.trim();
          }
        }

        if (productTitle) {
          const titleKey = normalizeCatalogText(productTitle);
          if (titleKey) {
            const titleCandidates = index[platform].catalogTexts.get(titleKey) || [];
            if (titleCandidates.length === 1) {
              const candidate = titleCandidates[0];
              return {
                status: 'found',
                identityType: 'catalog_row',
                sellerSku: skuText,
                catalogKey: titleKey,
                candidate: { ...candidate },
                captureDate: index[platform].captureDate,
                reason: 'exact_title_fallback'
              };
            }
          }

          // Secondary title fallback: normalized Thai skeleton
          const titleSkeletonKey = normalizeThaiSkeleton(productTitle);
          if (titleSkeletonKey && index[platform].catalogSkeletons) {
            const skelCandidates = index[platform].catalogSkeletons.get(titleSkeletonKey) || [];
            if (skelCandidates.length === 1) {
              const candidate = skelCandidates[0];
              return {
                status: 'found',
                identityType: 'catalog_row',
                sellerSku: skuText,
                catalogKey: titleKey || titleSkeletonKey,
                candidate: { ...candidate },
                captureDate: index[platform].captureDate,
                reason: 'skeleton_title_fallback'
              };
            }
          }
        }
        return { status: 'not_found', reason: 'seller_sku_not_found', identityType: 'seller_sku', sellerSku: skuText };
      }
      if (candidates.length === 1) {
        const catalogEvidence = resolveCatalog(index, platform, item);
        const guess = catalogEvidence.status === 'found' &&
          candidateKey(catalogEvidence.candidate) !== candidateKey(candidates[0])
          ? catalogEvidence.candidate
          : null;
        if (skuRowContradicted(index, platform, item, candidates[0], guess)) {
          return {
            status: 'ambiguous',
            reason: 'seller_sku_catalog_identity_conflict',
            identityType: 'seller_sku',
            sellerSku: skuText,
            candidateCount: 1
          };
        }
        return {
          status: 'found',
          identityType: 'seller_sku',
          sellerSku: skuText,
          candidate: { ...candidates[0] },
          captureDate: index[platform].captureDate
        };
      }

      const catalogEvidence = resolveCatalog(index, platform, item);
      if (catalogEvidence.status === 'found' &&
          candidates.some(candidate => candidateKey(candidate) === candidateKey(catalogEvidence.candidate))) {
        return {
          ...catalogEvidence,
          sellerSku: skuText,
          reason: 'duplicate_seller_sku_disambiguated_by_catalog'
        };
      }
      return {
        status: 'ambiguous',
        reason: 'duplicate_seller_sku',
        identityType: 'seller_sku',
        sellerSku: skuText,
        candidateCount: candidates.length
      };
    }

    const explicitCatalogText = typeof item === 'object' && typeof item?.catalogText === 'string' &&
      Boolean(item.catalogText.trim());
    const canUseCatalog = platform === 'SHOPEE' || explicitCatalogText ||
      (platform === 'TIKTOK' && typeof (typeof item === 'string' ? item : item?.text) === 'string' &&
        String(typeof item === 'string' ? item : item?.text).includes('|'));
    if (canUseCatalog) return resolveCatalog(index, platform, item);

    return { status: 'no_identity', reason: 'seller_sku_not_explicit' };
  };

  return {
    buildIndex,
    normalizeSellerSku,
    normalizeCatalogText,
    extractSellerSku,
    extractCatalogText,
    extractCatalogPair,
    resolve
  };
});
