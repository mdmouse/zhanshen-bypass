// ==UserScript==
// @name         战神体育 - 跳过登录弹窗
// @namespace    https://github.com/mdmouse/zhanshen-bypass
// @version      1.0.0
// @description  绕过战神体育直播间未登录试看弹窗（注册/登录提示层）
// @author       mdmouse
// @match        *://zhanshen88.tv/*
// @match        *://*.zhanshen88.tv/*
// @match        *://zhanshen*.tv/*
// @grant        none
// @run-at       document-start
// ==/UserScript==
(function () {
    'use strict';
    // ============================================================
    // 策略 1：CSS 强制隐藏弹窗层
    // ============================================================
    const style = document.createElement('style');
    style.textContent = `
        /* 主弹窗遮罩 */
        .vip_fans_promition,
        .vip_fans_promition_mask,
        .vip-fans-promition,
        .login-tip-modal,
        .login-tip-mask {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
            z-index: -9999 !important;
        }
    `;
    document.documentElement.appendChild(style);
    // ============================================================
    // 策略 2：持续清除 localStorage 中的观看计时器
    // ============================================================
    function clearWatchTimers() {
        try {
            const keys = Object.keys(localStorage);
            for (const key of keys) {
                // 匹配 notokenroom{数字} 格式的键
                if (/^notokenroom\d+$/.test(key)) {
                    localStorage.removeItem(key);
                }
            }
        } catch (e) {
            // 静默处理
        }
    }
    // 立即清一次，然后每 5 秒清一次
    clearWatchTimers();
    setInterval(clearWatchTimers, 5000);
    // ============================================================
    // 策略 3：劫持 XMLHttpRequest，拦截弹窗配置接口
    // ============================================================
    const _origOpen = XMLHttpRequest.prototype.open;
    const _origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...args) {
        this._interceptUrl = url;
        return _origOpen.call(this, method, url, ...args);
    };
    XMLHttpRequest.prototype.send = function (...args) {
        if (this._interceptUrl && this._interceptUrl.includes('get_room_text')) {
            this.addEventListener('readystatechange', function () {
                if (this.readyState === 4) {
                    try {
                        const data = JSON.parse(this.responseText);
                        // 把 showType 改成 0（关闭弹窗）
                        if (data && data.data) {
                            data.data.showType = 0;
                            data.data.showTime = 999999;
                        }
                        if (data) {
                            data.showType = 0;
                            data.showTime = 999999;
                        }
                        // 覆写 responseText
                        Object.defineProperty(this, 'responseText', {
                            get: () => JSON.stringify(data),
                        });
                        Object.defineProperty(this, 'response', {
                            get: () => JSON.stringify(data),
                        });
                    } catch (e) {
                        // 解析失败静默跳过
                    }
                }
            });
        }
        return _origSend.apply(this, args);
    };
    // 同样拦截 fetch
    const _origFetch = window.fetch;
    window.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : input?.url || '';
        if (url.includes('get_room_text')) {
            return _origFetch.call(this, input, init).then(response => {
                return response.clone().text().then(text => {
                    try {
                        const data = JSON.parse(text);
                        if (data && data.data) {
                            data.data.showType = 0;
                            data.data.showTime = 999999;
                        }
                        if (data) {
                            data.showType = 0;
                            data.showTime = 999999;
                        }
                        return new Response(JSON.stringify(data), {
                            status: response.status,
                            statusText: response.statusText,
                            headers: response.headers,
                        });
                    } catch (e) {
                        return response;
                    }
                });
            });
        }
        return _origFetch.call(this, input, init);
    };
    // ============================================================
    // 策略 4：DOM 加载后，劫持 tryTipLogin 函数 + MutationObserver
    // ============================================================
    function onDomReady() {
        // 4a. 尝试覆盖 tryTipLogin
        try {
            if (typeof window.tryTipLogin === 'function') {
                window.tryTipLogin = function () { /* noop */ };
            }
        } catch (e) { /* ignore */ }
        // 4b. 定时覆盖（防止脚本晚加载覆盖回来）
        const hookInterval = setInterval(() => {
            try {
                if (typeof window.tryTipLogin === 'function') {
                    window.tryTipLogin = function () { };
                }
            } catch (e) { /* ignore */ }
        }, 1000);
        // 60 秒后停止定时覆盖
        setTimeout(() => clearInterval(hookInterval), 60000);
        // 4c. MutationObserver 兜底：检测弹窗 DOM 出现就隐藏
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    // 检查新增节点是否是弹窗
                    if (
                        node.classList?.contains('vip_fans_promition') ||
                        node.classList?.contains('vip_fans_promition_mask') ||
                        node.classList?.contains('vip-fans-promition') ||
                        node.classList?.contains('login-tip-modal')
                    ) {
                        node.style.display = 'none';
                        node.remove();
                    }
                    // 检查子元素
                    const popups = node.querySelectorAll?.(
                        '.vip_fans_promition, .vip_fans_promition_mask, .vip-fans-promition, .login-tip-modal'
                    );
                    if (popups) {
                        popups.forEach(el => {
                            el.style.display = 'none';
                            el.remove();
                        });
                    }
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        // 4d. 立即清除已存在的弹窗
        document.querySelectorAll(
            '.vip_fans_promition, .vip_fans_promition_mask, .vip-fans-promition, .login-tip-modal, .login-tip-mask'
        ).forEach(el => {
            el.style.display = 'none';
            el.remove();
        });
        // 4e. 模拟已登录状态（如果 _DATA 存在）
        try {
            if (window._DATA && window._DATA.user === null) {
                // 给一个假的 user 对象，让前端逻辑认为已登录
                window._DATA.user = {
                    id: 1,
                    nickname: 'guest',
                    token: 'bypass',
                };
            }
        } catch (e) { /* ignore */ }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onDomReady);
    } else {
        onDomReady();
    }
    console.log('[战神Bypass] 脚本已加载 ✓');
})();
