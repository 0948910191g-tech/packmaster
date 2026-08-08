# Smart Matcher Deploy Checklist

- [x] Smart matcher regression test passes on branch head
- [x] TikTok multi-SKU sanitized continuation fixture covered
- [x] Pack size is separate from order Qty in tests
- [x] Ambiguous match returns review state instead of guessed SKU
- [x] Existing last-number quantity aggregation regression retained
- [x] Shopee parser structure retained; declared total is cross-check only when safely detected
- [x] No source PDF or customer PII committed
- [x] Print size and export dimensions unchanged
- [x] One-off patch script removed before merge
- [x] Permanent regression CI retained
