(() => {
  'use strict';
  const root = document.getElementById('book-notes-demo');
  const $ = selector => root.querySelector(selector);
  const $$ = selector => [...root.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const id = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  const date = () => new Date().toLocaleString('zh-CN');
  const dbName = 'zhijian-summry-library';
  const categories = {中文:['文学','社科','哲学','历史','科普','其他'],英文:['小说','散文','传记','社科','诗歌','其他']};
  const bookSeeds = [
    ['人间失格','太宰治','中文','文学','rose'],
    ['也许你该找个人聊聊','洛莉·戈特利布','中文','社科','blue'],
    ['悉达多','赫尔曼·黑塞','中文','哲学','gold'],
    ['In Search of Lost Time','Marcel Proust','英文','小说','blue'],
    ['The Book of Delights','Ross Gay','英文','散文','gold'],
    ['The Remains of the Day','Kazuo Ishiguro','英文','小说','rose']
  ];
  const initial = {
    schemaVersion: 1,
    books: bookSeeds.map((b,i) => ({id:'book-'+i,title:b[0],author:b[1],type:b[2],category:b[3],cover:b[4]})),
    quotes: $$('#quote-list .quote-item').map((el,i) => ({id:'quote-'+i,bookId:'book-0',content:el.querySelector('blockquote').textContent,page:el.querySelector('.quote-foot span').textContent,think:''})),
    words: $$('#word-list .word').map((el,i) => ({id:'word-'+i,bookId:'book-3',word:el.querySelector('strong').textContent,sentence:el.querySelector('p').firstChild.textContent,note:el.querySelector('small').textContent})),
    inspirations: [...$$('#inbox-view .thought').map((el,i) => ({id:'inspiration-'+i,bookId:null,content:el.querySelector('p').textContent,date:el.querySelector('small').textContent.replace(/\s*·\s*未归类\s*$/,'')})),
      ...$$('#thought-list .thought').map((el,i) => ({id:'reflection-'+i,bookId:'book-0',content:el.querySelector('p').textContent,date:el.querySelector('small').textContent}))]
  };
  let state = initial, db, ready = false, busy = false;
  let page = 'home', shelf = 'all', category = '全部', currentBook = null, detailTab = 'quotes', overview = false, modalAction = null;
  let toastTimer;
  function notify(message) { clearTimeout(toastTimer); $('#toast').textContent=message; $('#toast').classList.add('show'); toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3000); }
  function storageError(message) { $('#storage-error').hidden=false; $('#storage-error').textContent=message; $('#storage-status').textContent='本地保存不可用'; }
  function storageOK() { $('#storage-error').hidden=true; $('#storage-status').textContent='已保存在此浏览器'; }
  function valid(data) {
    if (!data || data.schemaVersion!==1 || !['books','quotes','words','inspirations'].every(key=>Array.isArray(data[key]))) return false;
    const keys = ['books','quotes','words','inspirations'];
    if(keys.some(key=>data[key].some(x=>!x || typeof x.id!=='string') || new Set(data[key].map(x=>x.id)).size!==data[key].length)) return false;
    const ids = new Set(data.books.map(b=>b.id));
    return data.books.every(b=>typeof b.title==='string' && typeof b.author==='string' && ['中文','英文'].includes(b.type) && typeof b.category==='string' && ['rose','blue','gold',''].includes(b.cover)) &&
      data.quotes.every(q=>ids.has(q.bookId) && typeof q.content==='string' && typeof q.page==='string') &&
      data.words.every(w=>ids.has(w.bookId) && typeof w.word==='string' && typeof w.sentence==='string' && typeof w.note==='string') &&
      data.inspirations.every(t=>(t.bookId===null || ids.has(t.bookId)) && typeof t.content==='string' && typeof t.date==='string');
  }
  function request(req) { return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);}); }
  function transaction(change) {
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('state','readwrite');
      const store=tx.objectStore('state'),read=store.get('library');let result,failure;
      read.onsuccess=()=>{
        try {
          const saved=read.result;
          if(saved!==undefined&&!valid(saved))throw new Error('本地记录格式异常，未覆盖现有记录');
          result=structuredClone(saved===undefined?initial:saved);
          // Read and update in one transaction so an older tab cannot restore deleted records.
          if(change)change(result);
          if(!valid(result))throw new Error('关联记录已变化，请刷新页面再试');
          if(change||saved===undefined)store.put(result,'library');
        }catch(error){failure=error;tx.abort();}
      };
      tx.oncomplete=()=>resolve(result); tx.onerror=()=>reject(failure||tx.error); tx.onabort=()=>reject(failure||tx.error||new Error('写入已中止'));
    });
  }
  async function initialize() {
    try {
      const open=indexedDB.open(dbName,1);
      open.onupgradeneeded=()=>open.result.createObjectStore('state');
      open.onblocked=()=>storageError('本地数据库被其他窗口占用，请关闭其他书摘页面后重试。');
      db=await request(open);
      db.onversionchange=()=>{db.close();ready=false;storageError('本地数据库版本已更新，请刷新页面。');};
      state=await transaction();
      ready=true; storageOK(); render();
    } catch(error) { storageError('无法保存本地记录：'+(error.message||'浏览器限制了存储')+'。请下载网页后用普通浏览器打开，或允许此网站存储数据。'); render(); }
  }
  async function commit(change) {
    if(!ready) { notify('本地保存尚不可用，请先处理页面上的提示'); return false; }
    try { state=await transaction(change); storageOK(); return true; }
    catch(error) { storageError('保存失败，操作未生效：'+(error.message||'请检查浏览器存储空间')+'。请保留此页面并导出备份。'); notify('保存失败，未删除或覆盖原记录'); return false; }
  }
  function book(id) { return state.books.find(b=>b.id===id); }
  function empty(message) { return '<div class="empty">'+esc(message)+'</div>'; }
  function button(action,label,extra='') { return `<button type="button" data-action="${action}" ${extra}>${label}</button>`; }
  function renderLibrary() {
    const term=$('#search').value.trim().toLowerCase();
    const shown=state.books.filter(b=>(shelf==='all'||b.type===(shelf==='chinese'?'中文':'英文')) && (category==='全部'||b.category===category) &&
      (!term || [b.title,b.author,...state.quotes.filter(q=>q.bookId===b.id).map(q=>q.content),...state.words.filter(w=>w.bookId===b.id).map(w=>w.word)].join(' ').toLowerCase().includes(term)));
    $('#book-grid').innerHTML=shown.map(b=>{
      const quotes=state.quotes.filter(q=>q.bookId===b.id).length, words=state.words.filter(w=>w.bookId===b.id).length;
      return `<article class="book-card"><button class="book" type="button" data-book="${esc(b.id)}"><div class="cover ${b.cover}"><span>${esc(b.title)}</span></div><h3 class="book-title">${esc(b.title)}</h3><p class="book-author">${esc(b.author)}</p><div class="book-meta"><span>${esc(b.category)}</span><span>${quotes} 条摘录${words?' · '+words+' 个生词':''}</span></div></button><div class="book-actions">${button('edit-book','编辑',`data-id="${esc(b.id)}"`)}${button('delete-book','删除',`class="crud-delete" data-id="${esc(b.id)}"`)}</div></article>`;
    }).join('')||empty('没有找到书籍，点击“新增书籍”开始记录。');
    const options=shelf==='all'?[...new Set([...categories.中文,...categories.英文])]:categories[shelf==='chinese'?'中文':'英文'];
    $('#filters').innerHTML=['全部',...options].map(c=>`<button type="button" data-filter="${esc(c)}" class="${category===c?'active':''}">${esc(c)}</button>`).join('');
    $$('[data-shelf]').forEach(el=>el.classList.toggle('active',el.dataset.shelf===shelf));
    $('.recent').innerHTML=state.quotes.slice(0,2).map(q=>`<article class="quote"><p>${esc(q.content)}</p><small>《${esc(book(q.bookId)?.title)}》 · ${esc(q.page)}</small></article>`).join('')||empty('还没有摘录');
  }
  function inspirationHTML(t) {
    return `<article class="thought"><div class="inbox-actions">${!t.bookId?button('move','归入书籍',`data-id="${esc(t.id)}"`):''}${button('delete-inspiration','删除',`class="crud-delete" data-id="${esc(t.id)}"`)}</div><p>${esc(t.content)}</p><small>${esc(t.date)} · ${t.bookId?'《'+esc(book(t.bookId)?.title)+'》':'未归类'}</small></article>`;
  }
  function renderInbox() {
    const all=state.inspirations, shown=overview?all:all.filter(t=>!t.bookId), unclassified=all.filter(t=>!t.bookId).length;
    $('#inbox-view h1').textContent=overview?'灵感总览':'灵感信箱';
    $('#inbox-view .subtitle').textContent=overview?'所有灵感记录，包含未归类灵感和已归入书籍的感想。':'还没想好归到哪本书的念头，先放在这里。';
    const toggle=$('[data-action="inspiration-overview"]'); toggle.textContent=overview?'返回信箱':'总览'; toggle.setAttribute('aria-pressed',String(overview));
    $('#inspiration-status').textContent=overview?`全部 ${all.length} 条 · 未归类 ${unclassified} 条 · 已归类 ${all.length-unclassified} 条`:`未归类 ${shown.length} 条`;
    $('#inbox-view .inbox').innerHTML=shown.map(inspirationHTML).join('')||empty(overview?'还没有灵感，记下第一条吧。':'暂无未归类灵感，点击“总览”查看所有记录。');
  }
  function renderDetail() {
    const b=book(currentBook); if(!b) {page='home';return;}
    const quotes=state.quotes.filter(q=>q.bookId===b.id),words=state.words.filter(w=>w.bookId===b.id),thoughts=state.inspirations.filter(t=>t.bookId===b.id);
    $('#detail-title').textContent=b.title; $('#detail-cover').textContent=b.title;
    $('#detail-meta').textContent=`${b.author} · ${b.category} · 已摘录 ${quotes.length} 条`;
    $$('[data-detail-tab]').forEach(el=>{const tab=el.dataset.detailTab;el.classList.toggle('active',tab===detailTab);el.style.display=tab==='words'&&b.type!=='英文'?'none':'';el.textContent=({quotes:'句子摘录',words:'生词',thoughts:'书籍感想'})[tab]+'　'+({quotes,words,thoughts})[tab].length;});
    $('#quote-list').style.display=detailTab==='quotes'?'grid':'none'; $('#word-list').style.display=detailTab==='words'?'grid':'none'; $('#thought-list').style.display=detailTab==='thoughts'?'grid':'none';
    $('#quote-list').innerHTML=quotes.map(q=>`<article class="quote-item"><blockquote>${esc(q.content)}</blockquote>${q.think?'<p>'+esc(q.think)+'</p>':''}<div class="quote-foot"><span>${esc(q.page)}</span>${button('voice','♩ 记录感想',`data-id="${esc(q.id)}"`)}</div><div class="quote-actions">${button('edit-quote','编辑',`data-id="${esc(q.id)}"`)}${button('delete-quote','删除',`class="crud-delete" data-id="${esc(q.id)}"`)}</div></article>`).join('')||empty('还没有摘录，点击“手动录入”添加第一条。');
    $('#word-list').innerHTML=words.map(w=>`<div class="word"><strong>${esc(w.word)}</strong><p>${esc(w.sentence)}<br><small>${esc(w.note)}</small></p></div>`).join('')||empty('暂无生词');
    $('#thought-list').innerHTML=thoughts.map(inspirationHTML).join('')||empty('暂无书籍感想，可在灵感信箱中归类。');
  }
  function render() {
    if(page==='detail')renderDetail();
    $('#library').classList.toggle('hide',page==='detail'||page==='inbox'); $('#detail').classList.toggle('show',page==='detail'); $('#inbox-view').classList.toggle('show',page==='inbox');
    const pageName={home:'总览',chinese:'中文书库',english:'英文书库',search:'搜索',inbox:overview?'灵感总览':'灵感信箱',detail:book(currentBook)?.title};
    $('#crumb').textContent='我的书架　/　'+pageName[page];
    $$('.nav [data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===page));
    $('[data-view="chinese"] .nav-count').textContent=String(state.books.filter(b=>b.type==='中文').length).padStart(2,'0');
    $('[data-view="english"] .nav-count').textContent=String(state.books.filter(b=>b.type==='英文').length).padStart(2,'0');
    $('[data-view="inbox"] .nav-count').textContent=String(state.inspirations.length).padStart(2,'0');
    $('#page-title').textContent=({home:'慢慢读，认真记',chinese:'中文书库',english:'英文书库',search:'搜索结果'})[page]||'我的书架';
    $('#page-subtitle').textContent=page==='search'?'按书名、作者、摘录和生词搜索，结果按书籍归档。':'把读过的句子和当时的想法，留在自己的书架里。';
    renderLibrary();renderInbox();
  }
  function field(label,control) {
    const existingId=control.match(/\bid="([^"]+)"/),fieldId=existingId?existingId[1]:'field-'+id();
    return `<div class="field"><label for="${fieldId}">${label}</label>${existingId?control:control.replace(/^<(input|select|textarea)(\s|>)/,`<$1 id="${fieldId}"$2`)}</div>`;
  }
  function input(name,value='',placeholder='') { return `<input name="${name}" value="${esc(value)}" placeholder="${esc(placeholder)}">`; }
  function textarea(value='') { return `<textarea name="content" placeholder="写下想保存的内容">${esc(value)}</textarea>`; }
  function openModal(title,body,action,confirm='保存') {
    modalAction=action; $('#modal-title').textContent=title;$('#modal-body').innerHTML=body;$('#form-error').hidden=true;
    $('[data-action="save"]').textContent=confirm;$('[data-action="save"]').hidden=!action;$('#modal-wrap').classList.add('show');
  }
  function closeModal() {if(busy)return;$('#modal-wrap').classList.remove('show');modalAction=null;}
  function formError(message) { $('#form-error').hidden=false;$('#form-error').textContent=message; }
  function bookForm(b={title:'',author:'',type:'中文',category:'文学'}) {
    return field('书名',input('title',b.title))+field('作者',input('author',b.author))+field('书库',`<select name="type">${['中文','英文'].map(type=>`<option ${b.type===type?'selected':''}>${type}</option>`).join('')}</select>`)+field('分类',`<select name="category">${[...new Set([...categories.中文,...categories.英文])].map(c=>`<option ${b.category===c?'selected':''}>${c}</option>`).join('')}</select>`);
  }
  function backup() {
    openModal('数据备份与恢复','<p class="capture-info">记录仅保存在当前浏览器。导出 JSON 可在其他浏览器恢复；恢复会替换当前数据。</p><div class="field"><button class="secondary" type="button" data-action="export">⇩ 导出 JSON 备份</button></div>'+field('选择备份文件','<input id="restore-file" type="file" accept=".json,application/json">'),null);
  }
  root.addEventListener('input',event=>{if(event.target.id==='search'){page='search';shelf='all';category='全部';render();}});
  root.addEventListener('change',event=>{
    if(event.target.name==='type'){const select=$('#modal-body [name="category"]');select.innerHTML=categories[event.target.value].map(c=>`<option>${c}</option>`).join('');}
    if(event.target.id==='restore-file') {
      const file=event.target.files[0];if(!file)return;
      file.text().then(text=>{
        const restored=JSON.parse(text);if(!valid(restored))throw new Error('备份格式无效，当前数据未修改');
        openModal('确认恢复备份',`<p>将替换当前书架为备份中的 ${restored.books.length} 本书、${restored.quotes.length} 条摘录和 ${restored.inspirations.length} 条灵感。建议先导出当前备份。</p>`,async()=>commit(next=>{Object.keys(next).forEach(k=>delete next[k]);Object.assign(next,restored);}), '确认恢复');
      }).catch(error=>formError(error.message||'无法读取备份'));
    }
  });
  root.addEventListener('click',async event=>{
    const el=event.target.closest('button');if(!el||busy)return;
    if(el.dataset.view){page=el.dataset.view;if(page==='chinese'||page==='english'){shelf=page;category='全部';}if(page==='home'){shelf='all';category='全部';}render();return;}
    if(el.dataset.shelf){shelf=el.dataset.shelf;category='全部';render();return;}
    if(el.dataset.filter){category=el.dataset.filter;render();return;}
    if(el.dataset.book){currentBook=el.dataset.book;page='detail';detailTab='quotes';render();return;}
    if(el.dataset.detailTab){detailTab=el.dataset.detailTab;render();return;}
    const action=el.dataset.action,target=el.dataset.id;
    switch(action) {
      case 'back': page='home';shelf='all';category='全部';render();break;
      case 'close': closeModal();break;
      case 'inspiration-overview': overview=!overview;render();break;
      case 'add-book': case 'edit-book': {
        const existing=target?book(target):null;
        openModal(existing?'编辑书籍':'新增书籍',bookForm(existing||undefined),async()=>{
          const title=$('[name="title"]').value.trim(),author=$('[name="author"]').value.trim(),type=$('[name="type"]').value,category=$('[name="category"]').value;
          if(!title){formError('请填写书名');return false;}
          if(!categories[type].includes(category)){formError('请选择对应书库的分类');return false;}
          return commit(next=>{const data={title,author,type,category};if(existing)Object.assign(next.books.find(b=>b.id===existing.id),data);else next.books.unshift({id:id(),cover:'blue',...data});});
        });break;
      }
      case 'delete-book': {
        const b=book(target);if(!b)break;
        openModal('删除书籍',`<p>确认删除《${esc(b.title)}》及其摘录、生词和书籍感想？</p>`,()=>commit(next=>{next.books=next.books.filter(b=>b.id!==target);next.quotes=next.quotes.filter(q=>q.bookId!==target);next.words=next.words.filter(w=>w.bookId!==target);next.inspirations=next.inspirations.filter(t=>t.bookId!==target);}), '确认删除');break;
      }
      case 'manual': case 'edit-quote': {
        const existing=state.quotes.find(q=>q.id===target);
        openModal(existing?'编辑书摘':'手动录入摘录',field('摘录内容',textarea(existing?.content))+field('页码',input('page',existing?.page||'')),()=>{
          const content=$('[name="content"]').value.trim(),page=$('[name="page"]').value.trim();if(!content){formError('请填写摘录内容');return false;}
          return commit(next=>{if(existing)Object.assign(next.quotes.find(q=>q.id===target),{content,page});else next.quotes.unshift({id:id(),bookId:currentBook,content,page,think:''});});
        });break;
      }
      case 'delete-quote': openModal('删除书摘','<p>确认删除这条书摘？</p>',()=>commit(next=>{next.quotes=next.quotes.filter(q=>q.id!==target);}), '确认删除');break;
      case 'thought': openModal('记录一条灵感',field('灵感内容',textarea()),()=>{
        const content=$('[name="content"]').value.trim();if(!content){formError('请先输入灵感内容');return false;}
        return commit(next=>next.inspirations.unshift({id:id(),bookId:null,content,date:date()}));
      });break;
      case 'voice': {
        const q=state.quotes.find(q=>q.id===target);if(!q)break;
        openModal('记录摘录感想',field('感想文字',textarea(q.think||'')),()=>commit(next=>{next.quotes.find(q=>q.id===target).think=$('[name="content"]').value.trim();}));break;
      }
      case 'delete-inspiration': openModal('删除灵感','<p>确认删除这条灵感记录？</p>',()=>commit(next=>{next.inspirations=next.inspirations.filter(t=>t.id!==target);}), '确认删除');break;
      case 'move': {
        if(!state.books.length){notify('请先新增一本书');break;}
        openModal('归类到书籍',field('选择目标书籍',`<select name="book">${state.books.map(b=>`<option value="${esc(b.id)}">${esc(b.title)}</option>`).join('')}</select>`),()=>commit(next=>{next.inspirations.find(t=>t.id===target).bookId=$('[name="book"]').value;}),'确认归类');break;
      }
      case 'backup':backup();break;
      case 'export': {
        const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='纸间书摘备份-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('已导出当前记录');break;
      }
      case 'camera':openModal('拍照摘录','<p>当前版本的拍照划线 OCR 仍是演示功能，请使用“手动录入”保存摘录。</p>',null);break;
      case 'save': {
        if(!modalAction)break;busy=true;el.disabled=true;
        try {const saved=await modalAction();if(saved){busy=false;closeModal();render();notify('已保存到此浏览器');}}
        catch(error){formError('操作未完成：'+(error.message||'请重试'));}
        finally{busy=false;el.disabled=false;}break;
      }
    }
  });
  // Never repopulate a saved empty library; example records are only seeded on first use.
  render();initialize();
})();
