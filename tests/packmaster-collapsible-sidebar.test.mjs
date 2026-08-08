import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');

assert.match(html, /packmasterSidebarCollapsedV1/, 'desktop collapse preference key must exist');
assert.match(html, /data-pm-sidebar(?:[=\s>])/, 'sidebar must expose a stable marker');
assert.match(html, /data-pm-sidebar-toggle/, 'desktop sidebar toggle must exist');
assert.match(html, /data-pm-sidebar-collapsed/, 'collapsed state marker must exist');
assert.match(html, /205px/, 'expanded desktop sidebar width must remain 205px');
assert.match(html, /68px/, 'collapsed desktop sidebar width must be 68px');
assert.match(html, /aria-expanded/, 'sidebar controls must expose expansion state');
assert.match(html, /aria-controls="packmaster-sidebar"/, 'sidebar controls must target the sidebar');
assert.match(html, /pm-nav-label/, 'visual nav labels must be hideable without removing accessible names');
assert.match(html, /title=\{sidebarCollapsed \? label : undefined\}/, 'collapsed primary nav must expose hover titles');

assert.match(html, /mobileSidebarOpen/, 'mobile drawer state must exist');
assert.match(html, /data-pm-mobile-menu/, 'mobile menu control must exist');
assert.match(html, /data-pm-sidebar-backdrop/, 'mobile drawer backdrop must exist');
assert.match(html, /pm-sidebar-mobile-open/, 'mobile drawer open class must exist');
assert.match(html, /@media\s*\(max-width:\s*900px\)/, 'mobile drawer breakpoint must be explicit');
assert.match(html, /event\.key === 'Escape'/, 'Escape must close the mobile drawer');
assert.doesNotMatch(html, /onMouseEnter=.*sidebar/i, 'sidebar must not auto-expand on hover');

assert.match(html, /data-pm-primary-nav/, 'primary navigation contract must remain');
assert.match(html, /data-pm-secondary-nav/, 'secondary navigation contract must remain');
assert.match(html, /for \(let i = 0; i < MappedOrders\.length; i\+\+\)/, 'Print must still iterate over full MappedOrders');
assert.match(html, /MappedOrders\.map\(\(order\) => \(<LabelCard key=\{`print-\$\{order\.id\}`\}/, 'Save/print render scope must remain full MappedOrders');

console.log('PackMaster collapsible sidebar contract passed');
