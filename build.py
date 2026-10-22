"""Build a standalone page without an opaque-origin sandbox iframe."""
from pathlib import Path

root = Path(__file__).resolve().parent
shell = (root / 'app-shell.html').read_text()
script = (root / 'app.js').read_text()
extra = '''<style>
:root{color-scheme:light dark}body{margin:0;padding:16px;background:light-dark(#f7f8f6,#171a19)}
#book-notes-demo .storage-error{padding:12px;color:light-dark(#8b2820,#ffb0a8);background:var(--bn-bg);border:1px solid var(--bn-line);border-radius:7px;overflow-wrap:anywhere}
#book-notes-demo #form-error{color:light-dark(#8b2820,#ffb0a8)}
#book-notes-demo .heading-row{flex-wrap:wrap;align-items:center}
#book-notes-demo .inspiration-toolbar{flex-shrink:0}
#book-notes-demo .field label{display:grid;gap:6px}
#book-notes-demo .thought p{white-space:pre-wrap;overflow-wrap:anywhere}
#book-notes-demo .sort{display:none}
#book-notes-demo .quote-item blockquote{white-space:pre-wrap;overflow-wrap:anywhere}
@media(max-width:430px){body{padding:0}#book-notes-demo .detail-top{flex-wrap:wrap}#book-notes-demo .detail-actions{margin-left:0;flex-wrap:wrap}}
</style>'''
page = '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>纸间 · 书摘</title>'+extra+'</head><body>\n'+shell+'\n<script>\n'+script+'\n</script></body></html>\n'
(root / 'index.html').write_text(page)
print(root / 'index.html')
