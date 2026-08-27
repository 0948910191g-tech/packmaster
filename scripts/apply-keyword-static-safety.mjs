import fs from 'node:fs';

const file = 'packmaster-keyword-assistant.js';
let source = fs.readFileSync(file, 'utf8');

const replaceOnce = (label, before, after) => {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: target snippet not found`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: target snippet is not unique`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
};

replaceOnce(
  'static identity token policy',
  "  const PRODUCT_IDENTITY_TOKENS = new Set([\n    'BABY', 'ADULT', 'MAKEUP', 'REMOVER', 'WIPES', 'WIPE', 'XXL', 'COOLING', 'MENTHOL', 'JASMINE',\n    'เบบี้', 'ผู้ใหญ่', 'เมคอัพ', 'รีมูฟเวอร์', 'เครื่องสำอาง', 'คูลลิ่ง', 'เย็น', 'น้ำแร่'\n  ]);",
  "  const PRODUCT_IDENTITY_TOKENS = new Set([\n    'BABY', 'ADULT', 'MAKEUP', 'REMOVER', 'WIPES', 'WIPE', 'XXL', 'COOLING', 'MENTHOL', 'JASMINE',\n    'เบบี้', 'ผู้ใหญ่', 'เมคอัพ', 'รีมูฟเวอร์', 'เครื่องสำอาง', 'คูลลิ่ง', 'เย็น', 'น้ำแร่'\n  ]);\n\n  const STATIC_BROAD_TOKENS = new Set([\n    'BABY', 'WIPE', 'WIPES', 'WET', 'PACK', 'PACKS', 'SHEET', 'SHEETS',\n    'เบบี้', 'ห่อ', 'แผ่น', 'ชิ้น', 'ลัง', 'สินค้า', 'ทิชชู่', 'ทิชชู่เปียก'\n  ]);\n\n  const STATIC_STRONG_IDENTITY_TOKENS = new Set([\n    'ADULT', 'MAKEUP', 'REMOVER', 'XXL', 'COOLING', 'MENTHOL', 'JASMINE', 'LAVENDER',\n    'PURPLE', 'PINK', 'PLUS', 'VALUE', 'EXTRA', 'ALCOHOL',\n    'ผู้ใหญ่', 'เมคอัพ', 'รีมูฟเวอร์', 'เครื่องสำอาง', 'คูลลิ่ง', 'เย็น', 'น้ำแร่',\n    'ม่วง', 'ชมพู', 'มะลิ', 'ลาเวนเดอร์'\n  ]);"
);

replaceOnce(
  'static keyword assessor',
  "  const isGenericCandidate = (value) => {\n    const normalized = normalizeKeywordText(value);\n    if (!normalized) return true;\n    const tokens = tokenize(normalized);\n    if (tokens.length === 0) return true;\n    if (hasMetadataNoise(tokens)) return true;\n    if (tokens.length === 1) {\n      const token = tokens[0];\n      if (GENERIC_SINGLE_TOKENS.has(token)) return true;\n      if (token.length < 4 && !isModelOrVariantToken(token)) return true;\n    }\n    return false;\n  };",
  "  const isGenericCandidate = (value) => {\n    const normalized = normalizeKeywordText(value);\n    if (!normalized) return true;\n    const tokens = tokenize(normalized);\n    if (tokens.length === 0) return true;\n    if (hasMetadataNoise(tokens)) return true;\n    if (tokens.length === 1) {\n      const token = tokens[0];\n      if (GENERIC_SINGLE_TOKENS.has(token)) return true;\n      if (token.length < 4 && !isModelOrVariantToken(token)) return true;\n    }\n    return false;\n  };\n\n  const assessStaticKeywordSafety = (value) => {\n    const candidate = String(value == null ? '' : value).trim();\n    if (!candidate) return { safe: false, reason: 'empty' };\n\n    const tokens = tokenize(candidate);\n    if (tokens.length === 0) return { safe: false, reason: 'empty' };\n    if (hasMetadataNoise(tokens) || isGenericCandidate(candidate)) {\n      return { safe: false, reason: 'metadata-or-generic' };\n    }\n    if (tokens.length > 8) {\n      return { safe: false, reason: 'long-title-review' };\n    }\n\n    const hasBrandAnchor = tokens.some(isBrandAnchor);\n    const hasStrongIdentity = tokens.some(token => {\n      const normalized = normalizeKeywordText(token);\n      if (!normalized || isBrandAnchor(token) || STATIC_BROAD_TOKENS.has(normalized)) return false;\n      if (STATIC_STRONG_IDENTITY_TOKENS.has(normalized) || normalized.startsWith('สูตร')) return true;\n      if (isBundleToken(token)) return true;\n      if (isModelOrVariantToken(token) && !/^\\d+$/.test(normalized)) return true;\n      return isLatinIdentityToken(token) && !/^\\d+$/.test(normalized);\n    });\n\n    if (!hasStrongIdentity) {\n      return {\n        safe: false,\n        reason: hasBrandAnchor ? 'brand-generic-only' : 'weak-generic-identity'\n      };\n    }\n\n    return { safe: true, reason: 'static-identity-ok' };\n  };"
);

replaceOnce(
  'static safety before matcher trust',
  "    if (!candidate || !sourceText) return { safe: false, reason: 'empty' };\n    if (typeof matchRule !== 'function') return { safe: false, reason: 'matcher-unavailable' };\n    if (isGenericCandidate(candidate) || hasMetadataNoise(tokenize(candidate))) {\n      return { safe: false, reason: 'metadata-or-generic' };\n    }",
  "    if (!candidate || !sourceText) return { safe: false, reason: 'empty' };\n    const staticSafety = assessStaticKeywordSafety(candidate);\n    if (!staticSafety.safe) return staticSafety;\n    if (typeof matchRule !== 'function') return { safe: false, reason: 'matcher-unavailable' };"
);

replaceOnce(
  'export static safety helper',
  "  return {\n    normalizeKeywordText,\n    isGenericCandidate,\n    assessKeywordSafety,\n    generateKeywordSuggestions\n  };",
  "  return {\n    normalizeKeywordText,\n    isGenericCandidate,\n    assessStaticKeywordSafety,\n    assessKeywordSafety,\n    generateKeywordSuggestions\n  };"
);

fs.writeFileSync(file, source);
console.log('Keyword Assistant static safety patch applied');
