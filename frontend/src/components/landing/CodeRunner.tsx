import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, X, RotateCcw, ExternalLink, AlertTriangle, Cpu } from "lucide-react";

/* ----------------------------------------------------------------
 * 代码沙箱预览组件
 * 支持：
 *  1) 整段 HTML（<html> / <body>）→ 直接作为完整页面
 *  2) HTML 片段（带标签） → 包成基础 HTML
 *  3) 纯 JS → 注入并把 console.log 渲染出来
 *  4) React/JSX/TS → 走 Babel Standalone 实时编译，浏览器原生跑
 * 全部用 sandbox iframe 隔离运行
 * ---------------------------------------------------------------- */

const looksLikeFullHtml = (code: string) =>
  /<html[\s>]/i.test(code) || /<body[\s>]/i.test(code);

const hasJsx = (code: string) =>
  /return\s*\(?\s*</.test(code) ||
  /<\s*([A-Z][A-Za-z0-9]*)\b[^>]*\/?>/.test(code) ||
  /<>\|<\/[A-Z][A-Za-z0-9]*>/.test(code);

const hasTs = (code: string) =>
  /:\s*(string|number|boolean|any|unknown|void|never)\b/.test(code) ||
  /\binterface\s+\w+/.test(code) ||
  /\btype\s+\w+\s*=/.test(code);

const hasReact = (code: string) =>
  /from\s+['"]react['"]/i.test(code) ||
  /useState|useEffect|useRef|useMemo|useCallback|useReducer/.test(code);

/* ---------- 模式 1/2/3：常规 HTML/JS 文档 ---------- */
const buildSimpleDoc = (code: string): string => {
  const c = code.trim();

  if (looksLikeFullHtml(c)) {
    let doc = c;
    if (!/name=["']viewport["']/i.test(doc)) {
      doc = doc.replace(
        /<head>/i,
        '<head>\n<meta name="viewport" content="width=device-width, initial-scale=1">',
      );
    }
    return doc;
  }

  const scripts = [...c.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const styles = [...c.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const hasHtmlTag = /<[a-z][\s\S]*>/i.test(c);

  if (scripts.length || styles.length || hasHtmlTag) {
    const bodyHtml = c
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${styles.join("\n")}</style></head><body>${bodyHtml}<script>${scripts.join("\n")}<\/script></body></html>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font:14px/1.6 system-ui,sans-serif;color:#222;background:#fff;padding:16px;margin:0}h1{color:#0e7490;font-size:15px;margin:0 0 8px}pre{white-space:pre-wrap;word-break:break-word;margin:0;font-family:ui-monospace,Menlo,monospace}</style></head><body><h1>运行输出</h1><pre id="out"></pre><script>
  const _log=[];const _orig=console.log;console.log=(...a)=>{_log.push(a.map(x=>{try{return typeof x==='object'?JSON.stringify(x,null,2):x}catch{return String(x)}}).join(' '));};console.error=console.log;
  try{
    ${c}
  }catch(e){_log.push('❌ 运行出错: '+(e&&e.message?e.message:e));}
  document.getElementById('out').textContent=_log.join('\\n');
  <\/script></body></html>`;
};

/* ---------- 模式 4：React/JSX/TS 文档（Babel 手动编译） ----------
 * 关键点：
 * 1) React / ReactDOM / Babel 全部走站点本地 /vendor 目录（绝对地址），
 *    不依赖外网 CDN，避免沙箱访问 unpkg 慢/被拦导致一直卡在"加载编译器"
 * 2) 用户代码用 base64 编码后放进 <script type="text/plain">，
 *    无论代码里有什么字符都不会破坏 HTML 结构，runner 用 atob 还原原文
 * 3) 每个库脚本带 onerror，加载失败立刻显示明确错误，不会无限等待
 * ---------------------------------------------------------------- */
const buildReactDoc = (code: string, origin: string): string => {
  // 注意：不能删 import 语句！AI 写的 `import React, { useState } from 'react'`
  // 会被 Babel 转成 require('react')，由沙箱注入的 require 返回全局 React，
  // 这样 useState 等具名导入才有定义。删掉反而会导致 "useState is not defined"。
  const cleanCode = code;

  // 从源代码里猜组件名：顶层 function/const/let/var 后面跟的大写标识符
  const names = new Set<string>();
  const add = (m: string) => {
    if (/^[A-Z]/.test(m)) names.add(m);
    return m;
  };
  cleanCode.replace(/^function\s+([A-Z]\w+)/gm, (_, m) => add(m));
  cleanCode.replace(/^\s*(?:const|let|var)\s+([A-Z]\w+)/gm, (_, m) => add(m));
  cleanCode.replace(/export\s+default\s+function\s+([A-Z]\w+)/g, (_, m) => add(m));

  const nameList = [...names, "App", "Root", "Main", "Demo", "Game", "CardGame", "MemoryGame"];
  // 用户代码用 base64 编码（保留 UTF-8），names 用 JSON 编码
  const srcB64 = btoa(unescape(encodeURIComponent(cleanCode)));
  const namesJson = JSON.stringify(nameList);

  // runner 是固定脚本，里面没有任何动态插值。
  const runner = `(function(){
  var root = document.getElementById('root');
  var srcNode = document.getElementById('__src__');
  var namesNode = document.getElementById('__names__');
  function showErr(msg, detail){
    root.innerHTML = '<pre style="color:#f87171;font:13px/1.6 ui-monospace,monospace;white-space:pre-wrap;background:#fff0f0;padding:12px;border-radius:6px">❌ ' + msg + (detail ? ('\\n' + detail) : '') + '</pre>';
  }
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function b64decode(s){
    try { return decodeURIComponent(escape(atob(s))); } catch(e) { return atob(s); }
  }
  ready(function(){
    try {
      if (window.__vendorError) { showErr('依赖库加载失败：' + window.__vendorError + '\\n请检查 /vendor 目录下是否有对应文件'); return; }
      if (typeof Babel === 'undefined') { showErr('Babel 编译器未加载，请检查 /vendor/babel.min.js 是否存在'); return; }
      if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') { showErr('React 运行时未加载，请检查 /vendor 下的 react 文件'); return; }
      var src = srcNode ? b64decode(srcNode.textContent.trim()) : '';
      var names = namesNode ? JSON.parse(namesNode.textContent) : [];
      if (!src.trim()) { showErr('没有可执行的代码'); return; }
      var compiled;
      try {
        // 1) runtime: 'classic' —— JSX 编译成 React.createElement，
        //    避免 automatic runtime 去 require('react/jsx-runtime') 拿到空对象
        // 2) transform-modules-commonjs —— 把 import/export 转成 CJS，
        //    配合下方注入的 exports/module/require，才能取到 export default 的组件
        compiled = Babel.transform(src, {
          presets: [['react', { runtime: 'classic' }], 'typescript'],
          plugins: ['transform-modules-commonjs'],
          filename: 'demo.tsx',
          sourceType: 'module'
        }).code;
      } catch (e) {
        var msg = (e && e.message ? e.message : e);
        var NL = String.fromCharCode(10);
        var lines = src.split(NL).slice(0, 6);
        var preview = lines.map(function(l, i){
          var hex = '';
          for (var j = 0; j < Math.min(l.length, 40); j++) {
            var c = l.charCodeAt(j);
            if (c < 0x20 || c === 0x7f) hex += '<' + c.toString(16).toUpperCase() + '>';
          }
          return (i+1) + ' | ' + (l || '(空行)') + (hex ? '  [隐藏字符: ' + hex + ']' : '');
        }).join(NL);
        showErr('Babel 编译失败', msg + '\\n\\n源码前 6 行（带行号）：\\n' + preview + '\\n\\n请检查 TS/JSX 语法是否正确。');
        return;
      }
      // CJS 运行所需的三个全局对象（AI 几乎必写 export default，缺了就取不到组件）
      var mod = { exports: {} };
      window.exports = mod.exports;
      window.module = mod;
      window.require = function(name){
        if (name === 'react') return React;
        if (name === 'react-dom' || name === 'react-dom/client') return ReactDOM;
        return {};
      };

      try {
        var s = document.createElement('script');
        s.textContent = 'try {\\n' + compiled + '\\n} catch(__e){window.__runErr=__e;}';
        document.body.appendChild(s);
        if (window.__runErr) throw window.__runErr;
      } catch (e) {
        showErr('执行出错', (e && e.stack ? e.stack : e.message || e));
        return;
      }

      // 按优先级找组件：module.exports.default > module.exports > window 上的大写命名
      var Comp = null;
      var mx = window.module && window.module.exports;
      if (mx && typeof mx === 'object' && mx.default) {
        Comp = mx.default;
      } else if (mx && typeof mx === 'function') {
        Comp = mx;
      } else if (mx && typeof mx === 'object') {
        for (var k in mx) { if (typeof mx[k] === 'function') { Comp = mx[k]; break; } }
      }
      if (!Comp) {
        for (var i = 0; i < names.length; i++) {
          if (typeof window[names[i]] === 'function') { Comp = window[names[i]]; break; }
        }
      }
      if (Comp) {
        try {
          // 同步渲染优先：ReactDOM.render 会立即把内容写进 DOM，
          // 不会出现 createRoot 异步调度导致"一直空白"的情况。
          // React 18 仍保留此 API（仅控制台告警，不影响功能）。
          ReactDOM.render(React.createElement(Comp), root);
        } catch (e) {
          try {
            ReactDOM.createRoot(root).render(React.createElement(Comp));
          } catch (e2) {
            showErr('组件渲染失败', e && e.message ? e.message : e);
          }
        }
      } else {
        root.innerHTML = '<div style="padding:20px;color:#666;font:14px/1.6 system-ui">已执行完毕，但未找到可挂载的 React 组件。\\n请检查是否有 export default，或顶层是否定义了大写开头的组件（App / Game / CardGame）。</div>';
      }
    } catch (e) {
      showErr('运行失败', e && e.message ? e.message : e);
    }
  });
})();`;

  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<script>window.__vendorError=null;function __vendorFail(n){window.__vendorError=n;var r=document.getElementById("root");if(r)r.innerHTML="<pre style=\\"color:#f87171;font:13px/1.6 ui-monospace,monospace;white-space:pre-wrap\\">❌ 依赖库加载失败: "+n+"\\n\\n请检查 /vendor 目录下文件是否完整</pre>";}</' + 'script>',
    '<script src="' + origin + '/vendor/react.development.js" onerror="__vendorFail(\'react.development.js\')"></' + 'script>',
    '<script src="' + origin + '/vendor/react-dom.development.js" onerror="__vendorFail(\'react-dom.development.js\')"></' + 'script>',
    '<script src="' + origin + '/vendor/babel.min.js" onerror="__vendorFail(\'babel.min.js\')"></' + 'script>',
    '<style>html,body{margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif;background:#fff;color:#111}body{padding:16px}#root{min-height:100%}</style>',
    '</head>',
    '<body>',
    '<div id="root">正在加载编译器…</div>',
    // 用户代码以 base64 形式存放在 text/plain 标签里，绝对安全（不会触发 </script> 截断）
    '<script type="text/plain" id="__src__">',
    srcB64,
    '</' + 'script>',
    '<script type="application/json" id="__names__">',
    namesJson,
    '</' + 'script>',
    '<script>',
    runner,
    '</' + 'script>',
    '</body>',
    '</html>',
  ].join('\n');
};

const CodeRunner = ({
  code,
  lang,
  children,
}: {
  code: string;
  lang: string;
  children?: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const [error, setError] = useState("");

  const mode = useMemo<"react" | "html" | "unsupported" | null>(() => {
    const l = (lang || "").toLowerCase().replace(/^languages?/i, "").trim();
    const c = code.trim();
    if (!c) return null;

    const unsupported = ["python", "java", "go", "sql", "bash", "shell", "yaml", "json", "php", "ruby", "rust", "c", "cpp", "c++"];
    if (unsupported.includes(l)) return "unsupported";

    // React/TSX/JSX/TS
    if (["tsx", "jsx", "react", "typescript", "ts"].includes(l) || hasReact(c) || hasJsx(c) || hasTs(c)) {
      return "react";
    }
    return "html";
  }, [code, lang]);

  const srcDoc = useMemo(() => {
    try {
      // 取当前站点 origin，让沙箱能从本地 /vendor 加载 React 与 Babel，
      // 不依赖外网 CDN（沙箱访问 unpkg 可能慢或被拦截）
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const d =
        mode === "react" ? buildReactDoc(code, origin) : buildSimpleDoc(code);
      setError("");
      return d;
    } catch (e: any) {
      setError(e.message || "构建预览失败");
      return "";
    }
  }, [code, mode]);

  if (mode === "unsupported") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground/70" title="该语言代码需到对应环境运行">
        <AlertTriangle className="h-3 w-3" />
        不可在网页直接运行
      </span>
    );
  }

  return (
    <>
      <button
        onClick={() => {
          setKey((k) => k + 1);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 rounded-md bg-cyan-500/15 px-2.5 py-1 text-[11px] font-medium text-cyan-300 transition-colors hover:bg-cyan-500/25"
      >
        {children ?? (
          <>
            <Play className="h-3 w-3" />
            运行
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="flex h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0b0b13] shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <span className="inline-flex items-center gap-2 text-sm font-medium text-white">
                  <Play className="h-4 w-4 text-cyan-400" />
                  代码实时预览 · {lang}
                  <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                    <Cpu className="h-3 w-3" />
                    {mode === "react" ? "React + Babel 即时编译" : "浏览器原生执行"}
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setKey((k) => k + 1)}
                    title="重新运行"
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    重跑
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    title="关闭"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="relative flex-1 bg-white">
                {error ? (
                  <div className="p-4 text-sm text-red-500">{error}</div>
                ) : (
                  <iframe
                    key={key}
                    srcDoc={srcDoc}
                    sandbox="allow-scripts allow-modals"
                    className="h-full w-full border-0"
                    title="代码预览"
                  />
                )}
              </div>

              <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-[11px] text-muted-foreground/70">
                <span className="inline-flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" />
                  {mode === "react"
                    ? "通过 Babel Standalone 在浏览器内即时编译并执行"
                    : "运行在独立沙箱中，与主站隔离"}
                </span>
                <span>结果仅供演示</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default CodeRunner;
