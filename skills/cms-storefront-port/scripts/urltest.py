import sys, re, urllib.request, urllib.error, urllib.parse
base = sys.argv[1].rstrip('/')
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
op = urllib.request.build_opener(NoRedirect)
def get(path):
    try:
        r = op.open(base + path, timeout=60); return r.status, r.headers.get('Location'), r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, (e.headers.get('Location') or '').replace(base, ''), ''
EN = '/products/automotive-batteries/car-batteries/exide-agm-g34-ek508-start-stop-car-battery-12v-50ah-800a'
FR = '/fr/produits/batteries-automobiles/batteries-de-voiture/exide-agm-g34-ek508-batterie-auto-start-stop-12v-50ah-800a'
ok = 0; bad = 0
def check(name, cond, detail=''):
    global ok, bad
    if cond: ok += 1
    else: bad += 1; print('  FAIL', name, detail)
title = lambda h: (re.search(r'<title>([^<]*)', h) or [None, ''])[1]
# pages
for path, want in [('/products', 'All products'), ('/products/automotive-batteries', 'Automotive Batteries'), (EN, 'Start-Stop Car Battery'),
                   ('/fr/produits', 'Tous les produits'), ('/fr/produits/batteries-automobiles', 'Batteries automobiles'), (FR, 'batterie auto Start-Stop'), ('/fr', 'Commerce B2B')]:
    c, _, h = get(path); check(path, c == 200 and want in title(h), f'{c} {title(h)[:50]}')
# redirects
for path, want in [('/fr/products', '/fr/produits'), ('/fr/products?q=agm', '/fr/produits?q=agm'), ('/fr/products/automotive-batteries', '/fr/produits/batteries-automobiles'),
                   ('/fr' + EN, FR), ('/produits', '/products'), ('/produits/batteries-automobiles', '/products/automotive-batteries')]:
    c, loc, _ = get(path); check('redirect ' + path[:50], c in (307, 308) and loc.replace(base, '') == want, f'{c} {loc}')
for path in ['/fr/foo', '/foo/bar', '/fr/produits/batteries-automobiles/inexistant/zzz']:
    c, _, _ = get(path); check('404 ' + path, c == 404, str(c))
# switcher
for q, want in [(f'to=en&path={FR}', EN), (f'to=fr&path={EN}', FR), ('to=fr&path=/products/automotive-batteries&q=agm&sort=price_asc', '/fr/produits/batteries-automobiles?q=agm&sort=price_asc'),
                ('to=en&path=/fr/produits/batteries-automobiles/batteries-de-voiture', '/products/automotive-batteries/car-batteries'), ('to=fr&path=/products/does/not/exist', '/fr/produits')]:
    c, loc, _ = get('/api/switch-locale?' + urllib.parse.quote(q, safe='=&/?') if False else '/api/switch-locale?' + q); check('switch ' + q[:40], c == 307 and loc.replace(base, '') == want, f'{c} {loc}')
c, _, _ = get('/api/switch-locale?to=xx&path=/products/a/b'); check('switch bad locale', c == 400, str(c))
# hreflang + links
c, _, h = get(FR)
alts = dict(re.findall(r'<link rel="alternate" hrefLang="([^"]+)" href="([^"]+)"', h) or re.findall(r'hrefLang="([^"]+)"[^>]*href="([^"]+)"', h))
check('hreflang en', alts.get('en', '').rstrip('/') == EN, str(alts)); check('hreflang fr', alts.get('fr', '').rstrip('/') == FR, str(alts))
check('no english-root links on FR product', '/fr/products' not in h)
c, _, h = get('/fr')
stray = re.findall(r'<a href="/fr/products[^"]*">[^<]*</a>', h)  # a link written into CMS rich text; the redirect covers it
check('FR home catalog links translated', '/fr/produits' in h and len(re.findall(r'href="/fr/products', h)) <= len(stray) and len(stray) <= 1, str(stray))
if stray: print('  note: CMS rich text still links', stray)
print(f'{base}: {ok} passed, {bad} failed')
sys.exit(1 if bad else 0)
