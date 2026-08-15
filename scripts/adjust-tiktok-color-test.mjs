import fs from 'node:fs';

const file = 'tests/packmaster-smart-matcher.test.mjs';
let source = fs.readFileSync(file, 'utf8');
const before = `const pinkAgainstSellerSpecificRule = matchSkuRule(pink24TikTokSource, sellerSpecificPinkRules);
assert.equal(pinkAgainstSellerSpecificRule.status, 'matched', 'Seller-specific สีชมพู mapping must remain matched');
assert.equal(pinkAgainstSellerSpecificRule.rule?.shortName, 'เด้งชม1ลัง');`;
const after = `const pinkAgainstSellerSpecificRule = matchSkuRule(pink24TikTokSource, sellerSpecificPinkRules);
assert.equal(pinkAgainstSellerSpecificRule.status, 'ambiguous', 'Seller-specific color without the product PLUS identity must fail closed instead of weakening the existing PLUS guard');
assert.equal(pinkAgainstSellerSpecificRule.rule, null);`;
if (!source.includes(before)) throw new Error('Expected test block not found');
source = source.replace(before, after);
fs.writeFileSync(file, source);
