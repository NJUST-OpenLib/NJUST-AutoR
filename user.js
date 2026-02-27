// ==UserScript==
// @name         NJUST 评教流水线 V7.6 (现代交互版)
// @namespace    http://tampermonkey.net/
// @version      7.6
// @description  大厂 UI 视觉风格，支持课程勾选过滤，集成清爽版 Debug 抽屉。
// @author       Gemini
// @match        http://202.119.81.112:9080/njlgdx/xspj/xspj_list.do*
// @match        http://202.119.81.112:9080/njlgdx/xspj/xspj_edit.do*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = 'njust_eval_v7_6';
    const RUNNING_KEY = 'njust_eval_running';
    const PARAM_NAME = 'isAutoEval';

    const getCompositeKey = (url) => {
        const jx = url.match(/jx02id=([^&]+)/)?.[1] || "";
        const jg = url.match(/jg0101id=([^&]+)/)?.[1] || "";
        return jx && jg ? `${jx}_${jg}` : null;
    };
    const buildUrl = (url, val) => url + (url.includes('?') ? '&' : '?') + PARAM_NAME + '=' + val;
    const getStore = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const setStore = (val) => localStorage.setItem(STORAGE_KEY, JSON.stringify(val));

    // --- 样式定义 ---
    const injectCSS = () => {
        if (document.getElementById('v76-style')) return;
        const style = document.createElement('style');
        style.id = 'v76-style';
        style.innerHTML = `
            #v76-panel { position: fixed; top: 20px; right: 20px; width: 520px; background: #ffffff; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.15); z-index: 99999; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.3s ease; border: 1px solid #e0e6ed; }
            #v76-header { padding: 14px 20px; background: #f8f9fb; border-bottom: 1px solid #edf2f7; cursor: move; display: flex; justify-content: space-between; align-items: center; user-select: none; }
            #v76-header b { color: #2d3748; font-size: 16px; display: flex; align-items: center; gap: 8px; }
            #v76-body { padding: 12px 20px; max-height: 450px; overflow-y: auto; background: #fff; }
            .course-item { display: grid; grid-template-columns: 30px 2fr 1.2fr 80px 70px; gap: 10px; padding: 12px 0; border-bottom: 1px solid #f1f4f8; align-items: center; }
            .course-item:last-child { border-bottom: none; }
            .c-name { color: #4a5568; font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .c-teacher { color: #718096; font-size: 12px; }
            .status-tag { font-size: 12px; padding: 2px 8px; border-radius: 12px; text-align: center; }
            .status-wait { background: #fffaf0; color: #dd6b20; border: 1px solid #feebc8; }
            .status-done { background: #f0fff4; color: #38a169; border: 1px solid #c6f6d5; }

            /* 按钮样式 */
            .v76-btn { padding: 8px 16px; border-radius: 6px; border: none; font-size: 13px; cursor: pointer; transition: all 0.2s; font-weight: 600; }
            .btn-primary { background: #3182ce; color: white; }
            .btn-primary:hover { background: #2b6cb0; box-shadow: 0 4px 12px rgba(49,130,206,0.3); }
            .btn-outline { background: #fff; color: #4a5568; border: 1px solid #cbd5e0; }
            .btn-outline:hover { background: #f7fafc; }

            /* Debug 条 */
            #v76-debug { background: #f7fafc; padding: 10px 20px; border-top: 1px solid #edf2f7; font-size: 11px; color: #718096; }
            #v76-debug details summary { cursor: pointer; outline: none; margin-bottom: 5px; color: #3182ce; }
            #v76-debug pre { max-height: 100px; overflow: auto; background: #fff; border: 1px solid #e2e8f0; padding: 8px; border-radius: 4px; }

            .minimized { transform: translateY(calc(100% - 48px)); }
            input[type="checkbox"] { cursor: pointer; width: 16px; height: 16px; }
        `;
        document.head.appendChild(style);
    };

    // --- List 页面逻辑 ---
    if (location.href.includes('xspj_list.do')) {
        injectCSS();
        const panel = document.createElement('div');
        panel.id = 'v76-panel';
        panel.innerHTML = `
            <div id="v76-header">
                <b>🚀 评教中心 V7.6</b>
                <span id="v76-min" style="cursor:pointer; font-size: 20px; color: #a0aec0;">−</span>
            </div>
            <div id="v76-body">
                <div id="course-list"></div>
                <div style="margin-top:20px; display:flex; gap:12px;">
                    <button id="start-btn" class="v76-btn btn-primary" style="flex:2">开始全自动流水线</button>
                    <button id="reset-btn" class="v76-btn btn-outline" style="flex:1">重置缓存</button>
                </div>
            </div>
            <div id="v76-debug">
                <details>
                    <summary>🛠️ Debug 控制台 (实时存储快照)</summary>
                    <div id="debug-info"></div>
                </details>
            </div>
        `;
        document.body.appendChild(panel);

        // 最小化与拖拽 (复用逻辑并优化)
        document.getElementById('v76-min').onclick = () => panel.classList.toggle('minimized');
        let isDragging = false, offset = [0,0];
        document.getElementById('v76-header').onmousedown = (e) => {
            isDragging = true;
            offset = [panel.offsetLeft - e.clientX, panel.offsetTop - e.clientY];
        };
        document.onmousemove = (e) => {
            if (!isDragging) return;
            panel.style.left = (e.clientX + offset[0]) + 'px';
            panel.style.top = (e.clientY + offset[1]) + 'px';
            panel.style.right = 'auto';
        };
        document.onmouseup = () => isDragging = false;

        const render = () => {
            let store = getStore();
            const rows = document.querySelectorAll('#dataList tr:not(:first-child)');
            const container = document.getElementById('course-list');
            container.innerHTML = '';

            rows.forEach(row => {
                if (row.cells.length < 8) return;
                const a = row.querySelector('a[href*="openWindow"]');
                if (!a) return;
                const name = row.cells[2].innerText.trim();
                const teacher = row.cells[3].innerText.trim();
                const isSub = row.cells[6].innerText.trim();
                const rawUrl = a.getAttribute('href').match(/'([^']+)'/)[1];
                const uKey = getCompositeKey(rawUrl);

                if (uKey) {
                    // 如果该课程在 Storage 里还没被标记，或者需要更新状态
                    if (!store[uKey]) store[uKey] = { auto: true, done: (isSub === '是'), name, teacher, url: rawUrl };
                    if (isSub === '是') store[uKey].done = true;

                    const item = document.createElement('div');
                    item.className = 'course-item';
                    item.innerHTML = `
                        <input type="checkbox" class="course-ck" data-key="${uKey}" ${store[uKey].auto ? 'checked' : ''} ${store[uKey].done ? 'disabled' : ''}>
                        <div class="c-name" title="${name}">${name}</div>
                        <div class="c-teacher">${teacher}</div>
                        <div class="status-tag ${store[uKey].done ? 'status-done' : 'status-wait'}">${store[uKey].done ? '已完成' : '等待中'}</div>
                        <button class="v76-btn btn-outline" style="padding:4px 8px; font-size:11px;" onclick="window.open('${buildUrl(rawUrl, 'false')}','_blank')">手动</button>
                    `;
                    container.appendChild(item);
                }
            });

            // 绑定勾选事件
            document.querySelectorAll('.course-ck').forEach(ck => {
                ck.onchange = (e) => {
                    const key = e.target.getAttribute('data-key');
                    store[key].auto = e.target.checked;
                    setStore(store);
                    refreshDebug();
                };
            });
            setStore(store);
            refreshDebug();
        };

        const refreshDebug = () => {
            const info = document.getElementById('debug-info');
            const store = getStore();
            const running = localStorage.getItem(RUNNING_KEY);
            info.innerHTML = `
                <div>状态: <b>${running === 'true' ? '正在运行' : '空闲'}</b></div>
                <pre>${JSON.stringify(store, null, 2)}</pre>
            `;
        };

        const exec = () => {
            if (localStorage.getItem(RUNNING_KEY) !== 'true') return;
            const s = getStore();
            const next = Object.keys(s).find(k => s[k].auto && !s[k].done);
            if (next) window.open(buildUrl(s[next].url, 'true'), '_blank');
            else { localStorage.setItem(RUNNING_KEY, 'false'); alert("流水线已全部完成！"); location.reload(); }
        };

        document.getElementById('start-btn').onclick = () => {
            localStorage.setItem(RUNNING_KEY, 'true');
            render();
            exec();
        };
        document.getElementById('reset-btn').onclick = () => {
            localStorage.clear();
            location.reload();
        };

        window.addEventListener('storage', (e) => {
            if (e.key === STORAGE_KEY && localStorage.getItem(RUNNING_KEY) === 'true') {
                render(); setTimeout(exec, 1200);
            }
        });
        render();
        if (localStorage.getItem(RUNNING_KEY) === 'true') setTimeout(exec, 800);
    }

    // --- Edit 页面逻辑 (嵌入式提示条) ---
    if (location.href.includes('xspj_edit.do')) {
        const isAuto = new URLSearchParams(location.search).get(PARAM_NAME) !== 'false';
        const bar = document.createElement('div');
        bar.style = "position:sticky; top:0; left:0; width:100%; background:#3182ce; color:white; z-index:99999; padding:12px 25px; font-family:sans-serif; display:flex; justify-content:space-between; align-items:center; box-shadow: 0 2px 10px rgba(0,0,0,0.1);";
        bar.innerHTML = `
            <div style="font-weight:600;">🚀 评教助手正在运行... <span id="edit-log" style="font-weight:400; font-size:12px; margin-left:15px; opacity:0.9;">初始化中...</span></div>
            <div>
                <button id="stop-btn" style="background:#fff; color:#3182ce; border:none; padding:5px 12px; border-radius:4px; font-weight:600; cursor:pointer;">停止自动提交</button>
            </div>
        `;
        document.body.prepend(bar);

        let stopClose = !isAuto;
        document.getElementById('stop-btn').onclick = () => {
            stopClose = true;
            document.getElementById('edit-log').innerText = "已拦截自动提交。";
            document.getElementById('stop-btn').style.display = 'none';
        };

        if (isAuto) {
            setTimeout(() => {
                const log = document.getElementById('edit-log');
                log.innerText = "正在执行评价算法...";

                // 满分+扰动逻辑
                const groups = {};
                document.querySelectorAll('input[type="radio"]').forEach(r => {
                    const gid = r.name;
                    if (!groups[gid]) groups[gid] = [];
                    const fz = document.getElementsByName("pj0601fz_" + r.id.split('_')[1] + "_" + r.value)[0];
                    groups[gid].push({ el: r, s: fz ? parseFloat(fz.value) : 0 });
                });
                const keys = Object.keys(groups);
                let minL = 999, bIdx = 0;
                keys.forEach((k, i) => {
                    const o = groups[k]; if (o.length >= 2) {
                        const l = o[0].s - o[1].s;
                        if (l >= 0 && l < minL) { minL = l; bIdx = i; }
                    }
                });
                keys.forEach((k, i) => {
                    const o = groups[k];
                    if (i === bIdx) o[1].el.checked = true; else o[0].el.checked = true;
                });

                log.innerText = "数据已填完，更新反馈中...";
                const uKey = getCompositeKey(location.href);
                if (uKey) {
                    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
                    if (s[uKey]) { s[uKey].done = true; localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
                }

                if (!stopClose) {
                    log.innerText = "评价成功，页面即将关闭...";
                    setTimeout(() => {
                        const bc = document.getElementById('bc');
                        if (bc) window.saveData(bc, '0');
                        setTimeout(() => window.close(), 500);
                    }, 1000);
                }
            }, 800);
        }
    }
})();