// ==UserScript==
// @name         NJUST 评教流水线 V7.7 (稳定窗口版)
// @namespace    http://tampermonkey.net/
// @version      7.7
// @description  修复：新窗口模式、busy 锁防止并发、持久化 Log 不因刷新丢失。
// @author       Gemini / fixed by Claude
// @match        http://202.119.81.112:9080/njlgdx/xspj/xspj_list.do*
// @match        http://202.119.81.112:9080/njlgdx/xspj/xspj_edit.do*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = 'njust_eval_v7_6';
    const RUNNING_KEY = 'njust_eval_running';
    const BUSY_KEY    = 'njust_eval_busy';
    const LOG_KEY     = 'njust_eval_log';
    const PARAM_NAME  = 'isAutoEval';

    const MAX_LOG_LINES = 200;

    // ── 工具函数 ──────────────────────────────────────────────────
    const getCompositeKey = (url) => {
        const jx = url.match(/jx02id=([^&]+)/)?.[1] || "";
        const jg = url.match(/jg0101id=([^&]+)/)?.[1] || "";
        return jx && jg ? `${jx}_${jg}` : null;
    };
    const buildUrl = (url, val) =>
        url + (url.includes('?') ? '&' : '?') + PARAM_NAME + '=' + val;
    const getStore = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const setStore = (val) => localStorage.setItem(STORAGE_KEY, JSON.stringify(val));

    // ── 持久化 Log ────────────────────────────────────────────────
    const getLogs = () => JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
    const pushLog = (msg, level = 'info') => {
        const logs = getLogs();
        const now = new Date();
        const ts = now.toTimeString().slice(0, 8);
        logs.push({ ts, msg, level });
        if (logs.length > MAX_LOG_LINES) logs.splice(0, logs.length - MAX_LOG_LINES);
        localStorage.setItem(LOG_KEY, JSON.stringify(logs));
        renderLogPanel();
    };
    const clearLogs = () => {
        localStorage.removeItem(LOG_KEY);
        renderLogPanel();
    };

    const LOG_COLORS = { info: '#3182ce', success: '#38a169', warn: '#dd6b20', error: '#e53e3e' };

    const renderLogPanel = () => {
        const el = document.getElementById('v77-log-content');
        if (!el) return;
        const logs = getLogs();
        el.innerHTML = logs.map(l =>
            `<div><span style="color:#a0aec0;user-select:none">[${l.ts}]</span> ` +
            `<span style="color:${LOG_COLORS[l.level] || '#4a5568'}">${escHtml(l.msg)}</span></div>`
        ).join('');
        el.scrollTop = el.scrollHeight;
    };

    const escHtml = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    // ── CSS ───────────────────────────────────────────────────────
    const injectCSS = () => {
        if (document.getElementById('v77-style')) return;
        const style = document.createElement('style');
        style.id = 'v77-style';
        style.innerHTML = `
            #v77-panel {
                position: fixed; top: 20px; right: 20px; width: 540px;
                background: #ffffff; border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.15);
                z-index: 99999;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                overflow: hidden; display: flex; flex-direction: column;
                transition: transform 0.3s ease;
                border: 1px solid #e0e6ed;
                max-height: 90vh;
            }
            #v77-header {
                padding: 14px 20px; background: #f8f9fb;
                border-bottom: 1px solid #edf2f7;
                cursor: move; display: flex; justify-content: space-between;
                align-items: center; user-select: none; flex-shrink: 0;
            }
            #v77-header b { color: #2d3748; font-size: 16px; display: flex; align-items: center; gap: 8px; }
            #v77-body { padding: 12px 20px; overflow-y: auto; flex: 1; background: #fff; }
            .course-item {
                display: grid;
                grid-template-columns: 30px 2fr 1.2fr 80px 70px;
                gap: 10px; padding: 12px 0;
                border-bottom: 1px solid #f1f4f8; align-items: center;
            }
            .course-item:last-child { border-bottom: none; }
            .c-name { color: #4a5568; font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .c-teacher { color: #718096; font-size: 12px; }
            .status-tag { font-size: 12px; padding: 2px 8px; border-radius: 12px; text-align: center; }
            .status-wait { background: #fffaf0; color: #dd6b20; border: 1px solid #feebc8; }
            .status-done { background: #f0fff4; color: #38a169; border: 1px solid #c6f6d5; }
            .v77-btn { padding: 8px 16px; border-radius: 6px; border: none; font-size: 13px; cursor: pointer; transition: all 0.2s; font-weight: 600; }
            .btn-primary { background: #3182ce; color: white; }
            .btn-primary:hover { background: #2b6cb0; box-shadow: 0 4px 12px rgba(49,130,206,0.3); }
            .btn-outline { background: #fff; color: #4a5568; border: 1px solid #cbd5e0; }
            .btn-outline:hover { background: #f7fafc; }
            .btn-danger { background: #fff; color: #e53e3e; border: 1px solid #fed7d7; }
            .btn-danger:hover { background: #fff5f5; }

            /* Log 面板 */
            #v77-log-wrap {
                flex-shrink: 0;
                border-top: 1px solid #edf2f7;
                background: #f7fafc;
            }
            #v77-log-header {
                padding: 8px 20px; display: flex; justify-content: space-between;
                align-items: center; cursor: pointer; user-select: none;
            }
            #v77-log-header span { font-size: 12px; color: #3182ce; font-weight: 600; }
            #v77-log-content {
                max-height: 160px; overflow-y: auto;
                padding: 0 20px 10px 20px;
                font-size: 11.5px; line-height: 1.7;
                font-family: 'SFMono-Regular', Consolas, monospace;
                display: none;
            }
            #v77-log-content.open { display: block; }

            /* debug 快照 */
            #v77-debug { flex-shrink: 0; background: #f7fafc; padding: 6px 20px 10px; border-top: 1px solid #edf2f7; font-size: 11px; color: #718096; }
            #v77-debug details summary { cursor: pointer; outline: none; margin-bottom: 4px; color: #a0aec0; }
            #v77-debug pre { max-height: 90px; overflow: auto; background: #fff; border: 1px solid #e2e8f0; padding: 8px; border-radius: 4px; }

            .minimized { transform: translateY(calc(100% - 48px)); }
            input[type="checkbox"] { cursor: pointer; width: 16px; height: 16px; }
        `;
        document.head.appendChild(style);
    };

    // ════════════════════════════════════════════════════════════════
    //  LIST 页面
    // ════════════════════════════════════════════════════════════════
    if (location.href.includes('xspj_list.do')) {
        injectCSS();

        const panel = document.createElement('div');
        panel.id = 'v77-panel';
        panel.innerHTML = `
            <div id="v77-header">
                <b>🚀 评教中心 V7.7</b>
                <span id="v77-min" style="cursor:pointer; font-size:20px; color:#a0aec0;">−</span>
            </div>
            <div id="v77-body">
                <div id="course-list"></div>
                <div style="margin-top:16px; display:flex; gap:10px; flex-wrap:wrap;">
                    <button id="start-btn" class="v77-btn btn-primary" style="flex:2">▶ 开始全自动流水线</button>
                    <button id="reset-btn" class="v77-btn btn-outline" style="flex:1">重置缓存</button>
                    <button id="clear-log-btn" class="v77-btn btn-danger" style="flex:1">清空日志</button>
                </div>
            </div>
            <div id="v77-log-wrap">
                <div id="v77-log-header">
                    <span>📋 运行日志 (持久化，刷新不丢失)</span>
                    <span id="log-toggle-icon" style="color:#a0aec0; font-size:16px;">▾</span>
                </div>
                <div id="v77-log-content"></div>
            </div>
            <div id="v77-debug">
                <details>
                    <summary>🛠 存储快照 (Debug)</summary>
                    <div id="debug-info"></div>
                </details>
            </div>
        `;
        document.body.appendChild(panel);

        // 最小化
        document.getElementById('v77-min').onclick = () => panel.classList.toggle('minimized');

        // Log 折叠
        const logContent = document.getElementById('v77-log-content');
        const logToggleIcon = document.getElementById('log-toggle-icon');
        document.getElementById('v77-log-header').onclick = () => {
            logContent.classList.toggle('open');
            logToggleIcon.textContent = logContent.classList.contains('open') ? '▴' : '▾';
        };
        // 默认展开
        logContent.classList.add('open');
        logToggleIcon.textContent = '▴';

        // 拖拽
        let isDragging = false, dragOffset = [0, 0];
        document.getElementById('v77-header').onmousedown = (e) => {
            isDragging = true;
            dragOffset = [panel.offsetLeft - e.clientX, panel.offsetTop - e.clientY];
        };
        document.onmousemove = (e) => {
            if (!isDragging) return;
            panel.style.left  = (e.clientX + dragOffset[0]) + 'px';
            panel.style.top   = (e.clientY + dragOffset[1]) + 'px';
            panel.style.right = 'auto';
        };
        document.onmouseup = () => isDragging = false;

        // ── 渲染课程列表 ──
        const render = () => {
            let store = getStore();
            const rows = document.querySelectorAll('#dataList tr:not(:first-child)');
            const container = document.getElementById('course-list');
            container.innerHTML = '';

            rows.forEach(row => {
                if (row.cells.length < 8) return;
                const a = row.querySelector('a[href*="openWindow"]');
                if (!a) return;
                const name    = row.cells[2].innerText.trim();
                const teacher = row.cells[3].innerText.trim();
                const isSub   = row.cells[6].innerText.trim();
                const rawUrl  = a.getAttribute('href').match(/'([^']+)'/)[1];
                const uKey    = getCompositeKey(rawUrl);
                if (!uKey) return;

                if (!store[uKey]) store[uKey] = { auto: true, done: false, name, teacher, url: rawUrl };
                if (isSub === '是') store[uKey].done = true;

                const item = document.createElement('div');
                item.className = 'course-item';
                item.innerHTML = `
                    <input type="checkbox" class="course-ck" data-key="${uKey}"
                        ${store[uKey].auto ? 'checked' : ''}
                        ${store[uKey].done ? 'disabled' : ''}>
                    <div class="c-name" title="${escHtml(name)}">${escHtml(name)}</div>
                    <div class="c-teacher">${escHtml(teacher)}</div>
                    <div class="status-tag ${store[uKey].done ? 'status-done' : 'status-wait'}">
                        ${store[uKey].done ? '✓ 已完成' : '等待中'}
                    </div>
                    <button class="v77-btn btn-outline"
                        style="padding:4px 8px; font-size:11px;"
                        onclick="window.open('${buildUrl(rawUrl, 'false')}','_blank','width=1200,height=800,toolbar=no,menubar=no')">
                        手动
                    </button>
                `;
                container.appendChild(item);
            });

            document.querySelectorAll('.course-ck').forEach(ck => {
                ck.onchange = (e) => {
                    const key = e.target.getAttribute('data-key');
                    store[key].auto = e.target.checked;
                    setStore(store);
                    refreshDebug();
                    pushLog(`课程 [${store[key].name}] 已${e.target.checked ? '勾选' : '取消勾选'}`, 'info');
                };
            });

            setStore(store);
            refreshDebug();
        };

        const refreshDebug = () => {
            const info = document.getElementById('debug-info');
            if (!info) return;
            const store   = getStore();
            const running = localStorage.getItem(RUNNING_KEY);
            const busy    = localStorage.getItem(BUSY_KEY);
            info.innerHTML = `
                <div>流水线: <b>${running === 'true' ? '▶ 运行中' : '■ 空闲'}</b>
                     &nbsp;|&nbsp; 窗口锁: <b>${busy === 'true' ? '🔒 已锁' : '🔓 空闲'}</b></div>
                <pre>${JSON.stringify(store, null, 2)}</pre>
            `;
        };

        // ── 执行下一条 ──
        const exec = () => {
            if (localStorage.getItem(RUNNING_KEY) !== 'true') return;
            if (localStorage.getItem(BUSY_KEY) === 'true') {
                pushLog('窗口锁定中，等待当前评价完成...', 'warn');
                return;
            }

            const s = getStore();
            const next = Object.keys(s).find(k => s[k].auto && !s[k].done);
            if (next) {
                localStorage.setItem(BUSY_KEY, 'true');
                pushLog(`▶ 打开评价窗口：${s[next].name}（${s[next].teacher}）`, 'info');
                window.open(
                    buildUrl(s[next].url, 'true'),
                    '_blank',
                    'width=1200,height=800,toolbar=no,menubar=no,resizable=yes'
                );
            } else {
                localStorage.setItem(RUNNING_KEY, 'false');
                localStorage.setItem(BUSY_KEY, 'false');
                pushLog('🎉 所有课程评价已完成！', 'success');
                render();
                alert('流水线已全部完成！');
                location.reload();
            }
        };

        // ── 按钮绑定 ──
        document.getElementById('start-btn').onclick = () => {
            localStorage.setItem(RUNNING_KEY, 'true');
            localStorage.setItem(BUSY_KEY, 'false');
            pushLog('===== 流水线启动 =====', 'success');
            render();
            exec();
        };

        document.getElementById('reset-btn').onclick = () => {
            if (!confirm('确定重置所有缓存（包括完成状态）？')) return;
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(RUNNING_KEY);
            localStorage.removeItem(BUSY_KEY);
            pushLog('⚠ 缓存已重置，页面即将刷新', 'warn');
            setTimeout(() => location.reload(), 500);
        };

        document.getElementById('clear-log-btn').onclick = () => {
            clearLogs();
        };

        // ── 跨标签 storage 事件 ──
        window.addEventListener('storage', (e) => {
            if (![ STORAGE_KEY, BUSY_KEY, RUNNING_KEY ].includes(e.key)) return;
            render();
            refreshDebug();
            renderLogPanel();
            // busy 从 true→false 时，说明一个 edit 页关闭，触发下一个
            if (e.key === BUSY_KEY && e.newValue === 'false' && localStorage.getItem(RUNNING_KEY) === 'true') {
                pushLog('窗口已关闭，准备下一个...', 'info');
                setTimeout(exec, 800);
            }
        });

        render();
        renderLogPanel();
        refreshDebug();

        // 页面刷新后若流水线仍在运行，检查 busy 状态决定是否继续
        if (localStorage.getItem(RUNNING_KEY) === 'true') {
            pushLog('检测到流水线运行中（页面刷新恢复）', 'warn');
            if (localStorage.getItem(BUSY_KEY) !== 'true') {
                setTimeout(exec, 1200);
            }
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  EDIT 页面
    // ════════════════════════════════════════════════════════════════
    if (location.href.includes('xspj_edit.do')) {
        const isAuto = new URLSearchParams(location.search).get(PARAM_NAME) !== 'false';

        // 顶部提示条
        const bar = document.createElement('div');
        bar.style = [
            'position:sticky', 'top:0', 'left:0', 'width:100%',
            'background:#3182ce', 'color:white', 'z-index:99999',
            'padding:10px 25px', 'font-family:sans-serif',
            'display:flex', 'justify-content:space-between', 'align-items:center',
            'box-shadow:0 2px 10px rgba(0,0,0,0.1)', 'box-sizing:border-box'
        ].join(';');
        bar.innerHTML = `
            <div style="font-weight:600; font-size:14px;">
                🚀 评教助手 V7.7
                <span id="edit-log" style="font-weight:400; font-size:12px; margin-left:15px; opacity:0.85;">初始化中...</span>
            </div>
            <button id="stop-btn"
                style="background:#fff;color:#3182ce;border:none;padding:5px 14px;border-radius:4px;font-weight:600;cursor:pointer;">
                停止自动提交
            </button>
        `;
        document.body.prepend(bar);

        const editLog = document.getElementById('edit-log');
        const setEditLog = (msg) => { editLog.textContent = msg; };

        // 同时写持久化 log
        const editPushLog = (msg, level = 'info') => {
            setEditLog(msg);
            pushLog(`[edit] ${msg}`, level);
        };

        let stopped = !isAuto;

        document.getElementById('stop-btn').onclick = () => {
            stopped = true;
            editPushLog('已拦截自动提交，请手动操作。', 'warn');
            document.getElementById('stop-btn').style.display = 'none';
        };

        if (!isAuto) {
            setEditLog('手动模式，请自行填写后提交。');
            return;
        }

        // ── 自动填写逻辑 ──
        setTimeout(() => {
            editPushLog('正在执行评价算法...', 'info');

            // 收集所有单选题分组
            const groups = {};
            document.querySelectorAll('input[type="radio"]').forEach(r => {
                const gid = r.name;
                if (!groups[gid]) groups[gid] = [];
                // 尝试读取对应的分值隐藏域
                const idx  = r.id.split('_')[1];
                const fzEl = document.getElementsByName(`pj0601fz_${idx}_${r.value}`)[0];
                groups[gid].push({ el: r, s: fzEl ? parseFloat(fzEl.value) : 0 });
            });

            const keys = Object.keys(groups);
            // 找最小分差的那道题作为"扰动题"（选次高分）
            let minDelta = Infinity, perturbIdx = 0;
            keys.forEach((k, i) => {
                const opts = groups[k];
                if (opts.length >= 2) {
                    // 确保按分值降序
                    opts.sort((a, b) => b.s - a.s);
                    const delta = opts[0].s - opts[1].s;
                    if (delta >= 0 && delta < minDelta) {
                        minDelta = delta;
                        perturbIdx = i;
                    }
                }
            });

            keys.forEach((k, i) => {
                const opts = groups[k];
                opts.sort((a, b) => b.s - a.s);
                // 扰动题选第二高分，其余全选最高分
                const choice = (i === perturbIdx && opts.length >= 2) ? opts[1] : opts[0];
                if (choice) choice.el.checked = true;
            });

            const uKey = getCompositeKey(location.href);
            const courseName = uKey
                ? (JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')?.[uKey]?.name || uKey)
                : '未知课程';

            editPushLog(`填写完成：${courseName}，正在更新状态...`, 'info');

            // 更新 Storage 中该课程的 done 状态
            if (uKey) {
                const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
                if (s[uKey]) {
                    s[uKey].done = true;
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
                }
            }

            if (stopped) {
                editPushLog('已停止，不自动提交。', 'warn');
                return;
            }

            editPushLog('即将自动提交并关闭窗口...', 'success');

            setTimeout(() => {
                if (stopped) return;
                // 触发保存
                const bc = document.getElementById('bc');
                if (bc) {
                    try { window.saveData(bc, '0'); } catch(e) { editPushLog(`提交异常：${e.message}`, 'error'); }
                }
                // 解除 busy 锁，让 list 页面继续
                setTimeout(() => {
                    pushLog(`✓ 完成：${courseName}，解除窗口锁`, 'success');
                    localStorage.setItem(BUSY_KEY, 'false');
                    setTimeout(() => window.close(), 300);
                }, 600);
            }, 1000);

        }, 800);
    }

})();