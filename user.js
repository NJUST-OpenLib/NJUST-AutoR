// ==UserScript==
// @name         NJUST 评教流水线 V7.9
// @namespace    http://tampermonkey.net/
// @version      7.9
// @description  淡色简洁 UI、修复浮点精度显示、扰动题优先选 Δ=0 题、Storage 原始面板。
// @author       Gemini / improved by Claude
// @match        http://202.119.81.112:9080/njlgdx/xspj/xspj_list.do*
// @match        http://202.119.81.112:9080/njlgdx/xspj/xspj_edit.do*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ── 存储键名 ──────────────────────────────────────────────────────
    const KEY_STORE   = 'njust_eval_v7_9';
    const KEY_RUNNING = 'njust_eval_running';
    const KEY_BUSY    = 'njust_eval_busy';
    const KEY_LOG     = 'njust_eval_log';
    const KEY_LOGLVL  = 'njust_eval_loglvl';
    const PARAM_AUTO  = 'isAutoEval';
    const MAX_LOG     = 300;

    // ── 日志 ──────────────────────────────────────────────────────────
    const LOG_LEVELS = { debug: 0, info: 1, success: 2, warn: 3, error: 4 };
    const LOG_LABELS = { debug: 'DBG', info: 'INF', success: 'OK ', warn: 'WRN', error: 'ERR' };
    const LOG_COLORS = { debug: '#9f7aea', info: '#3182ce', success: '#276749', warn: '#c05621', error: '#c53030' };

    const loadLogs    = () => JSON.parse(localStorage.getItem(KEY_LOG) || '[]');
    const clearLogs   = () => { localStorage.removeItem(KEY_LOG); renderLogPanel(); };
    const getMinLevel = () => { const s = localStorage.getItem(KEY_LOGLVL); return (s && LOG_LEVELS[s] !== undefined) ? s : 'info'; };
    const setMinLevel = (l) => { localStorage.setItem(KEY_LOGLVL, l); renderLogPanel(); };

    const pushLog = (msg, level = 'info') => {
        const logs = loadLogs();
        logs.push({ ts: new Date().toTimeString().slice(0, 8), msg, level });
        if (logs.length > MAX_LOG) logs.splice(0, logs.length - MAX_LOG);
        localStorage.setItem(KEY_LOG, JSON.stringify(logs));
        renderLogPanel();
    };
    const logDebug   = (m) => pushLog(m, 'debug');
    const logInfo    = (m) => pushLog(m, 'info');
    const logSuccess = (m) => pushLog(m, 'success');
    const logWarn    = (m) => pushLog(m, 'warn');
    const logError   = (m) => pushLog(m, 'error');

    const renderLogPanel = () => {
        const el = document.getElementById('v79-log-content');
        if (!el) return;
        const minP = LOG_LEVELS[getMinLevel()] ?? 1;
        const lines = loadLogs().filter(l => (LOG_LEVELS[l.level] ?? 1) >= minP);
        el.innerHTML = lines.map(l =>
            `<div><span style="color:#a0aec0;user-select:none">[${l.ts}]</span> ` +
            `<span style="color:${LOG_COLORS[l.level]};font-weight:600">[${LOG_LABELS[l.level]}]</span> ` +
            `<span style="color:#4a5568">${esc(l.msg)}</span></div>`
        ).join('');
        el.scrollTop = el.scrollHeight;
        const sel = document.getElementById('log-level-sel');
        if (sel) sel.value = getMinLevel();
    };

    // ── 工具 ──────────────────────────────────────────────────────────
    const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const qp = (url, key) => {
        try { return new URL(url, location.origin).searchParams.get(key) || ''; }
        catch { return url.match(new RegExp(`[?&]${key}=([^&]+)`))?.[1] || ''; }
    };

    const courseKey = (url) => {
        const cid = qp(url, 'jx02id'), tid = qp(url, 'jg0101id');
        return cid && tid ? `${cid}__${tid}` : null;
    };

    const withAuto = (url, val) => url + (url.includes('?') ? '&' : '?') + PARAM_AUTO + '=' + val;

    /** 四舍五入消除浮点噪声，用于显示 */
    const fmt = (n) => parseFloat(n.toFixed(6)).toString();

    const loadStore = () => JSON.parse(localStorage.getItem(KEY_STORE) || '{}');
    const saveStore = (v) => localStorage.setItem(KEY_STORE, JSON.stringify(v));

    const renderStoragePanel = () => {
        const el = document.getElementById('v79-storage-pre');
        if (el) el.textContent = JSON.stringify(loadStore(), null, 2);
    };

    // ════════════════════════════════════════════════════════════════
    //  CSS — 淡色简洁风
    // ════════════════════════════════════════════════════════════════
    const injectCSS = () => {
        if (document.getElementById('v79-style')) return;
        const style = document.createElement('style');
        style.id = 'v79-style';
        style.textContent = `
            /* 面板 */
            #v79-panel {
                position: fixed; top: 20px; right: 20px; width: 480px;
                background: #fff; border-radius: 10px;
                box-shadow: 0 4px 24px rgba(0,0,0,0.10);
                z-index: 99999;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                display: flex; flex-direction: column;
                border: 1px solid #e2e8f0;
                max-height: 90vh; overflow: hidden;
                transition: transform 0.25s ease;
                font-size: 13px; color: #2d3748;
            }
            /* 头部 */
            #v79-header {
                padding: 11px 14px; background: #f7fafc;
                border-bottom: 1px solid #e2e8f0;
                cursor: move; display: flex; align-items: center;
                gap: 8px; user-select: none; flex-shrink: 0;
            }
            #v79-header b { flex: 1; font-size: 14px; color: #2d3748; }
            #v79-min-btn {
                width: 28px; height: 28px; border-radius: 6px;
                background: #edf2f7; color: #4a5568; border: none;
                font-size: 16px; line-height: 1; cursor: pointer;
                display: flex; align-items: center; justify-content: center;
                flex-shrink: 0;
            }
            #v79-min-btn:hover { background: #e2e8f0; }

            /* 课程列表 */
            #v79-body { padding: 10px 14px; overflow-y: auto; flex: 1; }
            .ci {
                display: flex; align-items: center; gap: 8px;
                padding: 8px 10px; border-radius: 6px;
                border: 1px solid #edf2f7; margin-bottom: 6px;
                background: #f7fafc;
            }
            .ci:last-child { margin-bottom: 0; }
            .ci-name  { flex: 1; font-weight: 500; color: #2d3748; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .ci-teacher { color: #718096; white-space: nowrap; }
            .ci-zpf   { color: #276749; font-size: 11px; background: #f0fff4; padding: 1px 7px; border-radius: 8px; border: 1px solid #c6f6d5; white-space: nowrap; }
            .st-wait  { font-size: 11px; padding: 1px 8px; border-radius: 8px; background: #fffaf0; color: #c05621; border: 1px solid #feebc8; white-space: nowrap; }
            .st-done  { font-size: 11px; padding: 1px 8px; border-radius: 8px; background: #f0fff4; color: #276749; border: 1px solid #c6f6d5; white-space: nowrap; }
            input[type="checkbox"] { cursor: pointer; width: 14px; height: 14px; flex-shrink: 0; accent-color: #3182ce; }

            /* 按钮 */
            .vb { padding: 6px 13px; border-radius: 6px; border: none; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.15s; }
            .vb-primary { background: #ebf4ff; color: #2b6cb0; border: 1px solid #bee3f8; }
            .vb-primary:hover { background: #bee3f8; }
            .vb-outline { background: #fff; color: #4a5568; border: 1px solid #cbd5e0; }
            .vb-outline:hover { background: #f7fafc; }
            .vb-danger  { background: #fff; color: #c53030; border: 1px solid #fed7d7; }
            .vb-danger:hover  { background: #fff5f5; }
            .vb-mini { padding: 3px 9px; font-size: 11px; }

            /* 底部折叠区共用 */
            .v79-section { flex-shrink: 0; border-top: 1px solid #edf2f7; }
            .v79-sec-hd {
                padding: 7px 14px; display: flex; align-items: center; gap: 8px;
                cursor: pointer; user-select: none; background: #f7fafc;
            }
            .v79-sec-hd span.lbl { font-size: 11px; color: #4a5568; font-weight: 600; flex: 1; }
            .v79-sec-hd span.arr { font-size: 13px; color: #a0aec0; }
            .v79-sec-body { display: none; }
            .v79-sec-body.open { display: block; }

            /* 日志 */
            #v79-log-content {
                max-height: 160px; overflow-y: auto;
                padding: 4px 14px 10px;
                font-size: 11px; line-height: 1.75;
                font-family: 'SFMono-Regular', Consolas, monospace;
                background: #f7fafc;
            }
            .log-level-select {
                font-size: 11px; padding: 1px 5px; border-radius: 4px;
                background: #fff; color: #4a5568; border: 1px solid #cbd5e0; cursor: pointer;
            }

            /* Storage 原始数据 */
            #v79-storage-pre {
                margin: 0; padding: 8px 14px 12px;
                font-size: 10.5px; line-height: 1.6;
                font-family: 'SFMono-Regular', Consolas, monospace;
                white-space: pre-wrap; word-break: break-all;
                color: #4a5568; background: #f7fafc;
                max-height: 200px; overflow-y: auto;
            }

            .minimized { transform: translateY(calc(100% - 44px)); }
        `;
        document.head.appendChild(style);
    };

    // ════════════════════════════════════════════════════════════════
    //  LIST 页面
    // ════════════════════════════════════════════════════════════════
    if (location.href.includes('xspj_list.do')) {
        injectCSS();

        const panel = document.createElement('div');
        panel.id = 'v79-panel';
        panel.innerHTML = `
            <div id="v79-header">
                <b>🎓 评教中心 V7.9</b>
                <button id="v79-min-btn" title="最小化">−</button>
            </div>
            <div id="v79-body">
                <div id="course-list"></div>
                <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
                    <button id="start-btn"     class="vb vb-primary" style="flex:2">▶ 开始全自动流水线</button>
                    <button id="reset-btn"     class="vb vb-outline" style="flex:1">重置缓存</button>
                    <button id="clear-log-btn" class="vb vb-danger"  style="flex:1">清空日志</button>
                </div>
            </div>

            <!-- 日志区 -->
            <div class="v79-section">
                <div class="v79-sec-hd" id="log-hd">
                    <span class="lbl">📋 运行日志</span>
                    <select id="log-level-sel" class="log-level-select">
                        <option value="debug">DEBUG+</option>
                        <option value="info" selected>INFO+</option>
                        <option value="success">OK+</option>
                        <option value="warn">WARN+</option>
                        <option value="error">ERROR</option>
                    </select>
                    <span class="arr" id="log-arr">▴</span>
                </div>
                <div class="v79-sec-body open" id="v79-log-content"></div>
            </div>

            <!-- Storage 原始数据 -->
            <div class="v79-section">
                <div class="v79-sec-hd" id="store-hd">
                    <span class="lbl">🗄 Storage 原始数据</span>
                    <span class="arr" id="store-arr">▾</span>
                </div>
                <div class="v79-sec-body" id="store-body">
                    <pre id="v79-storage-pre"></pre>
                </div>
            </div>
        `;
        document.body.appendChild(panel);

        // 最小化
        document.getElementById('v79-min-btn').onclick = (e) => {
            e.stopPropagation();
            panel.classList.toggle('minimized');
        };

        // 日志折叠
        const logBody = document.getElementById('v79-log-content');
        const logArr  = document.getElementById('log-arr');
        document.getElementById('log-hd').onclick = () => {
            logBody.classList.toggle('open');
            logArr.textContent = logBody.classList.contains('open') ? '▴' : '▾';
        };
        document.getElementById('log-level-sel').addEventListener('change', (e) => {
            e.stopPropagation(); setMinLevel(e.target.value);
        });

        // Storage 折叠（默认收起）
        const storeBody = document.getElementById('store-body');
        const storeArr  = document.getElementById('store-arr');
        document.getElementById('store-hd').onclick = () => {
            storeBody.classList.toggle('open');
            storeArr.textContent = storeBody.classList.contains('open') ? '▴' : '▾';
            if (storeBody.classList.contains('open')) renderStoragePanel();
        };

        // 拖拽
        let drag = false, off = [0, 0];
        document.getElementById('v79-header').onmousedown = (e) => {
            if (e.target.id === 'v79-min-btn') return;
            drag = true; off = [panel.offsetLeft - e.clientX, panel.offsetTop - e.clientY];
        };
        document.onmousemove = (e) => {
            if (!drag) return;
            panel.style.left = (e.clientX + off[0]) + 'px';
            panel.style.top  = (e.clientY + off[1]) + 'px';
            panel.style.right = 'auto';
        };
        document.onmouseup = () => { drag = false; };

        // ── 渲染课程列表 ─────────────────────────────────────────────
        const renderList = () => {
            const store = loadStore();
            const rows  = document.querySelectorAll('#dataList tr:not(:first-child)');
            const box   = document.getElementById('course-list');
            box.innerHTML = '';

            let scanned = 0, added = 0;
            rows.forEach(row => {
                if (row.cells.length < 8) return;
                const a = row.querySelector('a[href*="openWindow"]');
                if (!a) return;
                const rawUrl = a.getAttribute('href').match(/'([^']+)'/)?.[1];
                if (!rawUrl) return;

                const name    = row.cells[2].innerText.trim();
                const teacher = row.cells[3].innerText.trim();
                const zpf     = qp(rawUrl, 'zpf');
                const done    = row.cells[6].innerText.trim() === '是';
                const key     = courseKey(rawUrl);
                if (!key) return;

                scanned++;
                if (!store[key]) { added++; store[key] = { auto: true, done: false, name, teacher, zpf, url: rawUrl }; }
                if (done) store[key].done = true;

                const info = store[key];
                const el   = document.createElement('div');
                el.className = 'ci';
                el.innerHTML =
                    `<input type="checkbox" class="course-ck" data-key="${key}" ${info.auto ? 'checked' : ''} ${info.done ? 'disabled' : ''}>` +
                    `<span class="ci-name" title="${esc(name)}">${esc(name)}</span>` +
                    `<span class="ci-teacher">${esc(teacher)}</span>` +
                    (zpf ? `<span class="ci-zpf">综评 ${esc(zpf)}</span>` : '') +
                    `<span class="${info.done ? 'st-done' : 'st-wait'}">${info.done ? '✓ 已完成' : '等待中'}</span>` +
                    `<button class="vb vb-outline vb-mini"
                        onclick="event.stopPropagation();window.open('${withAuto(rawUrl,'false')}','_blank','width=1200,height=800,toolbar=no,menubar=no,resizable=yes')">手动</button>`;
                box.appendChild(el);
            });

            document.querySelectorAll('.course-ck').forEach(ck => {
                ck.onchange = (e) => {
                    const k = e.target.getAttribute('data-key');
                    store[k].auto = e.target.checked;
                    saveStore(store);
                    logDebug(`勾选变更 [${store[k].name}] → auto=${store[k].auto}`);
                };
            });

            saveStore(store);
            if (added) logInfo(`扫描完成：${scanned} 门，新增 ${added} 门`);
            else logDebug(`扫描完成：${scanned} 门，无新增`);
        };

        // ── 执行下一个 ───────────────────────────────────────────────
        const execNext = () => {
            if (localStorage.getItem(KEY_RUNNING) !== 'true') return;
            if (localStorage.getItem(KEY_BUSY) === 'true') { logWarn('窗口锁定中，等待评价页关闭...'); return; }

            const store   = loadStore();
            const pending = Object.keys(store).filter(k => store[k].auto && !store[k].done);
            logDebug(`待评价队列：${pending.length} 门`);

            const next = pending[0];
            if (next) {
                const c = store[next];
                localStorage.setItem(KEY_BUSY, 'true');
                logInfo(`▶ 打开：${c.name}（${c.teacher}）`);
                window.open(withAuto(c.url, 'true'), '_blank', 'width=1200,height=800,toolbar=no,menubar=no,resizable=yes');
            } else {
                localStorage.setItem(KEY_RUNNING, 'false');
                localStorage.setItem(KEY_BUSY,    'false');
                logSuccess('🎉 所有课程已完成！');
                renderList();
                alert('流水线已全部完成！');
                location.reload();
            }
        };

        // ── 按钮 ─────────────────────────────────────────────────────
        document.getElementById('start-btn').onclick = () => {
            localStorage.setItem(KEY_RUNNING, 'true');
            localStorage.setItem(KEY_BUSY,    'false');
            const pending = Object.keys(loadStore()).filter(k => { const s = loadStore()[k]; return s.auto && !s.done; }).length;
            logSuccess(`══ 流水线启动，待评价 ${pending} 门 ══`);
            renderList();
            execNext();
        };
        document.getElementById('reset-btn').onclick = () => {
            if (!confirm('确定重置所有缓存？')) return;
            [KEY_STORE, KEY_RUNNING, KEY_BUSY].forEach(k => localStorage.removeItem(k));
            logWarn('缓存已重置，页面即将刷新');
            setTimeout(() => location.reload(), 400);
        };
        document.getElementById('clear-log-btn').onclick = () => clearLogs();

        // ── 跨标签 storage ───────────────────────────────────────────
        window.addEventListener('storage', (e) => {
            if (![KEY_STORE, KEY_BUSY, KEY_RUNNING].includes(e.key)) return;
            renderList(); renderLogPanel();
            if (e.key === KEY_BUSY && e.newValue === 'false' && localStorage.getItem(KEY_RUNNING) === 'true') {
                logDebug('收到 busy=false，0.8s 后执行下一个');
                setTimeout(execNext, 800);
            }
        });

        renderList();
        renderLogPanel();

        if (localStorage.getItem(KEY_RUNNING) === 'true') {
            logWarn('页面刷新恢复：流水线运行中');
            if (localStorage.getItem(KEY_BUSY) !== 'true') setTimeout(execNext, 1200);
            else logDebug('存在 busy 锁，等待 edit 页信号');
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  EDIT 页面
    // ════════════════════════════════════════════════════════════════
    if (location.href.includes('xspj_edit.do')) {
        const isAuto = new URLSearchParams(location.search).get(PARAM_AUTO) !== 'false';

        const bar = document.createElement('div');
        bar.style.cssText = 'position:sticky;top:0;left:0;width:100%;background:#ebf8ff;color:#2c5282;z-index:99999;' +
            'padding:9px 20px;font-family:sans-serif;display:flex;justify-content:space-between;align-items:center;' +
            'box-shadow:0 1px 6px rgba(0,0,0,0.08);box-sizing:border-box;border-bottom:1px solid #bee3f8;';
        bar.innerHTML =
            `<div style="font-weight:600;font-size:13px;display:flex;align-items:center;gap:10px;">` +
            `<span>🎓 评教助手 V7.9</span>` +
            `<span id="edit-tag" style="font-size:11px;padding:2px 10px;border-radius:8px;` +
            `background:#bee3f8;color:#2c5282;border:1px solid #90cdf4;">初始化...</span></div>` +
            `<button id="stop-btn" style="background:#fff;color:#2b6cb0;border:1px solid #bee3f8;` +
            `padding:4px 12px;border-radius:5px;font-weight:700;cursor:pointer;font-size:12px;">停止自动提交</button>`;
        document.body.prepend(bar);

        const tag = document.getElementById('edit-tag');
        const editLog = (msg, level = 'info') => { tag.textContent = msg; pushLog('[edit] ' + msg, level); };

        let stopped = !isAuto;
        document.getElementById('stop-btn').onclick = () => {
            stopped = true;
            editLog('已手动停止', 'warn');
            document.getElementById('stop-btn').style.display = 'none';
        };

        if (!isAuto) { tag.textContent = '手动模式'; return; }

        setTimeout(() => {
            const key      = courseKey(location.href);
            const store    = loadStore();
            const info     = key ? store[key] : null;
            const name     = info?.name    || '未知课程';
            const teacher  = info?.teacher || qp(location.href, 'jg0101id');
            const zpf      = qp(location.href, 'zpf');

            editLog(`进入：${name}（${teacher}）`, 'info');
            logDebug(`[edit] key=${key} zpf=${zpf} jx02id=${qp(location.href,'jx02id')} jg0101id=${qp(location.href,'jg0101id')}`);

            // ── 收集单选题 ────────────────────────────────────────────
            const groups = {};
            document.querySelectorAll('input[type="radio"]').forEach(r => {
                if (!groups[r.name]) groups[r.name] = [];
                const idx  = r.id.split('_')[1];
                const fzEl = document.getElementsByName(`pj0601fz_${idx}_${r.value}`)[0];
                groups[r.name].push({ el: r, score: fzEl ? parseFloat(fzEl.value) || 0 : 0 });
            });

            const gkeys = Object.keys(groups);
            logDebug(`[edit] 共扫描到 ${gkeys.length} 道单选题`);

            // 每组降序排列
            gkeys.forEach(k => groups[k].sort((a, b) => b.score - a.score));

            // ── 扰动题选择 ────────────────────────────────────────────
            // 策略：选分差最小的题作为扰动题（选次高分）。
            // 分差 = 0 意味着次选项与最高分相同（如文字题），是最优扰动（零损失）。
            // 使用 roundFloat 消除浮点噪声后再比较。
            let minDelta = Infinity, perturbIdx = -1;
            gkeys.forEach((k, i) => {
                const opts = groups[k];
                if (opts.length < 2) return;
                const delta = roundFloat(opts[0].score - opts[1].score);
                logDebug(`[edit] 题${i+1} [${k}]: 最高=${opts[0].score} 次高=${opts[1].score} Δ=${delta}`);
                if (delta < minDelta) { minDelta = delta; perturbIdx = i; }
            });

            logDebug(`[edit] 扰动题：第 ${perturbIdx + 1} 题（Δ=${minDelta}）`);

            // 填写
            let total = 0;
            gkeys.forEach((k, i) => {
                const opts   = groups[k];
                const choice = (i === perturbIdx && opts.length >= 2) ? opts[1] : opts[0];
                if (choice) { choice.el.checked = true; total += choice.score; }
            });

            // 同样用 roundFloat 避免总分显示噪声
            const totalDisplay = roundFloat(total);
            logDebug(`[edit] 填写完成，预计总分 ≈ ${totalDisplay}`);
            editLog(`填写完成（预计 ${totalDisplay} 分）`, 'info');

            // 标记 done
            if (key && store[key]) { store[key].done = true; saveStore(store); }

            if (stopped) { editLog('已停止，不自动提交', 'warn'); return; }
            editLog('即将提交并关闭...', 'success');

            setTimeout(() => {
                if (stopped) return;
                const bc = document.getElementById('bc');
                if (bc) {
                    try { window.saveData(bc, '0'); logDebug('[edit] saveData() 调用成功'); }
                    catch (err) { logError('[edit] saveData() 异常：' + err.message); }
                } else {
                    logWarn('[edit] 未找到 #bc 按钮');
                }
                setTimeout(() => {
                    logSuccess(`✓ ${name}（${teacher}）完成，解除 busy 锁`);
                    localStorage.setItem(KEY_BUSY, 'false');
                    setTimeout(() => window.close(), 300);
                }, 600);
            }, 1000);

        }, 800);
    }

    /** 消除浮点噪声（四舍五入到9位小数） */
    function roundFloat(n) { return Math.round(n * 1e9) / 1e9; }

})();