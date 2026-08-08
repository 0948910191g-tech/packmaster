# Parser / Matcher V2 Hotfix

This hotfix is driven by production regressions reproduced from the real SKU mapping export and sanitized Shopee/TikTok label fixtures.

Safety rule: parser must determine row quantity before SKU matching; matching must prefer product identity over pack-size coincidence. If confidence is insufficient, require review instead of guessing.

TDD progress: production matcher regressions and grouped TikTok header parsing are green. The Shopee positioned-row parser is now implemented and under regression verification for three rows with Qty `[1,1,1]` and footer total `3`.
