"""Pull Farriers Depot public catalog facts (names, brands, categories, sizes, SKUs,
list prices). Honors robots.txt Crawl-delay: 2 (uses 2.5s). Resumable: product
records are appended to fd_products.jsonl and skipped on re-run.
Deliberately NOT collected: descriptions, images, price_cost, stock levels."""
import json, os, re, time, urllib.request, html

BASE = 'https://www.farriersdepot.com/'
DIR = os.path.dirname(os.path.abspath(__file__))
LIST = os.path.join(DIR, 'fd_list.json')
OUT = os.path.join(DIR, 'fd_products.jsonl')
DELAY = 2.5
UA = 'Mozilla/5.0 (FarriTech catalog import)'

def get(path):
    for attempt in range(4):
        try:
            req = urllib.request.Request(BASE + path, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:
            print('  retry', attempt, path, e, flush=True)
            time.sleep(10 * (attempt + 1))
    return None

def clean(s):
    return re.sub(r'\s+', ' ', html.unescape(s or '')).strip()

# 1) product URL list
if os.path.exists(LIST):
    urls = json.load(open(LIST))
else:
    urls, page = [], 1
    while True:
        d = get(f'collection/page{page}.html?format=json&limit=100')['collection']
        prods = d['products']
        prods = prods.values() if isinstance(prods, dict) else prods
        urls += [p['url'] for p in prods]
        print('list page', page, '/', d['pages'], flush=True)
        if not d.get('page_next'): break
        page += 1
        time.sleep(DELAY)
    urls = list(dict.fromkeys(urls))
    json.dump(urls, open(LIST, 'w'))
print('products:', len(urls), flush=True)

# 2) per-product detail
done = set()
if os.path.exists(OUT):
    for line in open(OUT, encoding='utf-8'):
        done.add(json.loads(line)['url'])

with open(OUT, 'a', encoding='utf-8') as f:
    for i, url in enumerate(urls):
        if url in done: continue
        time.sleep(DELAY)
        d = get(url + '?format=json')
        if not d or 'product' not in d:
            print('  skip', url, flush=True); continue
        p = d['product']
        cats = list((p.get('categories') or {}).values())
        cats.sort(key=lambda c: c.get('depth', 0))
        paths = []
        for c in cats:
            # full title path for each leaf-most category
            if not any(o is not c and str(c['id']) in o.get('path', []) for o in cats):
                ids = list(reversed(c.get('path', [])))
                byid = {str(o['id']): o['title'] for o in cats}
                paths.append([clean(byid.get(x, '')) for x in ids])
        variants = []
        for v in (p.get('variants') or {}).values():
            variants.append({
                'title': clean(v.get('title')), 'code': v.get('code', ''), 'sku': v.get('sku', ''),
                'price': (v.get('price') or {}).get('price_incl'),
            })
        variants.sort(key=lambda v: v.get('title', ''))
        rec = {
            'url': url, 'id': p.get('id'), 'title': clean(p.get('title')),
            'brand': clean((p.get('brand') or {}).get('title')) if isinstance(p.get('brand'), dict) else '',
            'categories': paths, 'variants': variants,
            'price': (p.get('price') or {}).get('price_incl'),
        }
        f.write(json.dumps(rec, ensure_ascii=False) + '\n'); f.flush()
        if i % 50 == 0: print(f'{i}/{len(urls)}', flush=True)
print('DONE', flush=True)
