// @ts-check
// Trusted classic script: no document-supplied code is evaluated.
/** @param {string} channel */
function installFlowBridge(channel) {
    const scope = 'local-beat-flow';
    const content = /** @type {HTMLElement} */ (document.getElementById('reader-content'));
    const scroller = /** @type {HTMLElement} */ (document.getElementById('reader-scroll'));
    const body = document.body;
    let disposed = false;
    let initialized = false;
    let initializing = false;
    let imageWaitTimer = 0;
    let finishImages = () => {};
    const parentOrigin = /** @type {HTMLScriptElement} */ (document.currentScript).dataset.parentOrigin;
    let generation = 0;
    let progress = 0;
    // Logical progress changes only on navigation or actual scrolling. Layout
    // changes may round the displayed page, but must never move the saved place.
    /** @type {number | undefined} */
    let automaticScrollTop;
    let measuredWidth = 0;
    let measuredHeight = 0;
    let page = 1;
    let total = 1;
    let stride = 1;
    let inset = 28;
    let mode = 'paged';
    let preferenceKey = '';
    let raf = 0;
    let scrollRaf = 0;
    /** @type {{ x: number; y: number } | undefined} */
    let touch;
    /** @type {{distance:number,size:number,next:number} | undefined} */
    let pinch;
    /** @type {Animation | undefined} */
    let turning;
    const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    /** @param {number} value @param {number} min @param {number} max */
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    /** @param {Record<string, unknown>} data */
    const send = (data) => { if (!disposed)
        parent.postMessage({ scope, channel, ...data }, '*'); };
    const publish = () => send({ type: 'location', location: { page, totalPages: total, progress } });
    const readScroll = () => {
        scrollRaf = 0;
        if (disposed || !initialized || mode !== 'scroll')
            return;
        // A resize can clamp the old scroll offset before the new layout has
        // been measured. Restore the logical position before reading that offset.
        if (window.innerWidth !== measuredWidth || window.innerHeight !== measuredHeight) {
            scheduleMeasure(); return;
        }
        if (raf) return;
        const maximum = scroller.scrollHeight - scroller.clientHeight;
        if (automaticScrollTop === undefined || Math.abs(scroller.scrollTop - automaticScrollTop) > 1) {
            automaticScrollTop = undefined;
            if (maximum > 0) progress = clamp(scroller.scrollTop / maximum, 0, 1);
        }
        page = progress > 0.995 ? total : clamp(Math.floor(scroller.scrollTop / stride) + 1, 1, total);
        publish();
    };
    /** @param {number} next @param {boolean} [restoring] */
    const go = (next, restoring = false) => {
        if (disposed || !initialized) return;
        const previous = page;
        page = clamp(Math.round(next), 1, total);
        if (!restoring) progress = total <= 1 ? 1 : (page - 1) / (total - 1);
        if (mode === 'paged') {
            const from = content.style.transform;
            content.style.transform = `translateX(-${(page - 1) * stride}px)`;
            turning?.cancel();
            if (!restoring && previous !== page && !reducedMotion()) {
                turning = content.animate?.([{ transform: from }, { transform: content.style.transform }], { duration: 180, easing: 'cubic-bezier(.16,1,.3,1)' });
            }
            publish();
        }
        else {
            scroller.scrollTop = page === total ? scroller.scrollHeight : (page - 1) * stride;
            automaticScrollTop = scroller.scrollTop;
            readScroll();
        }
    };
    const measure = () => {
        raf = 0;
        if (disposed || !initialized)
            return;
        turning?.cancel();
        const saved = progress;
        measuredWidth = window.innerWidth;
        measuredHeight = window.innerHeight;
        const width = Math.max(80, Math.min(760, window.innerWidth - 56));
        inset = (window.innerWidth - width) / 2;
        scroller.style.paddingInline = `${inset}px`;
        const height = Math.max(100, window.innerHeight - 48);
        scroller.style.overflow = mode === 'paged' ? 'hidden' : 'auto';
        content.style.transform = '';
        if (mode === 'paged') {
            Object.assign(content.style, { width: `${width}px`, maxWidth: 'none', height: `${height}px`, columnWidth: `${width}px`, columnGap: '40px', columnFill: 'auto', margin: '0' });
            stride = width + 40;
            total = clamp(Math.round((content.scrollWidth + 40) / stride), 1, 100000);
            go(Math.round(saved * (total - 1)) + 1, true);
        }
        else {
            Object.assign(content.style, { width: '100%', maxWidth: '760px', height: 'auto', columnWidth: 'auto', columnGap: 'normal', columnFill: 'balance', margin: '0 auto' });
            stride = height;
            total = clamp(Math.ceil(content.scrollHeight / height), 1, 100000);
            scroller.scrollTop = saved * Math.max(0, scroller.scrollHeight - scroller.clientHeight);
            automaticScrollTop = scroller.scrollTop;
            readScroll();
        }
    };
    const scheduleMeasure = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    /** @param {unknown} value */
    const applyPreferences = (value) => {
        if (!value || typeof value !== 'object')
            return false;
        const prefs = /** @type {Record<string, unknown>} */ (value);
        if (!['paged', 'scroll'].includes(String(prefs.mode)) || !['paper', 'sepia', 'night'].includes(String(prefs.theme)) || !['serif', 'sans'].includes(String(prefs.font)) || !Number.isFinite(prefs.fontSize) || !Number.isFinite(prefs.lineHeight))
            return false;
        const nextKey = [prefs.mode, prefs.theme, prefs.font, prefs.fontSize, prefs.lineHeight].join('|');
        if (preferenceKey === nextKey) return false;
        preferenceKey = nextKey;
        mode = String(prefs.mode);
        const colors = prefs.theme === 'night' ? ['#202027', '#e3e0d8'] : prefs.theme === 'sepia' ? ['#f3e7cd', '#443926'] : ['#fcfcfa', '#25232b'];
        body.style.setProperty('--paper', colors[0]);
        body.style.setProperty('--ink', colors[1]);
        body.style.fontSize = `${clamp(Number(prefs.fontSize), 12, 48)}px`;
        body.style.lineHeight = String(clamp(Number(prefs.lineHeight), 1, 3));
        body.style.fontFamily = prefs.font === 'serif' ? 'Georgia, "Times New Roman", serif' : '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        return true;
    };
    /** @param {string} id */
    const jump = (id) => {
        if (disposed || !initialized) return;
        // An outline/search command may arrive while closing its sidebar or
        // changing typography. Read the target only after that layout is current.
        if (raf || window.innerWidth !== measuredWidth || window.innerHeight !== measuredHeight) {
            cancelAnimationFrame(raf); raf = 0; measure();
        }
        automaticScrollTop = undefined;
        const target = document.getElementById(id);
        if (!target || !content.contains(target))
            return;
        turning?.cancel();
        const rect = target.getBoundingClientRect();
        if (mode === 'paged')
            go(Math.floor((rect.left - inset + (page - 1) * stride) / stride) + 1);
        else {
            scroller.scrollTop += rect.top - 24;
            readScroll();
        }
    };
    /** @param {string} query @param {number} requestId */
    const search = async (query, requestId) => {
        const current = ++generation;
        content.querySelectorAll('mark[data-reader-match]').forEach((mark) => mark.replaceWith(document.createTextNode(mark.textContent ?? '')));
        content.normalize();
        /** @type {{id:string,label:string}[]} */
        const matches = [];
        if (!query.trim()) {
            send({ type: 'search-result', requestId, matches });
            return;
        }
        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
        /** @type {Text[]} */
        const nodes = [];
        let node;
        while ((node = walker.nextNode()))
            nodes.push(/** @type {Text} */ (node));
        const needle = query.toLocaleLowerCase();
        for (let index = 0; index < nodes.length && matches.length < 200; index++) {
            if (disposed || current !== generation)
                return;
            const text = nodes[index].data;
            const lower = text.toLocaleLowerCase();
            let start = 0;
            let found = lower.indexOf(needle);
            if (found >= 0) {
                const fragment = document.createDocumentFragment();
                while (found >= 0 && matches.length < 200) {
                    fragment.append(document.createTextNode(text.slice(start, found)));
                    const mark = document.createElement('mark');
                    mark.dataset.readerMatch = '';
                    mark.id = `reader-match-${matches.length}`;
                    mark.textContent = text.slice(found, found + query.length);
                    fragment.append(mark);
                    matches.push({ id: mark.id, label: text.slice(Math.max(0, found - 35), found + query.length + 65).slice(0, 512) });
                    start = found + query.length;
                    found = lower.indexOf(needle, start);
                }
                fragment.append(document.createTextNode(text.slice(start)));
                nodes[index].replaceWith(fragment);
            }
            if (index % 100 === 99)
                await new Promise((resolve) => setTimeout(resolve, 0));
        }
        if (!disposed && current === generation) {
            send({ type: 'search-result', requestId, matches });
            scheduleMeasure();
        }
    };
    const userScrollIntent = () => { if (initialized) automaticScrollTop = undefined; };
    const scroll = () => { if (!scrollRaf && mode === 'scroll')
        scrollRaf = requestAnimationFrame(readScroll); };
    /** @param {MouseEvent} event */
    const clicked = (event) => {
        const link = event.target instanceof Element ? event.target.closest('a') : null;
        if (!link)
            return;
        event.preventDefault();
        const href = link.getAttribute('href');
        if (href?.startsWith('#')) {
            try {
                jump(decodeURIComponent(href.slice(1)));
            }
            catch { /* Ignore malformed local anchors. */ }
        }
    };
    /** @param {TouchEvent} event */
    const touchStart = (event) => {
        if (event.touches.length === 2) {
            const size = parseFloat(body.style.fontSize) || 18;
            pinch = { distance: Math.max(1, Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY)), size, next: size };
        }
        touch = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : undefined; };
    /** @param {TouchEvent} event */
    const touchMove = (event) => {
        if (!pinch || event.touches.length !== 2) return;
        event.preventDefault();
        const distance = Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY);
        pinch.next = clamp(Math.round(pinch.size * distance / pinch.distance), 14, 32);
    };
    const touchCancel = () => { touch = undefined; pinch = undefined; };
    /** @param {TouchEvent} event */
    const touchEnd = (event) => {
        const start = touch;
        touch = undefined;
        if (pinch) {
            const fontSize = pinch.next; pinch = undefined;
            body.style.fontSize = `${fontSize}px`; scheduleMeasure();
            send({ type: 'font-size', fontSize });
            return;
        }
        if (!start || mode !== 'paged' || !event.changedTouches[0] || document.getSelection()?.toString())
            return;
        const dx = event.changedTouches[0].clientX - start.x;
        const dy = event.changedTouches[0].clientY - start.y;
        if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5)
            go(page + (dx < 0 ? 1 : -1));
    };
    /** @param {KeyboardEvent} event */
    const keydown = (event) => {
        if (['ArrowRight', 'PageDown', 'ArrowLeft', 'PageUp'].includes(event.key)) {
            event.preventDefault();
            go(page + (event.key === 'ArrowRight' || event.key === 'PageDown' ? 1 : -1));
        }
        if (event.key === 'Escape')
            send({ type: 'escape' });
    };
    /** @param {MessageEvent} event */
    const receive = (event) => {
        if (disposed || event.source !== parent || event.origin !== parentOrigin || !event.data || typeof event.data !== 'object')
            return;
        const data = event.data;
        if (data.scope !== scope || data.channel !== channel)
            return;
        if (data.type === 'hello') {
            send({ type: 'ready' });
            return;
        }
        if (data.type === 'dispose') {
            dispose();
            return;
        }
        if (data.type === 'init' && !initialized && !initializing && Number.isFinite(data.progress) && applyPreferences(data.preferences)) {
            if (!Array.isArray(data.resources) || data.resources.length > 1000 || !data.resources.every((/** @type {unknown} */ resource) => resource instanceof Blob))
                return;
            for (const resource of data.resources)
                resourceUrls.push(URL.createObjectURL(resource));
            images.forEach((image) => {
                const index = Number(image.dataset.readerResource);
                if (image.hasAttribute('data-reader-resource') && Number.isSafeInteger(index) && resourceUrls[index])
                    image.src = resourceUrls[index];
            });
            initializing = true;
            progress = clamp(data.progress, 0, 1);
            // Blob decoding is asynchronous. Preserve the saved location until
            // initial image dimensions are known, instead of marking a transient
            // one-page layout as finished and later jumping to the last page.
            const settle = () => {
                images.forEach((image) => { image.removeEventListener('load', settled); image.removeEventListener('error', settled); });
                clearTimeout(imageWaitTimer);
                if (disposed) return;
                initialized = true; initializing = false; measure(); send({ type: 'initialized' });
            };
            const settled = () => { if (images.every((image) => image.complete)) settle(); };
            finishImages = settle;
            if (images.every((image) => image.complete)) settle();
            else {
                images.forEach((image) => { image.addEventListener('load', settled); image.addEventListener('error', settled); });
                imageWaitTimer = window.setTimeout(settle, 4000);
            }
            return;
        }
        if (!initialized)
            return;
        if (data.type === 'preferences' && applyPreferences(data.preferences))
            scheduleMeasure();
        else if (data.type === 'page' && Number.isFinite(data.page))
            go(data.page);
        else if (data.type === 'progress' && Number.isFinite(data.progress)) {
            progress = clamp(data.progress, 0, 1);
            if (mode === 'paged') go(Math.round(progress * (total - 1)) + 1, true);
            else {
                scroller.scrollTop = progress * Math.max(0, scroller.scrollHeight - scroller.clientHeight);
                automaticScrollTop = scroller.scrollTop;
                readScroll();
            }
        }
        else if (data.type === 'outline' && typeof data.id === 'string' && data.id.length <= 512)
            jump(data.id);
        else if (data.type === 'cancel-search')
            generation++;
        else if (data.type === 'search' && typeof data.query === 'string' && data.query.length <= 512 && Number.isSafeInteger(data.requestId) && data.requestId > 0)
            void search(data.query, data.requestId).catch(() => send({ type: 'error' }));
    };
    const images = [...content.querySelectorAll('img')];
    /** @type {string[]} */
    const resourceUrls = [];
    const observer = new ResizeObserver(scheduleMeasure);
    const dispose = () => {
        if (disposed)
            return;
        disposed = true;
        finishImages(); clearTimeout(imageWaitTimer);
        generation++;
        resourceUrls.forEach((url) => URL.revokeObjectURL(url));
        turning?.cancel();
        observer.disconnect();
        cancelAnimationFrame(raf);
        cancelAnimationFrame(scrollRaf);
        window.removeEventListener('message', receive);
        window.removeEventListener('resize', scheduleMeasure);
        window.removeEventListener('pagehide', dispose);
        scroller.removeEventListener('scroll', scroll);
        scroller.removeEventListener('wheel', userScrollIntent);
        scroller.removeEventListener('pointerdown', userScrollIntent);
        scroller.removeEventListener('touchstart', userScrollIntent);
        body.removeEventListener('click', clicked);
        body.removeEventListener('touchstart', touchStart);
        body.removeEventListener('touchend', touchEnd);
        body.removeEventListener('touchmove', touchMove);
        body.removeEventListener('touchcancel', touchCancel);
        document.removeEventListener('keydown', keydown);
        images.forEach((image) => image.removeEventListener('load', scheduleMeasure));
    };
    window.addEventListener('message', receive);
    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('pagehide', dispose);
    scroller.addEventListener('scroll', scroll, { passive: true });
    scroller.addEventListener('wheel', userScrollIntent, { passive: true });
    scroller.addEventListener('pointerdown', userScrollIntent, { passive: true });
    scroller.addEventListener('touchstart', userScrollIntent, { passive: true });
    body.addEventListener('click', clicked);
    body.addEventListener('touchstart', touchStart, { passive: true });
    body.addEventListener('touchend', touchEnd, { passive: true });
    body.addEventListener('touchmove', touchMove, { passive: false });
    body.addEventListener('touchcancel', touchCancel);
    document.addEventListener('keydown', keydown);
    images.forEach((image) => image.addEventListener('load', scheduleMeasure));
    observer.observe(document.documentElement);
    send({ type: 'ready' });
}
// Embedded as a trusted inline script in an opaque-origin frame. The parent
// CSP pins this exact source by hash; the frame additionally requires its nonce.
const channel = document.currentScript?.getAttribute('data-reader-channel');
if (channel && /^[a-f0-9]{32}$/.test(channel))
    installFlowBridge(channel);
