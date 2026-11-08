/* 考研政治刷题台 — 面板 UI（原生 DOM，无框架）。
 * 数据边界：题库 / 进度都走 Host 路由（/plugin/kaoyan-quiz/*），因为 DSH Web 的端口每次启动都变，
 * localStorage 会跟着 origin 一起失效。Host 不可用时才退回 localStorage，并在界面上明说。
 */
(function () {
  'use strict'

  var DEFAULT_API = '/plugin/kaoyan-quiz'
  var LS_STATE = 'kaoyan-quiz:state:v1'
  var VERSION = 1
  var UI_VERSION = '2.3.0'
  var LETTERS = 'ABCDEFGH'

  var TABS = [
    { id: 'practice', label: '刷题' },
    { id: 'wrong', label: '错题本', count: 'wrong' },
    { id: 'star', label: '收藏', count: 'star' },
    { id: 'stats', label: '统计' },
    { id: 'bank', label: '题库与设置' },
  ]

  /* ---------------------------------------------------------------- utils */

  function esc(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    })
  }

  function pct(part, total) {
    if (!total) return '0%'
    return Math.round((part / total) * 100) + '%'
  }

  function one(v) {
    return Number.isFinite(v) ? v : 0
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n
  }

  function dayKey(date) {
    var d = date || new Date()
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
  }

  function dayLabel(date) {
    return pad2(date.getMonth() + 1) + '/' + pad2(date.getDate())
  }

  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1))
      var tmp = list[i]
      list[i] = list[j]
      list[j] = tmp
    }
    return list
  }

  function sameSet(a, b) {
    if (a.length !== b.length) return false
    for (var i = 0; i < a.length; i += 1) if (b.indexOf(a[i]) < 0) return false
    return true
  }

  function lettersOf(list) {
    return (list || []).join('')
  }

  function typeLabel(q) {
    return q.type === 'multi' ? '多选' : '单选'
  }

  /* ---------------------------------------------------------------- 样式 */

  var CSS = `
.kq-root{
  --kq-bg:var(--dsw-alias-bg-base,#0d1117);
  --kq-l1:var(--dsw-alias-bg-layer-1,#161b22);
  --kq-l2:var(--dsw-alias-bg-layer-2,#1c2129);
  --kq-line:var(--dsw-alias-border-l1,rgba(127,127,127,.24));
  --kq-line2:var(--dsw-alias-border-l2,rgba(127,127,127,.42));
  --kq-fg:var(--dsw-alias-label-primary,#d7d7d7);
  --kq-dim:var(--dsw-alias-label-secondary,#9aa7b4);
  --kq-brand:var(--dsw-alias-brand-primary,#1f6feb);
  --kq-ok:var(--dsw-alias-state-success-primary,#2f9e63);
  --kq-bad:var(--dsw-alias-state-error-primary,#ef4444);
  --kq-warn:var(--dsw-alias-state-warn-primary,#bf8700);
  height:100%;display:flex;flex-direction:column;min-height:0;background:var(--kq-bg);color:var(--kq-fg);
  font-family:inherit;font-size:14px;line-height:1.6;outline:none;
}
.kq-root *{box-sizing:border-box}
.kq-root button{font-family:inherit}
.kq-head{flex:0 0 auto;border-bottom:1px solid var(--kq-line);background:var(--kq-l1);padding:14px 22px 0}
.kq-headrow{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.kq-title{display:flex;align-items:center;gap:11px;min-width:0}
.kq-logo{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:color-mix(in srgb,var(--kq-brand) 14%,transparent);color:var(--kq-brand);flex:0 0 auto}
.kq-titles h1{margin:0;font-size:15.5px;font-weight:700;letter-spacing:.2px;line-height:1.3}
.kq-sub{margin:1px 0 0;font-size:11.5px;color:var(--kq-dim);line-height:1.4}
.kq-headtools{margin-left:auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.kq-seg{display:inline-flex;padding:3px;gap:2px;border:1px solid var(--kq-line);border-radius:9px;background:var(--kq-bg)}
.kq-segbtn{border:0;background:transparent;color:var(--kq-dim);font-size:12.5px;padding:5px 14px;border-radius:6px;cursor:pointer;font-weight:600}
.kq-segbtn:hover{color:var(--kq-fg)}
.kq-segbtn.is-on{background:var(--kq-brand);color:#fff}
.kq-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--kq-line);background:var(--kq-l2);color:var(--kq-fg);
  border-radius:8px;padding:6px 13px;font-size:12.5px;cursor:pointer;transition:background .12s,border-color .12s;white-space:nowrap}
.kq-btn:hover{background:color-mix(in srgb,var(--kq-fg) 7%,transparent);border-color:var(--kq-line2)}
.kq-btn b{font-weight:700;font-variant-numeric:tabular-nums}
.kq-btn--primary{background:var(--kq-brand);border-color:var(--kq-brand);color:#fff;font-weight:600}
.kq-btn--primary:hover{background:color-mix(in srgb,var(--kq-brand) 85%,#fff)}
.kq-btn--ghost{background:transparent}
.kq-btn--danger{color:var(--kq-bad);border-color:color-mix(in srgb,var(--kq-bad) 40%,var(--kq-line))}
.kq-btn--danger:hover{background:color-mix(in srgb,var(--kq-bad) 12%,transparent)}
.kq-btn[disabled]{opacity:.45;cursor:not-allowed}
.kq-btn[disabled]:hover{background:var(--kq-l2);border-color:var(--kq-line)}
.kq-tabs{display:flex;gap:2px;margin-top:12px;overflow-x:auto;scrollbar-width:none}
.kq-tabs::-webkit-scrollbar{display:none}
.kq-tab{border:0;background:transparent;color:var(--kq-dim);font-size:13px;padding:8px 14px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap;font-weight:600}
.kq-tab:hover{color:var(--kq-fg)}
.kq-tab.is-on{color:var(--kq-fg);border-bottom-color:var(--kq-brand)}
.kq-tab .kq-tabn{display:inline-block;margin-left:6px;font-size:11px;padding:0 5px;border-radius:9px;background:color-mix(in srgb,var(--kq-fg) 10%,transparent);color:var(--kq-dim);font-weight:600}
.kq-body{flex:1 1 auto;min-height:0;overflow:auto}
.kq-main{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px;align-items:start;max-width:1180px;margin:0 auto;padding:16px 22px 56px}
.kq-card{background:var(--kq-l1);border:1px solid var(--kq-line);border-radius:14px}
.kq-qcard{padding:22px 24px 20px}
.kq-qhead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11.5px;color:var(--kq-dim)}
.kq-chip{display:inline-flex;align-items:center;height:21px;padding:0 8px;border-radius:6px;border:1px solid var(--kq-line);font-size:11px;font-weight:700;letter-spacing:.3px;color:var(--kq-dim)}
.kq-chip--subject{color:var(--kq-brand);border-color:color-mix(in srgb,var(--kq-brand) 38%,transparent);background:color-mix(in srgb,var(--kq-brand) 10%,transparent)}
.kq-chip--multi{color:var(--kq-warn);border-color:color-mix(in srgb,var(--kq-warn) 38%,transparent);background:color-mix(in srgb,var(--kq-warn) 10%,transparent)}
.kq-qmeta{margin-left:12px;font-variant-numeric:tabular-nums}
.kq-qstate{margin-left:auto;color:var(--kq-dim);font-size:11.5px}
.kq-stem{font-size:16px;line-height:1.95;margin:16px 0 18px;color:var(--kq-fg);letter-spacing:.1px;white-space:pre-wrap}
.kq-options{display:flex;flex-direction:column;gap:9px}
.kq-opt{display:flex;align-items:flex-start;gap:11px;width:100%;text-align:left;padding:11px 13px;border:1px solid var(--kq-line);
  border-radius:10px;background:var(--kq-l1);color:var(--kq-fg);font-size:14px;line-height:1.7;cursor:pointer;
  transition:background .12s,border-color .12s}
.kq-opt:hover{background:color-mix(in srgb,var(--kq-fg) 5%,transparent);border-color:var(--kq-line2)}
.kq-letter{flex:0 0 25px;height:25px;border-radius:7px;display:grid;place-items:center;font-size:12.5px;font-weight:700;
  border:1px solid var(--kq-line);background:var(--kq-l2);color:var(--kq-dim);margin-top:1px}
.kq-otext{flex:1 1 auto;min-width:0;word-break:break-word}
.kq-mark{flex:0 0 auto;font-size:12px;font-weight:700;align-self:center;opacity:.9}
.kq-opt.is-picked{border-color:var(--kq-brand);background:color-mix(in srgb,var(--kq-brand) 10%,transparent)}
.kq-opt.is-picked .kq-letter{background:var(--kq-brand);border-color:var(--kq-brand);color:#fff}
.kq-opt.is-right{border-color:var(--kq-ok);background:color-mix(in srgb,var(--kq-ok) 12%,transparent);cursor:default}
.kq-opt.is-right .kq-letter{background:var(--kq-ok);border-color:var(--kq-ok);color:#fff}
.kq-opt.is-right .kq-mark{color:var(--kq-ok)}
.kq-opt.is-wrong{border-color:var(--kq-bad);background:color-mix(in srgb,var(--kq-bad) 12%,transparent);cursor:default}
.kq-opt.is-wrong .kq-letter{background:var(--kq-bad);border-color:var(--kq-bad);color:#fff}
.kq-opt.is-wrong .kq-mark{color:var(--kq-bad)}
.kq-opt.is-muted{cursor:default;opacity:.72}
.kq-explain{margin-top:18px;border-top:1px dashed var(--kq-line);padding-top:14px;font-size:13px;line-height:1.85;color:var(--kq-dim)}
.kq-explain-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:6px;font-size:12px}
.kq-res{font-weight:700;font-size:12.5px;padding:2px 9px;border-radius:20px}
.kq-res--ok{color:var(--kq-ok);background:color-mix(in srgb,var(--kq-ok) 14%,transparent)}
.kq-res--bad{color:var(--kq-bad);background:color-mix(in srgb,var(--kq-bad) 14%,transparent)}
.kq-explain p{margin:0;color:var(--kq-fg);opacity:.88;white-space:pre-wrap}
.kq-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:20px;padding-top:16px;border-top:1px solid var(--kq-line)}
.kq-actions .kq-spacer{margin-left:auto}
.kq-hint{font-size:11.5px;color:var(--kq-dim)}
.kq-rail{display:flex;flex-direction:column;gap:12px;position:sticky;top:16px}
.kq-railcard{padding:13px 14px}
.kq-railhead{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:var(--kq-dim);letter-spacing:.4px;margin-bottom:10px}
.kq-railhead span{margin-left:auto;font-weight:500;letter-spacing:0}
.kq-bar{height:7px;border-radius:6px;background:color-mix(in srgb,var(--kq-fg) 9%,transparent);overflow:hidden;display:flex}
.kq-bar i{display:block;height:100%;background:var(--kq-brand);transition:width .25s}
.kq-bar i.kq-bar-ok{background:var(--kq-ok)}
.kq-nums{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:11px;text-align:center}
.kq-nums b{display:block;font-size:17px;font-variant-numeric:tabular-nums;letter-spacing:.3px}
.kq-nums small{display:block;font-size:10.5px;color:var(--kq-dim);margin-top:1px}
.kq-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;max-height:196px;overflow:auto;padding-right:2px}
.kq-cell{position:relative;aspect-ratio:1/1;display:grid;place-items:center;border-radius:5px;border:1px solid var(--kq-line);
  background:var(--kq-l2);color:var(--kq-dim);font-size:10.5px;font-weight:600;cursor:pointer;padding:0;font-variant-numeric:tabular-nums}
.kq-cell:hover{border-color:var(--kq-line2);color:var(--kq-fg)}
.kq-cell.is-right{background:color-mix(in srgb,var(--kq-ok) 18%,transparent);border-color:color-mix(in srgb,var(--kq-ok) 45%,transparent);color:var(--kq-ok)}
.kq-cell.is-wrong{background:color-mix(in srgb,var(--kq-bad) 18%,transparent);border-color:color-mix(in srgb,var(--kq-bad) 45%,transparent);color:var(--kq-bad)}
.kq-cell.is-star::after{content:'★';position:absolute;right:1px;top:-1px;font-size:7px;line-height:1;color:var(--kq-warn)}
.kq-cell.is-now{outline:2px solid var(--kq-brand);outline-offset:1px}
.kq-note{font-size:11.5px;line-height:1.75;color:var(--kq-dim);background:transparent;border-style:dashed}
.kq-page{max-width:1000px;margin:0 auto;padding:20px 22px 56px}
.kq-pagehead{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:4px}
.kq-pagehead h2{margin:0;font-size:16px;font-weight:700}
.kq-pagehead p{margin:0;font-size:12px;color:var(--kq-dim)}
.kq-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:14px 0 12px}
.kq-filters{display:flex;gap:6px;flex-wrap:wrap}
.kq-filter{border:1px solid var(--kq-line);background:transparent;color:var(--kq-dim);border-radius:20px;padding:4px 11px;font-size:12px;cursor:pointer}
.kq-filter:hover{color:var(--kq-fg)}
.kq-filter.is-on{background:color-mix(in srgb,var(--kq-brand) 16%,transparent);border-color:color-mix(in srgb,var(--kq-brand) 45%,transparent);color:var(--kq-fg)}
.kq-list{display:flex;flex-direction:column;gap:8px}
.kq-row{display:flex;gap:11px;align-items:flex-start;padding:11px 13px;border:1px solid var(--kq-line);border-radius:10px;background:var(--kq-l1)}
.kq-row:hover{border-color:var(--kq-line2)}
.kq-rownum{flex:0 0 26px;height:26px;border-radius:7px;display:grid;place-items:center;background:var(--kq-l2);font-size:11px;font-weight:700;color:var(--kq-dim);font-variant-numeric:tabular-nums}
.kq-rowbody{flex:1 1 auto;min-width:0}
.kq-rowtitle{font-size:13px;line-height:1.65;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.kq-rowmeta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:4px;font-size:11px;color:var(--kq-dim)}
.kq-rowacts{display:flex;gap:6px;flex:0 0 auto;align-self:center}
.kq-empty{padding:56px 20px;text-align:center;color:var(--kq-dim);font-size:13px;line-height:2}
.kq-empty b{display:block;color:var(--kq-fg);font-size:15px;margin-bottom:4px}
.kq-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}
.kq-stat{padding:13px 15px;border:1px solid var(--kq-line);border-radius:12px;background:var(--kq-l1)}
.kq-stat small{display:block;font-size:11px;color:var(--kq-dim)}
.kq-stat b{font-size:22px;font-variant-numeric:tabular-nums;letter-spacing:.4px;line-height:1.4}
.kq-stat b i{font-style:normal;font-size:12px;color:var(--kq-dim);margin-left:2px}
.kq-section{margin-top:16px}
.kq-section h3{margin:0 0 9px;font-size:12.5px;font-weight:700;color:var(--kq-dim);letter-spacing:.5px}
.kq-subj{display:grid;grid-template-columns:64px 1fr 136px;gap:12px;align-items:center;padding:6px 0;font-size:12px}
.kq-subj .kq-sname{font-weight:600}
.kq-subj .kq-snum{text-align:right;color:var(--kq-dim);font-variant-numeric:tabular-nums;font-size:11.5px;white-space:nowrap}
.kq-days{display:flex;align-items:flex-end;gap:8px;height:96px;padding-top:6px}
.kq-day{flex:1 1 0;display:flex;flex-direction:column;align-items:center;gap:5px;height:100%;justify-content:flex-end}
.kq-day i{display:block;width:100%;max-width:34px;background:color-mix(in srgb,var(--kq-brand) 70%,transparent);border-radius:4px 4px 2px 2px;min-height:2px}
.kq-day span{font-size:10.5px;color:var(--kq-dim)}
.kq-day b{font-size:10px;color:var(--kq-dim);font-variant-numeric:tabular-nums}
.kq-form{display:flex;flex-direction:column;gap:10px}
.kq-field{display:flex;align-items:center;gap:10px;font-size:13px;padding:9px 0;border-bottom:1px solid var(--kq-line)}
.kq-field:last-child{border-bottom:0}
.kq-field .kq-flabel{font-weight:600}
.kq-field .kq-fdesc{font-size:11.5px;color:var(--kq-dim);margin-top:1px}
.kq-field .kq-fright{margin-left:auto;display:flex;gap:6px;align-items:center}
.kq-switch{position:relative;width:38px;height:22px;border-radius:20px;border:1px solid var(--kq-line);background:var(--kq-l2);cursor:pointer;padding:0}
.kq-switch::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--kq-dim);transition:.15s}
.kq-switch.is-on{background:var(--kq-brand);border-color:var(--kq-brand)}
.kq-switch.is-on::after{left:18px;background:#fff}
.kq-textarea{width:100%;min-height:150px;resize:vertical;border:1px solid var(--kq-line);border-radius:10px;background:var(--kq-bg);
  color:var(--kq-fg);font-family:Consolas,ui-monospace,Menlo,monospace;font-size:12px;line-height:1.6;padding:10px 12px}
.kq-textarea:focus{outline:none;border-color:var(--kq-brand)}
.kq-num{width:74px;border:1px solid var(--kq-line);border-radius:7px;background:var(--kq-bg);color:var(--kq-fg);padding:4px 8px;font-size:12.5px}
.kq-banner{margin:0 0 12px;padding:9px 12px;border-radius:9px;font-size:12px;line-height:1.7;
  border:1px solid color-mix(in srgb,var(--kq-warn) 40%,transparent);background:color-mix(in srgb,var(--kq-warn) 12%,transparent);color:var(--kq-fg)}
.kq-toast{position:fixed;left:50%;bottom:34px;transform:translateX(-50%) translateY(12px);opacity:0;pointer-events:none;
  background:var(--kq-l2);border:1px solid var(--kq-line2);border-left:3px solid var(--kq-brand);border-radius:9px;
  padding:9px 15px;font-size:12.5px;box-shadow:0 10px 30px rgba(0,0,0,.35);transition:.18s;z-index:60;max-width:min(80vw,520px)}
.kq-toast.is-on{opacity:1;transform:translateX(-50%) translateY(0)}
.kq-toast.is-bad{border-left-color:var(--kq-bad)}
.kq-toast.is-ok{border-left-color:var(--kq-ok)}
.kq-loading{padding:80px 20px;text-align:center;color:var(--kq-dim);font-size:13px}
.kq-fatal{padding:28px;color:var(--kq-bad);font-size:13px;font-family:inherit}
.kq-kbd{display:inline-block;padding:0 5px;border:1px solid var(--kq-line);border-radius:4px;font-size:10.5px;line-height:16px;color:var(--kq-dim);margin:0 1px}
@media (max-width:1060px){
  .kq-main{grid-template-columns:minmax(0,1fr);padding:14px 14px 56px}
  .kq-rail{position:static;display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}
  .kq-head{padding:12px 14px 0}
  .kq-qcard{padding:18px 16px 16px}
  .kq-stem{font-size:15px}
}
.kq-scopebar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px}
.kq-scopebar .kq-filters{margin:0}
.kq-select{appearance:none;-webkit-appearance:none;background:var(--kq-l2);color:var(--kq-fg);border:1px solid var(--kq-line);
  border-radius:8px;padding:6px 28px 6px 10px;font-size:12.5px;max-width:320px;cursor:pointer;
  background-image:linear-gradient(45deg,transparent 50%,var(--kq-dim) 50%),linear-gradient(135deg,var(--kq-dim) 50%,transparent 50%);
  background-position:calc(100% - 15px) 54%,calc(100% - 10px) 54%;background-size:5px 5px,5px 5px;background-repeat:no-repeat}
.kq-select:hover{border-color:var(--kq-line2)}
.kq-scopeinfo{margin-left:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:46%}
.kq-root.is-immersive{position:fixed;inset:0;z-index:2147483000;height:100vh;width:100vw;border-radius:0;box-shadow:0 0 0 2px var(--kq-line)}
.kq-root.is-immersive .kq-head{padding:10px 22px 0}
.kq-root.is-immersive .kq-body{max-width:none;margin:0;width:100%}
.kq-root.is-immersive .kq-main{max-width:1320px;padding-top:18px;grid-template-columns:minmax(0,1fr) 320px}
.kq-root.is-immersive .kq-stem{font-size:17px;line-height:1.95}
.kq-root.is-immersive .kq-opt{padding:14px 16px;font-size:14.5px}
.kq-root.is-immersive .kq-qcard{padding:26px 30px 22px}
html.kq-immersive-lock,html.kq-immersive-lock body{overflow:hidden!important}
.kq-root.is-immersive .kq-head{display:none}
.kq-root.is-immersive .kq-body{overflow:auto}
.kq-game{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:46px 24px 64px;position:relative;background-color:#2b070a;background-image:none;background-size:cover;background-position:center;background-repeat:no-repeat}
.kq-game--quiz{justify-content:flex-start;padding:26px 24px 90px;position:relative;background-image:none;background-size:cover;background-position:center}
.kq-game--quiz::before{content:'';position:absolute;inset:0;background:rgba(0,0,0,.50);pointer-events:none}
.kq-game--quiz.is-paper::before{background:rgba(0,0,0,.30)}
.kq-game--quiz > *{position:relative;z-index:1}
.kq-game-mark{font-size:11px;letter-spacing:6px;color:var(--kq-brand);font-weight:700;margin-bottom:10px}
.kq-game-title{margin:0 0 6px;font-size:32px;font-weight:800;letter-spacing:2px}
.kq-game-sub{margin:0 0 26px;color:var(--kq-dim);font-size:13px}
.kq-menu{width:min(560px,92vw);display:flex;flex-direction:column;gap:8px}
.kq-menu-item{display:flex;align-items:center;gap:16px;padding:15px 20px;border:1px solid var(--kq-line);border-radius:12px;
  background:var(--kq-l1);color:var(--kq-fg);font-size:15px;cursor:pointer;text-align:left;transition:all .12s ease;width:100%}
.kq-menu-item:hover{border-color:var(--kq-line2)}
.kq-menu-item.is-on{border-color:var(--kq-brand);background:color-mix(in srgb,var(--kq-brand) 12%,var(--kq-l1));transform:translateX(6px);box-shadow:0 0 0 1px color-mix(in srgb,var(--kq-brand) 45%,transparent)}
.kq-mi-num{width:26px;height:26px;flex:0 0 auto;display:grid;place-items:center;border-radius:50%;background:rgba(232,196,119,.18);border:1px solid rgba(232,196,119,.42);color:#d7d7d7;font-variant-numeric:tabular-nums;font-size:12.5px;font-weight:800}
.kq-menu-item.is-on .kq-mi-num{background:#2dd4bf;border-color:#2dd4bf;color:#3a0a0e}
.kq-mi-title{font-weight:600}
.kq-mi-desc{margin-left:auto;color:var(--kq-dim);font-size:12px;white-space:nowrap}
.kq-game-foot{position:absolute;bottom:20px;left:0;right:0;text-align:center;color:var(--kq-dim);font-size:12px}
.kq-picker{width:min(680px,94vw);max-height:58vh;overflow:auto;padding-right:4px}
.kq-pick-row{display:flex;align-items:center;gap:14px;padding:12px 16px;border:1px solid var(--kq-line);border-radius:10px;
  background:var(--kq-l1);color:var(--kq-fg);font-size:14px;cursor:pointer;text-align:left;width:100%}
.kq-pick-row.is-on{border-color:var(--kq-brand);background:color-mix(in srgb,var(--kq-brand) 12%,var(--kq-l1))}
.kq-pick-name{font-weight:600}
.kq-pick-meta{margin-left:auto;color:var(--kq-dim);font-size:12px;white-space:nowrap}
.kq-game-quiz{width:min(900px,92vw);margin:0 auto;padding:20px 26px 24px;border-radius:20px;background:rgba(9,11,15,.62);border:1px solid rgba(255,255,255,.07);box-shadow:0 24px 70px rgba(0,0,0,.45);backdrop-filter:none;-webkit-backdrop-filter:none}
.kq-game-top{display:flex;align-items:center;gap:14px;margin-bottom:16px;color:var(--kq-dim);font-size:12px}
.kq-gt-count{font-variant-numeric:tabular-nums;font-weight:700;color:var(--kq-fg);font-size:13px}
.kq-game-bar{flex:1;height:3px;border-radius:2px;background:color-mix(in srgb,var(--kq-fg) 12%,transparent);overflow:hidden}
.kq-game-bar i{display:block;height:100%;background:var(--kq-brand);border-radius:2px;transition:width .2s}
.kq-gt-meta{max-width:46%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kq-game-tags{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}
.kq-game-stem{font-size:23px;line-height:1.8;font-weight:600;margin:4px 0 26px;letter-spacing:.2px;text-shadow:0 2px 18px rgba(0,0,0,.55)}
.kq-game-opts{display:flex;flex-direction:column;gap:10px}
.kq-game-opt{display:flex;align-items:flex-start;gap:16px;padding:16px 18px;border-radius:14px;border:1px solid var(--kq-line);
  background:var(--kq-l1);color:var(--kq-fg);font-size:16px;line-height:1.65;cursor:pointer;text-align:left;width:100%;transition:all .1s}
.kq-game-opt:hover{border-color:var(--kq-line2);background:color-mix(in srgb,var(--kq-fg) 4%,var(--kq-l1))}
.kq-game-opt.is-picked{border-color:var(--kq-brand);background:color-mix(in srgb,var(--kq-brand) 12%,var(--kq-l1))}
.kq-game-opt.is-right{border-color:var(--kq-ok);background:color-mix(in srgb,var(--kq-ok) 14%,var(--kq-l1))}
.kq-game-opt.is-wrong{border-color:var(--kq-bad);background:color-mix(in srgb,var(--kq-bad) 14%,var(--kq-l1))}
.kq-game-opt.is-muted{opacity:.5}
.kq-go-letter{width:34px;height:34px;flex:0 0 auto;border-radius:9px;display:grid;place-items:center;font-weight:800;font-size:14px;
  background:color-mix(in srgb,var(--kq-fg) 8%,transparent);color:var(--kq-dim)}
.kq-game-opt.is-picked .kq-go-letter{background:var(--kq-brand);color:#fff}
.kq-game-opt.is-right .kq-go-letter{background:var(--kq-ok);color:#fff}
.kq-game-opt.is-wrong .kq-go-letter{background:var(--kq-bad);color:#fff}
.kq-go-text{flex:1;padding-top:5px}
.kq-go-mark{font-size:12px;font-weight:700;color:var(--kq-dim);padding-top:8px;white-space:nowrap}
.kq-game-opt.is-right .kq-go-mark{color:var(--kq-ok)}
.kq-game-opt.is-wrong .kq-go-mark{color:var(--kq-bad)}
.kq-game-result{display:flex;align-items:center;gap:14px;margin:22px 0 8px;font-size:13px;flex-wrap:wrap}
.kq-game-explain{font-size:14px;line-height:1.9;color:var(--kq-dim);border-top:1px dashed var(--kq-line);padding-top:14px;margin-top:10px;max-height:30vh;overflow:auto}
.kq-game-hint{position:fixed;left:0;right:0;bottom:0;padding:12px;text-align:center;color:var(--kq-dim);font-size:12px;
  background:linear-gradient(180deg,transparent,var(--kq-bg) 55%);pointer-events:none}

.kq-root{
  --kq-bg:#2b070a;--kq-l1:#3f0a0f;--kq-l2:#521016;
  --kq-line:rgba(232,196,119,.22);--kq-line2:rgba(232,196,119,.46);
  --kq-fg:#d7d7d7;--kq-dim:#9a9a9a;
  --kq-brand:#2dd4bf;--kq-ok:#43a047;--kq-bad:#ff6b6b;--kq-warn:#2dd4bf;
}
.kq-head{background:linear-gradient(180deg,#4a0c12,#34080c);border-bottom:1px solid rgba(232,196,119,.28)}
.kq-titles h1{color:#e8e8e8;letter-spacing:1px}
.kq-logo{background:linear-gradient(145deg,#2dd4bf,#8e0a1f);color:#5eead4}
.kq-tab.is-on{color:#e8e8e8;border-bottom-color:#2dd4bf}
.kq-tab:hover{color:#e8e8e8}
.kq-seg{border-color:rgba(232,196,119,.28);background:#1b0506}
.kq-segbtn.is-on{background:linear-gradient(180deg,#2dd4bf,#a30f22);color:#d7d7d7}
.kq-btn{border-color:rgba(232,196,119,.30);background:#3a0a0e;color:#d7d7d7}
.kq-btn:hover{background:#4a0d12;border-color:rgba(232,196,119,.55)}
.kq-btn--primary{background:linear-gradient(180deg,#5eead4,#2dd4bf);border-color:#2dd4bf;color:#3a0a0e;font-weight:800}
.kq-btn--primary:hover{background:linear-gradient(180deg,#5eead4,#2dd4bf)}
.kq-btn--primary[disabled]{opacity:.5;background:#5a4a2a;color:#c9b48a}
.kq-btn--ghost{background:transparent;color:#d7d7d7}
.kq-btn--ghost:hover{background:rgba(232,196,119,.12)}
.kq-kbd{background:#4a0d12;color:#5eead4;border:1px solid rgba(232,196,119,.35)}
.kq-card{background:rgba(63,10,15,.93);border-color:rgba(232,196,119,.20);box-shadow:0 10px 30px rgba(0,0,0,.35)}
.kq-filter{color:#d9bd93;border-color:rgba(232,196,119,.24);background:rgba(58,10,14,.6)}
.kq-filter.is-on{background:linear-gradient(180deg,#2dd4bf,#a30f22);border-color:#2dd4bf;color:#d7d7d7}
.kq-select{background:#3a0a0e;color:#d7d7d7;border-color:rgba(232,196,119,.35)}
.kq-chip--subject{color:#2dd4bf;border-color:rgba(232,196,119,.45);background:rgba(200,16,46,.18)}
.kq-chip--multi{color:#5eead4;border-color:rgba(255,180,107,.45);background:rgba(255,140,60,.14)}
.kq-opt{background:rgba(58,10,14,.85);border-color:rgba(232,196,119,.22);color:#d7d7d7}
.kq-opt:hover{border-color:rgba(232,196,119,.5);background:rgba(74,13,18,.9)}
.kq-letter{background:rgba(232,196,119,.14);color:#2dd4bf}
.kq-opt.is-picked{border-color:#2dd4bf;background:rgba(200,16,46,.22)}
.kq-opt.is-right{border-color:#43a047;background:rgba(67,160,71,.16)}
.kq-opt.is-wrong{border-color:#ff6b6b;background:rgba(255,107,107,.14)}
.kq-cell{background:#32080b;border-color:rgba(232,196,119,.18);color:#bdbdbd}
.kq-cell.is-right{background:rgba(67,160,71,.25);border-color:#43a047}
.kq-cell.is-wrong{background:rgba(255,107,107,.22);border-color:#ff6b6b}
.kq-cell.is-now{border-color:#5eead4;box-shadow:0 0 0 1px #5eead4}
.kq-bar{background:rgba(255,255,255,.08)}
.kq-bar i{background:linear-gradient(90deg,#2dd4bf,#2dd4bf)}
.kq-bar-ok i{background:linear-gradient(90deg,#2dd4bf,#5eead4)}
.kq-game-title{color:#d7d7d7;text-shadow:0 2px 10px rgba(0,0,0,.75),0 0 36px rgba(0,0,0,.55);display:inline-block;padding:6px 24px;border-radius:16px;border:1px solid rgba(232,196,119,.30);background:rgba(22,3,5,.86);backdrop-filter:none;-webkit-backdrop-filter:none}
.kq-game-mark{color:#5eead4;letter-spacing:8px;text-shadow:0 1px 8px rgba(0,0,0,.8)}
.kq-game-sub{color:#d7d7d7;text-shadow:0 1px 8px rgba(0,0,0,.8);display:inline-block;padding:3px 14px;border-radius:12px;background:rgba(18,3,5,.38)}
.kq-menu-item{background:rgba(38,5,8,.96);border-color:rgba(232,196,119,.28);color:#d7d7d7}
.kq-menu-item:not(.is-on){background:rgba(38,5,8,.96)}
.kq-menu-item.is-on{border-color:#2dd4bf;background:linear-gradient(90deg,rgba(200,16,46,.62),rgba(74,10,16,.86));box-shadow:0 0 0 1px rgba(224,182,75,.5),0 6px 24px rgba(0,0,0,.4)}
.kq-mi-desc{color:#9a9a9a}
.kq-game-quiz{background:rgba(18,6,8,.90);border-color:rgba(232,196,119,.30)}
.kq-game-stem{color:#fff4e2}
.kq-game-opt{background:rgba(44,10,14,.78);border-color:rgba(232,196,119,.24);color:#d7d7d7}
.kq-game-opt:hover{border-color:#2dd4bf;background:rgba(62,14,20,.88)}
.kq-game-opt.is-picked{border-color:#2dd4bf;background:rgba(120,20,32,.72)}
.kq-game-opt.is-right{border-color:#43a047;background:rgba(67,160,71,.18)}
.kq-game-opt.is-wrong{border-color:#ff6b6b;background:rgba(255,107,107,.15)}
.kq-go-letter{background:rgba(232,196,119,.14);color:#2dd4bf}
.kq-game-bar i{background:linear-gradient(90deg,#2dd4bf,#2dd4bf)}
.kq-game-foot{color:#9a9a9a}
.kq-game-explain{color:#cfcfcf;border-top-color:rgba(232,196,119,.22)}
.kq-game-result{color:#cfcfcf}
.kq-res--bad{background:rgba(255,107,107,.22);color:#ffd2d2}
.kq-res--ok{background:rgba(67,160,71,.26);color:#c2f2c8}
.kq-game-opt.is-muted{opacity:.78}
.kq-game-opt.is-focus{outline:2px solid #d7d7d7;outline-offset:2px;box-shadow:0 0 24px rgba(255,233,189,.25)}
.kq-game-opt.is-focus .kq-go-letter{background:#2dd4bf;color:#3a0a0e}
.kq-game-submit{display:flex;align-items:center;gap:14px;margin-top:16px;flex-wrap:wrap}
.kq-game-sheet{width:min(1000px,94vw);margin:0 auto;padding:20px 22px 22px;border-radius:20px;background:rgba(38,5,9,.86);border:1px solid rgba(232,196,119,.28);box-shadow:0 24px 70px rgba(0,0,0,.45)}
.kq-sheet-head{display:flex;align-items:center;gap:14px;margin-bottom:16px;color:#d7d7d7;font-size:13px;flex-wrap:wrap}
.kq-sheet-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(44px,1fr));gap:6px;max-height:62vh;overflow:auto;padding-right:4px}
.kq-sheet-cell{height:36px;border-radius:8px;border:1px solid rgba(232,196,119,.20);background:rgba(60,8,13,.85);color:#bdbdbd;font-size:12.5px;cursor:pointer}
.kq-sheet-cell:hover{border-color:#2dd4bf;color:#fff}
.kq-sheet-cell.is-right{background:rgba(67,160,71,.35);border-color:#43a047;color:#d8f5dc}
.kq-sheet-cell.is-wrong{background:rgba(255,107,107,.30);border-color:#ff6b6b;color:#ffe0e0}
.kq-sheet-cell.is-now{box-shadow:0 0 0 2px #2dd4bf inset;color:#fff}
.kq-sheet-cell.is-star::after{content:'★';font-size:9px;margin-left:2px;color:#2dd4bf}
.kq-game-top .kq-btn{background:rgba(58,58,64,.62);border-color:rgba(255,255,255,.16);color:#e9e9ee}
.kq-game-top .kq-btn:hover{background:rgba(80,80,88,.75);border-color:rgba(255,255,255,.30);color:#fff}
.kq-game-sheet{background:rgba(24,24,28,.93);border-color:rgba(255,255,255,.12)}
.kq-sheet-head{color:#e9e9ee}
.kq-sheet-head .kq-btn{background:#fff;border-color:#e4e6ea;color:#1f2328}
.kq-sheet-head .kq-btn:hover{background:#f5f6f8;border-color:#cfd3d9;color:#1f2328}
.kq-game-quiz.is-paper{background:#ebe4d4;border-color:#383838;box-shadow:0 24px 70px rgba(0,0,0,.35)}
.is-paper .kq-game-top{color:#6b5a45}
.is-paper .kq-gt-count{color:#8a1c1c}
.is-paper .kq-game-bar{background:rgba(0,0,0,.10)}
.is-paper .kq-game-bar i{background:linear-gradient(90deg,#2dd4bf,#2dd4bf)}
.is-paper .kq-game-tags .kq-chip{color:#8a1c1c;border-color:#2a5f57;background:#fff6e5}
.is-paper .kq-game-stem{color:#26241f;text-shadow:none}
.is-paper .kq-game-opt{background:#f4eee2;border-color:#ddd2bb;color:#222}
.is-paper .kq-game-opt:hover{background:#faf5ea;border-color:#2dd4bf}
.is-paper .kq-game-opt .kq-go-letter{background:#2b2b2b;color:#8a1c1c}
.is-paper .kq-game-opt.is-picked{border-color:#2dd4bf;background:#fdf3e2}
.is-paper .kq-game-opt.is-right{border-color:#2e7d32;background:#eef7ee}
.is-paper .kq-game-opt.is-right .kq-go-letter{background:#2e7d32;color:#fff}
.is-paper .kq-game-opt.is-wrong{border-color:#c62828;background:#fdeeee}
.is-paper .kq-game-opt.is-wrong .kq-go-letter{background:#c62828;color:#fff}
.is-paper .kq-game-opt.is-muted{opacity:.55}
.is-paper .kq-game-opt.is-focus{outline-color:#2dd4bf;box-shadow:0 0 24px rgba(200,162,74,.25)}
.is-paper .kq-game-result{color:#4a3a2a}
.is-paper .kq-game-explain{color:#3d3d3d;border-top-color:#ddd2bb}
.is-paper .kq-game-hint{color:#383838;background:none}
.is-paper .kq-res--ok{background:#e3f2e3;color:#1b5e20}
.is-paper .kq-res--bad{background:#fde7e7;color:#a31515}
.is-paper .kq-game-top .kq-btn{background:#efe7d6;border-color:#d6c7ab;color:#4a3a2a}
.is-paper .kq-game-top .kq-btn:hover{background:#2a2a2a;border-color:#2dd4bf;color:#2b1b0e}
.is-paper .kq-btn--ghost{color:#5a4a3a;border-color:#cfc0a5}
.is-paper .kq-btn--ghost:hover{background:rgba(0,0,0,.05)}
.is-paper .kq-kbd{background:#efe5cf;color:#7a1f1f;border-color:#383838}
.kq-sheet-cell{background:rgba(62,62,68,.85);border-color:rgba(255,255,255,.14);color:#dcdce2}
.kq-sheet-cell:hover{border-color:rgba(255,255,255,.45);color:#fff}

.kq-select option{background:#2a0709}

/* ---------- 清爽试卷风 ---------- */
.kq-root{--kq-bg:#f6f7f9;--kq-l1:#ffffff;--kq-l2:#f2f3f5;--kq-line:#e4e6ea;--kq-line2:#cfd3d9;
  --kq-fg:#1f2328;--kq-dim:#6b7280;--kq-brand:#111827;--kq-ok:#1a7f37;--kq-bad:#cf222e;--kq-warn:#2dd4bf}
.kq-head{background:#fff;border-bottom:1px solid #e4e6ea}
.kq-titles h1{color:#1f2328;letter-spacing:0}
.kq-logo{background:#f2f3f5;color:#1f2328}
.kq-sub{color:#6b7280}
.kq-tab{color:#6b7280}
.kq-tab.is-on{color:#1f2328;border-bottom-color:#1f2328}
.kq-seg{border-color:#e4e6ea;background:#fff}
.kq-segbtn{color:#6b7280}
.kq-segbtn.is-on{background:#1f2328;color:#fff}
.kq-btn{border-color:#e4e6ea;background:#fff;color:#1f2328}
.kq-btn:hover{background:#f5f6f8;border-color:#cfd3d9}
.kq-btn--primary{background:#1f2328;border-color:#1f2328;color:#fff;font-weight:600}
.kq-btn--primary:hover{background:#000}
.kq-btn--ghost{background:transparent;color:#1f2328}
.kq-btn--ghost:hover{background:#f2f3f5}
.kq-kbd{background:#f2f3f5;color:#1f2328;border-color:#e4e6ea}
.kq-card{background:#fff;border-color:#e4e6ea;box-shadow:0 1px 2px rgba(16,24,40,.04)}
.kq-filter{color:#4b5563;border-color:#e4e6ea;background:#fff}
.kq-filter.is-on{background:#1f2328;border-color:#1f2328;color:#fff}
.kq-select{background:#fff;color:#1f2328;border-color:#e4e6ea}
.kq-chip{color:#6b7280;border-color:#e4e6ea}
.kq-chip--subject{color:#1f2328;border-color:#cfd3d9;background:#f2f3f5}
.kq-chip--multi{color:#2dd4bf;border-color:#2a5f57;background:#fdf8ec}
.kq-opt{background:#fff;border-color:#e4e6ea;color:#1f2328}
.kq-opt:hover{background:#fafbfc;border-color:#cfd3d9}
.kq-letter{background:#fff;border:1px solid #d0d4da;color:#6b7280;border-radius:50%}
.kq-opt.is-picked{border-color:#1f2328;background:#f7f8fa}
.kq-opt.is-right{border-color:#1a7f37;background:#f2fbf4}
.kq-opt.is-wrong{border-color:#cf222e;background:#fdf3f3}
.kq-cell{background:#fff;border-color:#e4e6ea;color:#4b5563}
.kq-cell.is-right{background:#eaf7ee;border-color:#1a7f37;color:#1a7f37}
.kq-cell.is-wrong{background:#fdeeee;border-color:#cf222e;color:#cf222e}
.kq-cell.is-now{border-color:#1f2328;box-shadow:0 0 0 1px #1f2328}
.kq-bar{background:#eceef1}
.kq-bar i{background:#1f2328}
.kq-bar-ok i{background:#1a7f37}
.kq-game{background:#f6f7f9!important;background-image:none!important}
.kq-game--quiz{background:#f6f7f9!important;background-image:none!important}
.kq-game--quiz::before{display:none}
.kq-game-mark{color:#9aa1a9;letter-spacing:4px;text-shadow:none}
.kq-game-title{color:#111827;background:none;border:none;padding:0;text-shadow:none;font-size:28px;letter-spacing:1px}
.kq-game-sub{color:#6b7280;background:none;padding:0;text-shadow:none}
.kq-menu-item{background:#fff;border:1px solid #e4e6ea;color:#1f2328;box-shadow:0 1px 2px rgba(16,24,40,.04);backdrop-filter:none}
.kq-menu-item:hover{border-color:#cfd3d9;background:#fafbfc}
.kq-menu-item.is-on{border-color:#1f2328;background:#f4f5f7;transform:none;box-shadow:0 2px 10px rgba(0,0,0,.06)}
.kq-mi-num{background:#fff;border:1px solid #d0d4da;color:#6b7280;border-radius:50%}
.kq-menu-item.is-on .kq-mi-num{background:#1f2328;border-color:#1f2328;color:#fff}
.kq-mi-desc{color:#6b7280}
.kq-game-foot{color:#9aa1a9}
.kq-menu-item:not(.is-on){background:#fff;border-color:#e4e6ea;color:#1f2328}
.kq-game-top .kq-btn{background:#fff;border-color:#e4e6ea;color:#1f2328}
.kq-game-top .kq-btn:hover{background:#f5f6f8;border-color:#cfd3d9;color:#1f2328}

.kq-game-quiz{background:#fff!important;border:1px solid #e4e6ea;box-shadow:0 10px 40px rgba(16,24,40,.08)}
.kq-game-top{color:#6b7280}
.kq-gt-count{color:#1f2328}
.kq-game-bar{background:#eceef1}
.kq-game-bar i{background:#1f2328}
.kq-game-tags .kq-chip{color:#6b7280;border-color:#e4e6ea;background:#fff}
.kq-game-tags .kq-chip--subject{color:#1f2328;border-color:#cfd3d9;background:#f2f3f5}
.kq-game-stem{color:#111827;font-size:21px;text-shadow:none}
.kq-game-opt{background:#fff;border:1px solid #e4e6ea;color:#1f2328}
.kq-game-opt:hover{border-color:#cfd3d9;background:#fafbfc}
.kq-go-letter{background:#fff;border:1px solid #d0d4da;color:#6b7280;border-radius:50%;width:30px;height:30px}
.kq-game-opt.is-picked{border-color:#1f2328;background:#f7f8fa}
.kq-game-opt.is-picked .kq-go-letter{background:#1f2328;border-color:#1f2328;color:#fff}
.kq-game-opt.is-right{border-color:#1a7f37;background:#f2fbf4}
.kq-game-opt.is-right .kq-go-letter{background:#1a7f37;border-color:#1a7f37;color:#fff}
.kq-game-opt.is-wrong{border-color:#cf222e;background:#fdf3f3}
.kq-game-opt.is-wrong .kq-go-letter{background:#cf222e;border-color:#cf222e;color:#fff}
.kq-game-opt.is-focus{outline:2px solid #1f2328;outline-offset:2px;box-shadow:none}
.kq-game-result{color:#1f2328}
.kq-game-explain{color:#4b5563;border-top-color:#e4e6ea}
.kq-game-hint{color:#6b7280;background:linear-gradient(180deg,transparent,#f6f7f9 60%)}
.kq-res--ok{background:#eaf7ee;color:#1a7f37}
.kq-res--bad{background:#fdeeee;color:#cf222e}
.kq-game-sheet{background:#fff;border-color:#e4e6ea;box-shadow:0 10px 40px rgba(16,24,40,.08)}
.kq-sheet-head{color:#1f2328}
.kq-sheet-cell{background:#fff;border-color:#e4e6ea;color:#4b5563}
.kq-sheet-cell:hover{border-color:#1f2328;color:#1f2328}
.kq-sheet-cell.is-now{box-shadow:0 0 0 2px #1f2328 inset;color:#1f2328}
.kq-sheet-cell.is-star::after{color:#2dd4bf}
/* ---------- 深色青调（考试端风格） ---------- */
.kq-root{--kq-bg:#1b1b1b;--kq-l1:#232323;--kq-l2:#2b2b2b;--kq-line:#383838;--kq-line2:#4a4a4a;
  --kq-fg:#d7d7d7;--kq-dim:#9a9a9a;--kq-brand:#2dd4bf;--kq-ok:#22c55e;--kq-bad:#ef4444;--kq-warn:#2dd4bf}
.kq-head{background:#1f1f1f;border-bottom-color:#333}
.kq-titles h1{color:#e8e8e8}
.kq-sub{color:#9a9a9a}
.kq-logo{background:#2b2b2b;color:#2dd4bf}
.kq-tab{color:#9a9a9a}
.kq-tab.is-on{color:#2dd4bf;border-bottom-color:#2dd4bf}
.kq-seg{border-color:#3a3a3a;background:#232323}
.kq-segbtn.is-on{background:#2dd4bf;color:#062b26}
.kq-btn{background:#2a2a2a;border-color:#3f3f3f;color:#d7d7d7}
.kq-btn:hover{background:#333;border-color:#555}
.kq-btn--primary{background:#2dd4bf;border-color:#2dd4bf;color:#062b26}
.kq-btn--primary:hover{background:#5eead4}
.kq-card{background:#232323;border-color:#383838;box-shadow:none}
.kq-filter{background:#232323;border-color:#3a3a3a;color:#b5b5b5}
.kq-filter.is-on{background:#2dd4bf;border-color:#2dd4bf;color:#062b26}
.kq-select{background:#2a2a2a;color:#d7d7d7;border-color:#3f3f3f}
.kq-chip{color:#9a9a9a;border-color:#3a3a3a;background:#262626}
.kq-kbd{background:#333;border-color:#4a4a4a;color:#ddd}
.kq-game{background:#1b1b1b!important;background-image:none!important}
.kq-game--quiz{background:#1b1b1b!important;background-image:none!important}
.kq-game-title{color:#e8e8e8;background:none;border:none;padding:0}
.kq-game-sub{color:#9a9a9a;background:none;padding:0}
.kq-game-mark{color:#5f5f5f;letter-spacing:4px}
.kq-menu-item{background:#232323;border-color:#383838;color:#d7d7d7;box-shadow:none}
.kq-menu-item:hover{border-color:#4a4a4a;background:#2a2a2a}
.kq-menu-item.is-on{border-color:#2dd4bf;background:#1d2d2a;transform:none;box-shadow:0 0 0 1px rgba(45,212,191,.35)}
.kq-mi-num{background:#2b2b2b;border-color:#444;color:#aaa;border-radius:50%}
.kq-menu-item.is-on .kq-mi-num{background:#2dd4bf;border-color:#2dd4bf;color:#062b26}
.kq-mi-desc{color:#9a9a9a}
.kq-menu-item:not(.is-on){background:#232323;border-color:#383838;color:#d7d7d7}
.kq-game-foot{color:#7a7a7a}
.kq-game-quiz{background:#1f1f1f!important;border-color:#383838;box-shadow:none}
.kq-game-top{color:#9a9a9a}
.kq-gt-count{color:#2dd4bf}
.kq-game-bar{background:#333}
.kq-game-bar i{background:#2dd4bf}
.kq-game-tags .kq-chip{background:#2a2a2a;border-color:#3a3a3a;color:#aaa}
.kq-game-tags .kq-chip--subject{color:#2dd4bf;border-color:#2a5f57;background:#16302c}
.kq-game-stem{color:#e6e6e6;font-weight:500;font-size:20px;line-height:1.85;text-shadow:none}
.kq-game-opt{background:#232323;border-color:#3a3a3a;color:#cfcfcf}
.kq-game-opt:hover{background:#2a2a2a;border-color:#4a4a4a}
.kq-go-letter{background:transparent;border:1px solid #4a4a4a;color:#9a9a9a;border-radius:4px;width:26px;height:26px;font-size:13px}
.kq-game-opt.is-picked{border-color:#2dd4bf;background:#1d2d2a}
.kq-game-opt.is-picked .kq-go-letter{background:#2dd4bf;border-color:#2dd4bf;color:#062b26}
.kq-game-opt.is-right{border-color:#22c55e;background:#14251a}
.kq-game-opt.is-right .kq-go-letter{background:#22c55e;border-color:#22c55e;color:#06240f}
.kq-game-opt.is-right .kq-go-text{color:#bff5cf}
.kq-game-opt.is-wrong{border-color:#ef4444;background:#2a1717}
.kq-game-opt.is-wrong .kq-go-letter{background:#ef4444;border-color:#ef4444;color:#fff}
.kq-game-opt.is-muted{opacity:.55}
.kq-game-opt.is-focus{outline:2px solid rgba(45,212,191,.45);outline-offset:2px;box-shadow:none}
.kq-game-result{color:#cfcfcf}
.kq-res--ok{background:#16321f;color:#7ee2a8}
.kq-res--bad{background:#33191b;color:#ff9a9a}
.kq-game-explain{color:#b9b9b9;border-top:1px solid #343434;background:#1c241f;border-left:3px solid #22c55e;
  padding:12px 14px;border-radius:0 8px 8px 0}
.kq-game-nav{display:flex;gap:10px;align-items:center;margin-top:18px;padding-top:14px;border-top:1px solid #343434}
.kq-nav-info{margin-left:auto;color:#8b8b8b;font-size:12px}
.kq-game-sheet{background:#1f1f1f;border-color:#383838;box-shadow:none}
.kq-sheet-head{color:#d7d7d7}
.kq-sheet-cell{background:#232323;border-color:#3a3a3a;color:#bdbdbd}
.kq-sheet-cell:hover{border-color:#2dd4bf;color:#e8e8e8}
.kq-sheet-cell.is-right{background:#16321f;border-color:#22c55e;color:#7ee2a8}
.kq-sheet-cell.is-wrong{background:#33191b;border-color:#ef4444;color:#ff9a9a}
.kq-sheet-cell.is-now{box-shadow:0 0 0 2px #2dd4bf inset;color:#2dd4bf}
.kq-game-top .kq-btn{background:#2a2a2a;border-color:#3f3f3f;color:#d7d7d7}
.kq-game-top .kq-btn:hover{background:#333;border-color:#555;color:#fff}
.kq-sheet-head .kq-btn{background:#2a2a2a;border-color:#3f3f3f;color:#d7d7d7}
.kq-sheet-head .kq-btn:hover{background:#333;border-color:#555;color:#fff}
.kq-opt{background:#232323;border-color:#3a3a3a;color:#cfcfcf}
.kq-opt:hover{background:#2a2a2a;border-color:#4a4a4a}
.kq-letter{background:transparent;border:1px solid #4a4a4a;color:#9a9a9a;border-radius:4px}
.kq-opt.is-picked{border-color:#2dd4bf;background:#1d2d2a}
.kq-opt.is-right{border-color:#22c55e;background:#14251a}
.kq-opt.is-wrong{border-color:#ef4444;background:#2a1717}
.kq-cell{background:#232323;border-color:#3a3a3a;color:#bdbdbd}
.kq-cell.is-right{background:#16321f;border-color:#22c55e;color:#7ee2a8}
.kq-cell.is-wrong{background:#33191b;border-color:#ef4444;color:#ff9a9a}
.kq-cell.is-now{border-color:#2dd4bf;box-shadow:0 0 0 1px #2dd4bf}
.kq-bar{background:#333}
.kq-bar i{background:#2dd4bf}

/* ---------- 柔化阅读对比 ---------- */
.kq-root{--kq-bg:#f2f0e9;--kq-l1:#faf8f2;--kq-l2:#efece4;--kq-line:#e3ded2;--kq-line2:#d3ccbc;
  --kq-fg:#3b3833;--kq-dim:#7b776e;--kq-brand:#3a3733;--kq-warn:#2dd4bf}
.kq-head{background:#faf8f2;border-bottom-color:#e3ded2}
.kq-titles h1{color:#2f2d29}
.kq-sub{color:#7b776e}
.kq-tab.is-on{color:#2f2d29;border-bottom-color:#3a3733}
.kq-tab{color:#7b776e}
.kq-segbtn.is-on{background:#3a3733}
.kq-btn--primary{background:#3a3733;border-color:#3a3733}
.kq-card{background:#fbf9f4;border-color:#e3ded2}
.kq-game{background:#f2f0e9!important}
.kq-game--quiz{background:#f2f0e9!important}
.kq-game-title{color:#2f2d29;font-weight:700}
.kq-game-sub{color:#7b776e}
.kq-game-quiz{background:#fbf9f4!important;border-color:#e3ded2;box-shadow:0 10px 40px rgba(60,52,35,.10)}
.kq-game-stem{color:#2f2d29;font-weight:500;font-size:20px;line-height:1.85}
.kq-game-opt{background:#fdfbf7;border-color:#e3ded2;color:#3b3833}
.kq-game-opt:hover{background:#f6f2e8;border-color:#d3ccbc}
.kq-go-letter{background:#f6f2e8;border-color:#ddd6c8;color:#6f6b61}
.kq-game-opt.is-picked{background:#f3eee2;border-color:#3a3733}
.kq-game-opt.is-picked .kq-go-letter{background:#3a3733;border-color:#3a3733;color:#faf8f2}
.kq-game-tags .kq-chip{color:#6f6b61;border-color:#e3ded2;background:#faf8f2}
.kq-game-tags .kq-chip--subject{color:#4a463e;border-color:#d3ccbc;background:#efece4}
.kq-game-result{color:#4a463e}
.kq-game-explain{color:#55524a;border-top-color:#e3ded2}
.kq-game-hint{color:#8a857a}
.kq-opt{background:#fdfbf7;border-color:#e3ded2;color:#3b3833}
.kq-opt:hover{background:#f6f2e8;border-color:#d3ccbc}
.kq-letter{background:#f6f2e8;border-color:#ddd6c8;color:#6f6b61}
.kq-sheet-cell{background:#fdfbf7;border-color:#e3ded2;color:#5c594f}
.kq-sheet-cell:hover{border-color:#3a3733;color:#2f2d29}
.kq-sheet-cell.is-now{box-shadow:0 0 0 2px #3a3733 inset;color:#2f2d29}
.kq-game-sheet{background:#fbf9f4;border-color:#e3ded2;box-shadow:0 10px 40px rgba(60,52,35,.10)}
.kq-kbd{background:#efece4;border-color:#e3ded2;color:#4a463e}
/* ---------- 深色青调（最后覆盖） ---------- */
.kq-root{--kq-bg:#1b1b1b;--kq-l1:#232323;--kq-l2:#2b2b2b;--kq-line:#383838;--kq-line2:#4a4a4a;
  --kq-fg:#d7d7d7;--kq-dim:#9a9a9a;--kq-brand:#2dd4bf;--kq-ok:#22c55e;--kq-bad:#ef4444;--kq-warn:#2dd4bf}
.kq-head{background:#1f1f1f;border-bottom-color:#333}
.kq-titles h1{color:#e8e8e8}
.kq-sub{color:#9a9a9a}
.kq-logo{background:#2b2b2b;color:#2dd4bf}
.kq-tab{color:#9a9a9a}
.kq-tab.is-on{color:#2dd4bf;border-bottom-color:#2dd4bf}
.kq-seg{border-color:#3a3a3a;background:#232323}
.kq-segbtn.is-on{background:#2dd4bf;color:#062b26}
.kq-btn{background:#2a2a2a;border-color:#3f3f3f;color:#d7d7d7}
.kq-btn:hover{background:#333;border-color:#555}
.kq-btn--primary{background:#2dd4bf;border-color:#2dd4bf;color:#062b26}
.kq-card{background:#232323;border-color:#383838;box-shadow:none}
.kq-filter{background:#232323;border-color:#3a3a3a;color:#b5b5b5}
.kq-filter.is-on{background:#2dd4bf;border-color:#2dd4bf;color:#062b26}
.kq-select{background:#2a2a2a;color:#d7d7d7;border-color:#3f3f3f}
.kq-chip{color:#9a9a9a;border-color:#3a3a3a;background:#262626}
.kq-kbd{background:#333;border-color:#4a4a4a;color:#ddd}
.kq-game{background:#1b1b1b!important;background-image:none!important}
.kq-game--quiz{background:#1b1b1b!important;background-image:none!important}
.kq-game-title{color:#e8e8e8;background:none;border:none;padding:0}
.kq-game-sub{color:#9a9a9a;background:none;padding:0}
.kq-game-mark{color:#5f5f5f;letter-spacing:4px}
.kq-menu-item,.kq-menu-item:not(.is-on){background:#232323;border-color:#383838;color:#d7d7d7;box-shadow:none}
.kq-menu-item:hover{border-color:#4a4a4a;background:#2a2a2a}
.kq-menu-item.is-on{border-color:#2dd4bf;background:#1d2d2a;transform:none;box-shadow:0 0 0 1px rgba(45,212,191,.35)}
.kq-mi-num{background:#2b2b2b;border-color:#444;color:#aaa;border-radius:50%}
.kq-menu-item.is-on .kq-mi-num{background:#2dd4bf;border-color:#2dd4bf;color:#062b26}
.kq-mi-desc{color:#9a9a9a}
.kq-game-foot{color:#7a7a7a}
.kq-game-quiz{background:#1f1f1f!important;border-color:#383838;box-shadow:none}
.kq-game-top{color:#9a9a9a}
.kq-gt-count{color:#2dd4bf}
.kq-game-bar{background:#333}
.kq-game-bar i{background:#2dd4bf}
.kq-game-tags .kq-chip{background:#2a2a2a;border-color:#3a3a3a;color:#aaa}
.kq-game-tags .kq-chip--subject{color:#2dd4bf;border-color:#2a5f57;background:#16302c}
.kq-game-stem{color:#e6e6e6;font-weight:500;font-size:20px;line-height:1.85;text-shadow:none}
.kq-game-opt{background:#232323;border-color:#3a3a3a;color:#cfcfcf}
.kq-game-opt:hover{background:#2a2a2a;border-color:#4a4a4a}
.kq-go-letter{background:transparent;border:1px solid #4a4a4a;color:#9a9a9a;border-radius:4px;width:26px;height:26px;font-size:13px}
.kq-game-opt.is-picked{border-color:#2dd4bf;background:#1d2d2a}
.kq-game-opt.is-picked .kq-go-letter{background:#2dd4bf;border-color:#2dd4bf;color:#062b26}
.kq-game-opt.is-right{border-color:#22c55e;background:#14251a}
.kq-game-opt.is-right .kq-go-letter{background:#22c55e;border-color:#22c55e;color:#06240f}
.kq-game-opt.is-right .kq-go-text{color:#bff5cf}
.kq-game-opt.is-wrong{border-color:#ef4444;background:#2a1717}
.kq-game-opt.is-wrong .kq-go-letter{background:#ef4444;border-color:#ef4444;color:#fff}
.kq-game-opt.is-muted{opacity:.55}
.kq-game-opt.is-focus{outline:2px solid rgba(45,212,191,.45);outline-offset:2px;box-shadow:none}
.kq-game-result{color:#cfcfcf}
.kq-res--ok{background:#16321f;color:#7ee2a8}
.kq-res--bad{background:#33191b;color:#ff9a9a}
.kq-game-explain{color:#b9b9b9;border-top:1px solid #343434;background:#1c241f;border-left:3px solid #22c55e;
  padding:12px 14px;border-radius:0 8px 8px 0}
.kq-game-sheet{background:#1f1f1f;border-color:#383838;box-shadow:none}
.kq-sheet-head{color:#d7d7d7}
.kq-sheet-cell{background:#232323;border-color:#3a3a3a;color:#bdbdbd}
.kq-sheet-cell:hover{border-color:#2dd4bf;color:#e8e8e8}
.kq-sheet-cell.is-right{background:#16321f;border-color:#22c55e;color:#7ee2a8}
.kq-sheet-cell.is-wrong{background:#33191b;border-color:#ef4444;color:#ff9a9a}
.kq-sheet-cell.is-now{box-shadow:0 0 0 2px #2dd4bf inset;color:#2dd4bf}
.kq-game-top .kq-btn{background:#2a2a2a;border-color:#3f3f3f;color:#d7d7d7}
.kq-game-top .kq-btn:hover{background:#333;border-color:#555;color:#fff}
.kq-sheet-head .kq-btn{background:#2a2a2a;border-color:#3f3f3f;color:#d7d7d7}
.kq-opt{background:#232323;border-color:#3a3a3a;color:#cfcfcf}
.kq-opt:hover{background:#2a2a2a;border-color:#4a4a4a}
.kq-letter{background:transparent;border:1px solid #4a4a4a;color:#9a9a9a;border-radius:4px}
.kq-opt.is-picked{border-color:#2dd4bf;background:#1d2d2a}
.kq-opt.is-right{border-color:#22c55e;background:#14251a}
.kq-opt.is-wrong{border-color:#ef4444;background:#2a1717}
.kq-cell{background:#232323;border-color:#3a3a3a;color:#bdbdbd}
.kq-cell.is-right{background:#16321f;border-color:#22c55e;color:#7ee2a8}
.kq-cell.is-wrong{background:#33191b;border-color:#ef4444;color:#ff9a9a}
.kq-cell.is-now{border-color:#2dd4bf;box-shadow:0 0 0 1px #2dd4bf}
.kq-bar{background:#333}
.kq-bar i{background:#2dd4bf}




/* 选项区域最终兜底：只用青/绿/红/中性灰 */
.kq-game-opt,.kq-opt{background:#232323!important;border-color:#3a3a3a!important;color:#cfcfcf!important}
.kq-game-opt:hover,.kq-opt:hover{background:#2a2a2a!important;border-color:#4a4a4a!important}
.kq-game-opt.is-picked,.kq-opt.is-picked{background:#1d2d2a!important;border-color:#2dd4bf!important}
.kq-game-opt.is-right,.kq-opt.is-right{background:#14251a!important;border-color:#22c55e!important}
.kq-game-opt.is-wrong,.kq-opt.is-wrong{background:#2a1717!important;border-color:#ef4444!important}
.kq-go-letter,.kq-letter{background:transparent!important;border-color:#4a4a4a!important;color:#9a9a9a!important}
.kq-game-opt.is-picked .kq-go-letter,.kq-opt.is-picked .kq-letter{background:#2dd4bf!important;border-color:#2dd4bf!important;color:#062b26!important}
.kq-game-opt.is-right .kq-go-letter,.kq-opt.is-right .kq-letter{background:#22c55e!important;border-color:#22c55e!important;color:#06240f!important}
.kq-game-opt.is-wrong .kq-go-letter,.kq-opt.is-wrong .kq-letter{background:#ef4444!important;border-color:#ef4444!important;color:#fff!important}
.kq-game-opt.is-focus{outline-color:rgba(45,212,191,.45)!important}
/* 主按钮：深青，不用亮青填充 */
.kq-btn--primary{background:#262626;border:1px solid #2dd4bf;color:#f2f2f2;font-weight:600}
.kq-btn--primary:hover{background:#303030;border-color:#5eead4;color:#fff}
.kq-btn--primary[disabled]{background:#212121;border-color:#3a3a3a;color:#7a7a7a}


.kq-urlrow{display:flex;gap:8px;margin-top:8px}
.kq-urlrow .kq-input{flex:1;min-width:0;background:#2a2a2a;border:1px solid #3f3f3f;border-radius:8px;
  color:#d7d7d7;padding:8px 10px;font:inherit;font-size:13px}
.kq-input:focus{outline:none;border-color:#2dd4bf}

`

  var SHELL =
    '<div class="kq-head">' +
    '  <div class="kq-headrow">' +
    '    <div class="kq-title">' +
    '      <span class="kq-logo">' +
    '        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
    '          <path d="M4 5.2c0-.6.5-1 1-1h5.1c.7 0 1.3.3 1.8.9l.2.2.2-.2c.5-.6 1.1-.9 1.8-.9H19c.6 0 1 .4 1 1v13.6c0 .6-.4 1-1 1h-5.6c-.6 0-1.2.2-1.6.7l-.2.2-.2-.2c-.4-.5-1-.7-1.6-.7H5c-.6 0-1-.4-1-1V5.2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' +
    '          <path d="M12 5.6v15" stroke="currentColor" stroke-width="1.2" opacity=".45"/>' +
    '        </svg>' +
    '      </span>' +
    '      <div class="kq-titles"><h1>考研政治刷题台</h1><p class="kq-sub" id="kq-bankinfo">正在加载题库…</p></div>' +
    '    </div>' +
    '    <div class="kq-headtools">' +
    '      <div class="kq-seg" role="group" aria-label="刷题模式">' +
    '        <button type="button" class="kq-segbtn" data-act="mode" data-mode="seq">顺序</button>' +
    '        <button type="button" class="kq-segbtn" data-act="mode" data-mode="random">随机</button>' +
    '      </div>' +
    '      <button type="button" class="kq-btn kq-btn--ghost kq-immbtn" data-act="immersive">⛶ 沉浸</button>' +
    '      <button type="button" class="kq-btn kq-btn--ghost" id="kq-today" data-act="tab" data-tab="stats">今日 0 / 30</button>' +
    '    </div>' +
    '  </div>' +
    '  <nav class="kq-tabs" id="kq-tabs"></nav>' +
    '</div>' +
    '<div class="kq-body" id="kq-body"><div class="kq-loading">正在加载题库与进度…</div></div>' +
    '<div class="kq-toast" id="kq-toast" role="status" aria-live="polite"></div>'

  /* ---------------------------------------------------------------- mount */

  function mount(host, opts) {
    opts = opts || {}
    var api = typeof opts.api === 'string' ? opts.api : DEFAULT_API

    var root = document.createElement('div')
    root.className = 'kq-root'
    root.tabIndex = -1
    root.innerHTML = SHELL
    host.appendChild(root)

    var styleEl = document.createElement('style')
    styleEl.setAttribute('data-kaoyan-quiz', '1')
    styleEl.textContent = CSS
    root.appendChild(styleEl)

    var bodyEl = root.querySelector('#kq-body')
    var tabsEl = root.querySelector('#kq-tabs')
    var toastEl = root.querySelector('#kq-toast')
    var bankInfoEl = root.querySelector('#kq-bankinfo')
    var todayEl = root.querySelector('#kq-today')

    var savedPaper = 'paper'
    try {
      var stored = window.localStorage.getItem('kaoyan-quiz:paper')
      if (stored) {
        savedPaper = stored
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        savedPaper = 'paper'
      } else {
        savedPaper = 'dark'
      }
    } catch (error) {
      savedPaper = 'dark'
    }

    var S = {
      ready: false,
      questions: [],
      byId: Object.create(null),
      subjects: [],
      meta: {},
      progress: blankProgress(),
      storage: 'remote',
      tab: 'practice',
      subject: '全部',
      chapter: '全部',
      qtype: 'all',
      immersive: false,
      gameMode: true,
      paper: savedPaper !== 'dark',
      game: { screen: 'menu', index: 0, picker: null, pickerIndex: 0, focus: 0, sheet: false },
      current: null,
      picked: [],
      graded: false,
      wrongMode: 'pending',
      bodyScroll: 0,
      saveTimer: 0,
      toastTimer: 0,
      disposed: false,
    }

    /* -------------------------------------------------------- persistence */

    function blankProgress() {
      return {
        version: VERSION,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        mode: 'seq',
        items: {},
        seqPos: 0,
        queue: { ids: [], pos: 0, subject: '全部', label: '' },
        settings: { autoRemoveWrong: true, dailyGoal: 30 },
        daily: {},
      }
    }

    function normalizeProgress(raw) {
      var p = blankProgress()
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return p
      p.createdAt = one(raw.createdAt) || Date.now()
      p.updatedAt = one(raw.updatedAt) || Date.now()
      p.mode = raw.mode === 'random' ? 'random' : 'seq'
      if (raw.items !== null && typeof raw.items === 'object' && !Array.isArray(raw.items)) {
        for (var id in raw.items) {
          if (!Object.prototype.hasOwnProperty.call(raw.items, id)) continue
          var item = raw.items[id]
          if (item === null || typeof item !== 'object') continue
          p.items[id] = {
            seen: one(item.seen),
            attempts: one(item.attempts),
            correct: one(item.correct),
            wrong: one(item.wrong),
            streak: one(item.streak),
            last: item.last === 'right' ? 'right' : item.last === 'wrong' ? 'wrong' : '',
            firstResult: item.firstResult === 'right' ? 'right' : item.firstResult === 'wrong' ? 'wrong' : '',
            lastPicked: Array.isArray(item.lastPicked) ? item.lastPicked.filter(function (x) { return typeof x === 'string' }) : [],
            firstAt: one(item.firstAt),
            lastAt: one(item.lastAt),
            mastered: item.mastered === true,
            starred: item.starred === true,
          }
        }
      }
      p.seqPos = Math.max(0, Math.floor(one(raw.seqPos)))
      var q = raw.queue
      if (q !== null && typeof q === 'object' && Array.isArray(q.ids)) {
        p.queue = {
          ids: q.ids.filter(function (x) { return typeof x === 'string' }),
          pos: Math.max(0, Math.floor(one(q.pos))),
          subject: typeof q.subject === 'string' ? q.subject : '全部',
          label: typeof q.label === 'string' ? q.label : '',
        }
      }
      var st = raw.settings
      if (st !== null && typeof st === 'object') {
        p.settings.autoRemoveWrong = st.autoRemoveWrong !== false
        p.settings.dailyGoal = Math.max(1, Math.floor(one(st.dailyGoal)) || 30)
      }
      if (raw.daily !== null && typeof raw.daily === 'object' && !Array.isArray(raw.daily)) {
        for (var key in raw.daily) {
          if (!Object.prototype.hasOwnProperty.call(raw.daily, key)) continue
          var d = raw.daily[key]
          if (d === null || typeof d !== 'object') continue
          p.daily[key] = { n: one(d.n), c: one(d.c) }
        }
      }
      return p
    }

    function readLocal() {
      try {
        var raw = window.localStorage.getItem(LS_STATE)
        return raw ? JSON.parse(raw) : null
      } catch (error) {
        return null
      }
    }

    function writeLocal() {
      try {
        window.localStorage.setItem(LS_STATE, JSON.stringify(S.progress))
      } catch (error) {
        /* 空间不足就算了，Host 那条路才是首选 */
      }
    }

    function saveLocal() {
      if (S.storage === 'local') writeLocal()
    }

    function flush() {
      if (S.disposed && S.storage !== 'remote') return Promise.resolve()
      S.progress.updatedAt = Date.now()
      if (S.storage !== 'remote') {
        writeLocal()
        return Promise.resolve()
      }
      var payload = JSON.stringify({ state: S.progress })
      return fetch(api + '/state', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
      })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status)
          writeLocal()
        })
        .catch(function (error) {
          S.storage = 'local'
          writeLocal()
          toast('Host 保存失败，进度暂存浏览器（重启可能丢失）：' + String((error && error.message) || error), 'bad')
          paint()
        })
    }

    function scheduleSave() {
      if (S.storage === 'local') {
        writeLocal()
        return
      }
      window.clearTimeout(S.saveTimer)
      S.saveTimer = window.setTimeout(function () {
        S.saveTimer = 0
        void flush()
      }, 320)
    }

    /* ---------------------------------------------------------------- load */

    function fetchJson(url, options) {
      return fetch(url, options).then(function (res) {
        if (!res.ok) throw new Error(url + ' → HTTP ' + res.status)
        return res.json()
      })
    }

    function normalizeQuestion(q, index) {
      if (q === null || typeof q !== 'object') return null
      var options = Array.isArray(q.options) ? q.options.filter(function (o) { return String(o || '').trim().length > 0 }) : []
      if (!q.stem || options.length < 2) return null
      var answers = Array.isArray(q.answer) ? q.answer : String(q.answer || '').toUpperCase().replace(/[^A-H]/g, '').split('')
      var letters = []
      for (var i = 0; i < answers.length; i += 1) {
        var letter = typeof answers[i] === 'number' ? LETTERS[answers[i]] : String(answers[i]).toUpperCase()
        if (/^[A-H]$/.test(letter) && LETTERS.indexOf(letter) < options.length && letters.indexOf(letter) < 0) letters.push(letter)
      }
      if (letters.length === 0) return null
      letters.sort()
      return {
        id: typeof q.id === 'string' && q.id ? q.id : 'q-' + index,
        subject: String(q.subject || '未分类'),
        chapter: String(q.chapter || ''),
        type: letters.length > 1 || q.type === 'multi' ? 'multi' : 'single',
        stem: String(q.stem),
        options: options.map(function (o) { return String(o) }),
        answer: letters,
        explain: String(q.explain || ''),
        source: String(q.source || ''),
      }
    }

    function load() {
      return Promise.all([
        fetchJson(api + '/bank').catch(function (error) {
          return { ok: false, error: String((error && error.message) || error), questions: [] }
        }),
        fetchJson(api + '/state').catch(function (error) {
          return { ok: false, error: String((error && error.message) || error), state: null }
        }),
      ]).then(function (results) {
        if (S.disposed) return
        var bank = results[0] || {}
        var stateResult = results[1] || {}

        var list = Array.isArray(bank.questions) ? bank.questions : []
        var questions = []
        for (var i = 0; i < list.length; i += 1) {
          var q = normalizeQuestion(list[i], i)
          if (q) questions.push(q)
        }
        S.questions = questions
        S.byId = Object.create(null)
        S.subjects = []
        for (var j = 0; j < questions.length; j += 1) {
          S.byId[questions[j].id] = questions[j]
          if (S.subjects.indexOf(questions[j].subject) < 0) S.subjects.push(questions[j].subject)
        }
        S.meta = bank.meta || {}

        var remoteOk = stateResult.ok !== false
        if (!remoteOk) S.storage = 'local'
        var localState = readLocal()
        var remoteState = remoteOk ? stateResult.state : null
        var rawState = remoteState
        try {
          var localN = localState && localState.items ? Object.keys(localState.items).length : 0
          var remoteN = remoteState && remoteState.items ? Object.keys(remoteState.items).length : 0
          if (localState && (!remoteState || (Number(localState.updatedAt) > Number(remoteState.updatedAt) && localN >= remoteN))) {
            rawState = localState
          }
        } catch (error) {
          rawState = remoteState
        }
        S.progress = normalizeProgress(rawState)
        if (rawState === localState && remoteOk) scheduleSave()
        if (!remoteOk) writeLocal()
        if (questions.length === 0) {
          S.ready = true
          S.tab = 'bank'
          paint()
          return
        }
        S.ready = true
        ensurePosition()
        var ui = readUi()
        if (ui && ui.gameMode === false) {
          S.gameMode = false
        } else if (ui && ui.screen === 'quiz') {
          S.game.screen = 'quiz'
          if (ui.current && S.byId[ui.current]) {
            if (S.progress.mode === 'random') {
              var qi = S.progress.queue.ids.indexOf(ui.current)
              if (qi >= 0) S.progress.queue.pos = qi
            } else {
              var pi = poolIds().indexOf(ui.current)
              if (pi >= 0) S.progress.seqPos = pi
            }
            ensurePosition()
          }
        }
        renderTabs()
        paint()
        if (S.storage === 'local') {
          toast('Host 路由不可用，进度只存在本浏览器', 'bad')
        }
        host.focus({ preventScroll: true })
      })
    }

    /* ------------------------------------------------------------ position */

    function scopeKey() {
      return S.subject + '|' + S.chapter + '|' + S.qtype
    }

    function chapterGroups() {
      var groups = []
      var index = {}
      for (var i = 0; i < S.questions.length; i += 1) {
        var q = S.questions[i]
        if (S.subject !== '全部' && q.subject !== S.subject) continue
        if (S.qtype !== 'all' && q.type !== S.qtype) continue
        var g = index[q.subject]
        if (!g) {
          g = index[q.subject] = { subject: q.subject, items: [] }
          groups.push(g)
        }
        var name = q.chapter || '未分章'
        var found = null
        for (var j = 0; j < g.items.length; j += 1) {
          if (g.items[j].name === name) {
            found = g.items[j]
            break
          }
        }
        if (!found) {
          found = { name: name, count: 0 }
          g.items.push(found)
        }
        found.count += 1
      }
      return groups
    }

    function poolIds() {
      var out = []
      for (var i = 0; i < S.questions.length; i += 1) {
        var q = S.questions[i]
        if (S.subject !== '全部' && q.subject !== S.subject) continue
        if (S.chapter !== '全部' && (q.chapter || '未分章') !== S.chapter) continue
        if (S.qtype !== 'all' && q.type !== S.qtype) continue
        out.push(q.id)
      }
      return out
    }

    function orderIds() {
      if (!S.progress) return []
      if (S.progress.mode === 'random') return S.progress.queue.ids
      return poolIds()
    }

    function seedQueue(ids, startId) {
      var arr = shuffle(ids.slice())
      var at = startId ? arr.indexOf(startId) : -1
      if (at > 0) {
        arr.splice(at, 1)
        arr.unshift(startId)
      }
      S.progress.queue = { ids: arr, pos: 0, subject: S.subject, label: '', scope: scopeKey() }
      scheduleSave()
    }

    function ensurePosition() {
      if (!S.questions.length) {
        S.current = null
        return
      }
      var p = S.progress
      var pool = poolIds()
      if (!pool.length) {
        S.current = null
        return
      }
      var previous = S.current

      if (p.mode === 'random') {
        var qu = p.queue || (p.queue = { ids: [], pos: 0, subject: S.subject, label: '' })
        var valid = qu.ids.length > 0 && qu.ids.every(function (id) { return Boolean(S.byId[id]) })
        if (!valid || (!qu.label && (qu.subject !== S.subject || qu.scope !== scopeKey()))) {
          seedQueue(pool, previous)
          qu = p.queue
        }
        if (qu.pos >= qu.ids.length) {
          if (qu.label) {
            var finished = qu.label
            qu.label = ''
            qu.ids = []
            toast('「' + finished + '」已刷完')
            seedQueue(pool, null)
            qu = p.queue
          } else {
            seedQueue(pool, null)
            qu = p.queue
          }
        }
        S.current = qu.ids[qu.pos] || pool[0]
      } else {
        if (p.seqPos >= pool.length) p.seqPos = 0
        if (p.seqPos < 0) p.seqPos = 0
        S.current = pool[p.seqPos] || pool[0]
      }

      if (!S.byId[S.current]) S.current = pool[0]
      if (S.current !== previous) {
        S.picked = []
        S.graded = false
        if (S.game) S.game.focus = 0
      }
    }

    function currentQuestion() {
      return S.current ? S.byId[S.current] || null : null
    }

    function currentIndex() {
      if (S.progress.mode === 'random') return S.progress.queue.pos
      return S.progress.seqPos
    }

    function saveUi() {
      try {
        window.localStorage.setItem('kaoyan-quiz:ui', JSON.stringify({
          gameMode: S.gameMode,
          screen: S.game.screen,
          current: S.current,
        }))
      } catch (error) {
        /* 忽略 */
      }
    }

    function readUi() {
      try {
        return JSON.parse(window.localStorage.getItem('kaoyan-quiz:ui') || 'null')
      } catch (error) {
        return null
      }
    }

    function itemOf(id) {
      return S.progress.items[id] || null
    }

    /* ------------------------------------------------------------- writing */

    function record(q, picked, correct) {
      var p = S.progress
      var now = Date.now()
      var it = p.items[q.id]
      if (!it) {
        it = { seen: 0, attempts: 0, correct: 0, wrong: 0, streak: 0, last: '', firstResult: '', lastPicked: [], firstAt: now, lastAt: 0, mastered: false, starred: false }
        p.items[q.id] = it
      }
      it.seen += 1
      it.attempts += 1
      if (!it.firstResult) it.firstResult = correct ? 'right' : 'wrong'
      if (correct) {
        it.correct += 1
        it.streak += 1
        it.last = 'right'
      } else {
        it.wrong += 1
        it.streak = 0
        it.last = 'wrong'
      }
      it.mastered = it.streak >= 2
      it.lastPicked = picked.slice()
      it.lastAt = now
      if (!it.firstAt) it.firstAt = now

      var key = dayKey()
      var d = p.daily[key] || (p.daily[key] = { n: 0, c: 0 })
      d.n += 1
      if (correct) d.c += 1
      pruneDaily()
      p.updatedAt = now
    }

    function pruneDaily() {
      var keys = Object.keys(S.progress.daily).sort()
      while (keys.length > 90) {
        delete S.progress.daily[keys.shift()]
      }
    }

    function grade() {
      var q = currentQuestion()
      if (!q || S.graded || S.picked.length === 0) return
      var correct = sameSet(S.picked, q.answer)
      record(q, S.picked, correct)
      S.graded = true
      scheduleSave()
      void flush()
      paint()
    }

    function choose(letter) {
      if (S.graded) return
      var q = currentQuestion()
      if (!q) return
      if (S.game) S.game.focus = Math.max(0, LETTERS.indexOf(letter))
      if (q.type === 'multi') {
        var at = S.picked.indexOf(letter)
        if (at >= 0) S.picked.splice(at, 1)
        else S.picked.push(letter)
        S.picked.sort()
        paint()
        return
      }
      S.picked = [letter]
      grade()
    }

    function retry() {
      S.picked = []
      S.graded = false
      paint()
    }

    function move(delta) {
      var p = S.progress
      S.picked = []
      S.graded = false
      if (p.mode === 'random') {
        p.queue.pos += delta
        if (p.queue.pos < 0) p.queue.pos = 0
      } else {
        var pool = poolIds()
        p.seqPos += delta
        if (p.seqPos < 0) p.seqPos = pool.length - 1
        if (p.seqPos >= pool.length) p.seqPos = 0
      }
      ensurePosition()
      scheduleSave()
      void flush()
      paint()
    }

    function jump(index) {
      var p = S.progress
      S.picked = []
      S.graded = false
      if (p.mode === 'random') p.queue.pos = Math.max(0, Math.min(index, p.queue.ids.length - 1))
      else p.seqPos = Math.max(0, Math.min(index, poolIds().length - 1))
      ensurePosition()
      scheduleSave()
      paint()
    }

    function setMode(mode) {
      if (mode !== 'seq' && mode !== 'random') return
      var p = S.progress
      if (p.mode === mode) return
      p.mode = mode
      if (mode === 'random') {
        seedQueue(poolIds(), S.current)
        ensurePosition()
      } else {
        var pool = poolIds()
        var at = pool.indexOf(S.current)
        p.seqPos = at >= 0 ? at : 0
      }
      S.picked = []
      S.graded = false
      scheduleSave()
      paint()
    }

    function reseedScope() {
      var p = S.progress
      if (p.mode === 'random') {
        seedQueue(poolIds(), null)
        ensurePosition()
      } else {
        var pool = poolIds()
        var firstNew = 0
        for (var i = 0; i < pool.length; i += 1) {
          if (!itemOf(pool[i])) {
            firstNew = i
            break
          }
        }
        p.seqPos = firstNew
      }
      S.picked = []
      S.graded = false
      ensurePosition()
      scheduleSave()
      paint()
    }

    function setSubject(subject) {
      if (subject === S.subject) return
      S.subject = subject
      S.chapter = '全部'
      reseedScope()
    }

    function setChapter(chapter) {
      if (chapter === S.chapter) return
      S.chapter = chapter
      reseedScope()
    }

    function setQtype(type) {
      if (type !== 'all' && type !== 'single' && type !== 'multi') return
      if (type === S.qtype) return
      S.qtype = type
      reseedScope()
    }

    function resetFilters() {
      S.subject = '全部'
      S.chapter = '全部'
      S.qtype = 'all'
      reseedScope()
    }

    function setImmersive(on) {
      S.immersive = Boolean(on)
      if (S.immersive) {
        S.gameMode = true
        S.game = { screen: 'menu', index: 0, picker: null, pickerIndex: 0, focus: 0, sheet: false }
      }
      root.classList.toggle('is-immersive', S.immersive)
      document.documentElement.classList.toggle('kq-immersive-lock', S.immersive)
      try {
        if (S.immersive) {
          if (!document.fullscreenElement && root.requestFullscreen) {
            var entered = root.requestFullscreen()
            if (entered && entered.catch) entered.catch(function () {})
          }
          root.focus({ preventScroll: true })
        } else if (document.fullscreenElement && document.exitFullscreen) {
          var left = document.exitFullscreen()
          if (left && left.catch) left.catch(function () {})
        }
      } catch (error) {
        /* 全屏被浏览器拒绝时，仍然保留页面内的沉浸层 */
      }
      paint()
    }

    function startBatch(ids, label) {
      if (!ids.length) return
      S.subject = '全部'
      S.chapter = '全部'
      S.qtype = 'all'
      S.progress.mode = 'random'
      S.progress.queue = { ids: shuffle(ids.slice()), pos: 0, subject: S.subject, label: label }
      S.tab = 'practice'
      S.picked = []
      S.graded = false
      ensurePosition()
      scheduleSave()
      paint()
    }

    function toggleStar() {
      var q = currentQuestion()
      if (!q) return
      var it = S.progress.items[q.id]
      if (!it) {
        it = { seen: 0, attempts: 0, correct: 0, wrong: 0, streak: 0, last: '', firstResult: '', lastPicked: [], firstAt: 0, lastAt: 0, mastered: false, starred: false }
        S.progress.items[q.id] = it
      }
      it.starred = !it.starred
      scheduleSave()
      paint()
    }

    function starOf(id) {
      var q = S.byId[id]
      var it = itemOf(id)
      return Boolean(it && it.starred && q)
    }

    function wrongIds(mode) {
      var out = []
      var autoRemove = S.progress.settings.autoRemoveWrong
      for (var i = 0; i < S.questions.length; i += 1) {
        var q = S.questions[i]
        var it = itemOf(q.id)
        if (!it || !it.wrong) continue
        if (mode === 'all') out.push(q.id)
        else if (it.last !== 'right' || !autoRemove) out.push(q.id)
      }
      return out
    }

    function starredIds() {
      var out = []
      for (var i = 0; i < S.questions.length; i += 1) {
        if (starOf(S.questions[i].id)) out.push(S.questions[i].id)
      }
      return out
    }

    /* -------------------------------------------------------------- render */

    function toast(message, kind) {
      if (!toastEl) return
      toastEl.textContent = message
      toastEl.className = 'kq-toast is-on' + (kind === 'bad' ? ' is-bad' : kind === 'ok' ? ' is-ok' : '')
      window.clearTimeout(S.toastTimer)
      S.toastTimer = window.setTimeout(function () {
        toastEl.className = 'kq-toast'
      }, 2800)
    }

    function renderTabs() {
      var html = ''
      for (var i = 0; i < TABS.length; i += 1) {
        var tab = TABS[i]
        var badge = ''
        if (tab.count === 'wrong') badge = '<span class="kq-tabn" id="kq-tab-wrong">0</span>'
        if (tab.count === 'star') badge = '<span class="kq-tabn" id="kq-tab-star">0</span>'
        html +=
          '<button type="button" class="kq-tab" data-act="tab" data-tab="' + tab.id + '">' + esc(tab.label) + badge + '</button>'
      }
      tabsEl.innerHTML = html
    }

    function syncHeader() {
      var tabs = tabsEl.querySelectorAll('.kq-tab')
      for (var i = 0; i < tabs.length; i += 1) {
        tabs[i].classList.toggle('is-on', tabs[i].getAttribute('data-tab') === S.tab)
      }
      var modes = root.querySelectorAll('.kq-segbtn')
      for (var j = 0; j < modes.length; j += 1) {
        modes[j].classList.toggle('is-on', modes[j].getAttribute('data-mode') === S.progress.mode)
        modes[j].setAttribute('aria-pressed', modes[j].getAttribute('data-mode') === S.progress.mode ? 'true' : 'false')
      }
      var imm = root.querySelector('.kq-immbtn')
      if (imm) imm.textContent = S.immersive ? '✕ 退出沉浸' : '⛶ 沉浸'
      root.classList.toggle('is-immersive', S.immersive === true)
      var meta = S.meta || {}
      var bits = []
      bits.push('共 <b>' + S.questions.length + '</b> 题')
      if (meta.builtin) bits.push('内置 ' + meta.builtin)
      if (meta.custom) bits.push('导入 ' + meta.custom)
      bits.push(S.storage === 'remote' ? '进度存在本机 DSH 目录' : '进度仅存本页浏览器')
      bits.push('v' + UI_VERSION)
      bankInfoEl.innerHTML = bits.join(' · ')
      var wrong = wrongIds('pending').length
      var today = S.progress.daily[dayKey()] || { n: 0 }
      var goal = S.progress.settings.dailyGoal || 30
      if (todayEl) todayEl.textContent = '今日 ' + today.n + ' / ' + goal
      var wc = root.querySelector('#kq-tab-wrong')
      if (wc) wc.textContent = String(wrong)
      var sc = root.querySelector('#kq-tab-star')
      if (sc) sc.textContent = String(starredIds().length)
    }

    function paint() {
      if (!root.isConnected && root.parentNode === null && S.disposed) return
      if (!S.ready) {
        bodyEl.innerHTML = '<div class="kq-loading">正在加载题库与进度…</div>'
        return
      }
      if (S.tab === 'practice') ensurePosition()
      syncHeader()
      var scroll = S.immersive ? 0 : bodyEl.scrollTop
      var hadFocus = root.contains(document.activeElement) || document.activeElement === document.body
      if (S.ready) saveUi()
      bodyEl.innerHTML = renderView()
      bodyEl.scrollTop = scroll
      if (S.immersive) {
        var currentRow = bodyEl.querySelector('.kq-menu-item.is-on, .kq-pick-row.is-on')
        if (currentRow && currentRow.scrollIntoView) currentRow.scrollIntoView({ block: 'nearest' })
      }
      if (hadFocus && S.tab === 'practice') root.focus({ preventScroll: true })
    }

    function renderView() {
      if (!S.questions.length) {
        return (
          '<div class="kq-empty"><b>题库是空的</b>' +
          '到「题库与设置」里导入一份题库 JSON，或检查内置 bank.json。<br>' +
          '<button type="button" class="kq-btn kq-btn--primary" style="margin-top:14px" data-act="tab" data-tab="bank">去导入题库</button></div>'
        )
      }
      if (S.gameMode && S.tab === 'practice') {
        if (S.game.picker) return viewGamePicker()
        if (S.game.screen === 'quiz' && S.game.sheet) return viewGameSheet()
        return S.game.screen === 'menu' ? viewGameMenu() : viewGameQuiz()
      }
      if (S.tab === 'wrong') return viewListing('wrong')
      if (S.tab === 'star') return viewListing('star')
      if (S.tab === 'stats') return viewStats()
      if (S.tab === 'bank') return viewBank()
      return viewPractice()
    }

    function subjectChips() {
      var subjects = ['全部'].concat(S.subjects)
      var html = ''
      for (var i = 0; i < subjects.length; i += 1) {
        var name = subjects[i]
        html +=
          '<button type="button" class="kq-filter' + (S.subject === name ? ' is-on' : '') + '" data-act="subject" data-subject="' +
          esc(name) + '">' + esc(name) + '</button>'
      }
      return '<div class="kq-filters">' + html + '</div>'
    }

    function scopeText() {
      var bits = [S.progress.mode === 'random' ? '随机' : '顺序']
      if (S.subject !== '全部') bits.push(S.subject)
      if (S.chapter !== '全部') bits.push(S.chapter)
      if (S.qtype !== 'all') bits.push(S.qtype === 'single' ? '单选' : '多选')
      bits.push('共 ' + poolIds().length + ' 题')
      return bits.join(' · ')
    }

    function scopeBar() {
      var groups = chapterGroups()
      var total = 0
      for (var gi = 0; gi < groups.length; gi += 1) {
        for (var ii = 0; ii < groups[gi].items.length; ii += 1) total += groups[gi].items[ii].count
      }
      var opts = '<option value="全部"' + (S.chapter === '全部' ? ' selected' : '') + '>全部章节（' + total + ' 题）</option>'
      for (var g = 0; g < groups.length; g += 1) {
        var group = groups[g]
        if (groups.length > 1) opts += '<optgroup label="' + esc(group.subject) + '">'
        for (var i = 0; i < group.items.length; i += 1) {
          var item = group.items[i]
          var value = group.subject + '||' + item.name
          var on = S.chapter === item.name && (S.subject === group.subject || S.subject === '全部')
          opts += '<option value="' + esc(value) + '"' + (on ? ' selected' : '') + '>' + esc(item.name) + '（' + item.count + '）</option>'
        }
        if (groups.length > 1) opts += '</optgroup>'
      }
      var types = [['all', '全部题型'], ['single', '单选'], ['multi', '多选']]
      var chips = ''
      for (var j = 0; j < types.length; j += 1) {
        chips += '<button type="button" class="kq-filter' + (S.qtype === types[j][0] ? ' is-on' : '') + '" data-act="qtype" data-qtype="' + types[j][0] + '">' + types[j][1] + '</button>'
      }
      return (
        '<div class="kq-scopebar">' +
        subjectChips() +
        '<select class="kq-select" data-act="chapter" aria-label="选择章节">' + opts + '</select>' +
        '<div class="kq-filters">' + chips + '</div>' +
        '<span class="kq-hint kq-scopeinfo">' + esc(scopeText()) + '</span>' +
        '<button type="button" class="kq-btn kq-btn--ghost" data-act="immersive">' + (S.immersive ? '✕ 退出沉浸' : '⛶ 沉浸刷题') + '</button>' +
        '</div>'
      )
    }

    function menuEntries() {
      var pool = poolIds()
      var wrong = wrongIds('pending').length
      var stars = starredIds().length
      var chapterCount = 0
      var groups = chapterGroups()
      for (var g = 0; g < groups.length; g += 1) chapterCount += groups[g].items.length
      var list = orderIds()
      var index = currentIndex()
      return [
        { id: 'resume', title: '继续刷题', desc: (S.progress.mode === 'random' ? '随机' : '顺序') + ' · 第 ' + (index + 1) + ' / ' + (list.length || 1) + ' 题' },
        { id: 'seq', title: '顺序刷题', desc: pool.length + ' 题' },
        { id: 'random', title: '随机刷题', desc: pool.length + ' 题' },
        { id: 'chapter', title: '按章节刷', desc: chapterCount + ' 章' },
        { id: 'wrong', title: '错题重刷', desc: wrong + ' 题' },
        { id: 'star', title: '收藏重刷', desc: stars + ' 题' },
        { id: 'exit', title: '退出游戏视图', desc: '经典界面 · Esc' },
      ]
    }

    function viewGameMenu() {
      var items = menuEntries()
      var rows = ''
      for (var i = 0; i < items.length; i += 1) {
        rows +=
          '<button type="button" class="kq-menu-item' + (i === S.game.index ? ' is-on' : '') + '" data-act="game-menu" data-id="' + items[i].id + '" data-i="' + i + '">' +
          '<span class="kq-mi-num">' + (i + 1) + '</span>' +
          '<span class="kq-mi-title">' + esc(items[i].title) + '</span>' +
          '<span class="kq-mi-desc">' + esc(items[i].desc) + '</span>' +
          '</button>'
      }
      var modeText = S.progress.mode === 'random' ? '随机' : '顺序'
      return (
        '<div class="kq-game">' +
        '<div class="kq-game-mark">2027</div>' +
        '<h2 class="kq-game-title">考研政治 · 刷题</h2>' +
        '<p class="kq-game-sub">共 ' + S.questions.length + ' 题 · 当前' + modeText + '模式 · ' + esc(S.subject) + '</p>' +
        '<div class="kq-menu" role="menu">' + rows + '</div>' +
        '<div class="kq-game-foot">↑ ↓ 选择 · Enter 进入 · Esc 退出游戏视图 · v' + UI_VERSION + '</div>' +
        '</div>'
      )
    }

    function pickerItems() {
      var out = [{ subject: null, name: '全部章节', count: 0 }]
      var total = 0
      var groups = chapterGroups()
      for (var g = 0; g < groups.length; g += 1) {
        for (var i = 0; i < groups[g].items.length; i += 1) {
          var it = groups[g].items[i]
          total += it.count
          out.push({ subject: groups[g].subject, name: it.name, count: it.count })
        }
      }
      out[0].count = total
      return out
    }

    function viewGamePicker() {
      var items = pickerItems()
      var rows = ''
      for (var i = 0; i < items.length; i += 1) {
        var it = items[i]
        rows +=
          '<button type="button" class="kq-pick-row' + (i === S.game.pickerIndex ? ' is-on' : '') + '" data-act="game-pick" data-i="' + i + '">' +
          '<span class="kq-pick-name">' + esc(it.name) + '</span>' +
          '<span class="kq-pick-meta">' + (it.subject ? esc(it.subject) + ' · ' : '') + it.count + ' 题</span>' +
          '</button>'
      }
      return (
        '<div class="kq-game">' +
        '<h2 class="kq-game-title">按章节刷</h2>' +
        '<p class="kq-game-sub">选一章开始 · 共 ' + (items.length - 1) + ' 章</p>' +
        '<div class="kq-menu kq-picker" role="menu">' + rows + '</div>' +
        '<div class="kq-game-foot">↑ ↓ 选择 · Enter 开始 · Esc 返回</div>' +
        '</div>'
      )
    }

    function pickChapter(index) {
      var items = pickerItems()
      var item = items[index]
      if (!item) {
        S.progress.mode = 'seq'
        S.chapter = '全部'
      } else {
        S.progress.mode = 'seq'
        S.subject = item.subject
        S.chapter = item.name
      }
      S.game.picker = null
      S.game.screen = 'quiz'
      S.game.index = 0
      reseedScope()
    }

    function viewGameQuiz() {
      var q = currentQuestion()
      if (!q) {
        return '<div class="kq-game"><div class="kq-empty"><b>这个范围里没有题目</b>' +
          '<br><button type="button" class="kq-btn" style="margin-top:14px" data-act="game-menu" data-id="back">返回菜单</button></div></div>'
      }
      var list = orderIds()
      var index = currentIndex()
      var total = list.length || 1
      var done = 0
      for (var d = 0; d < list.length; d += 1) if (itemOf(list[d])) done += 1
      var it = itemOf(q.id)
      var modeText = S.progress.mode === 'random' ? '随机' : '顺序'

      var options = ''
      for (var i = 0; i < q.options.length; i += 1) {
        var letter = LETTERS[i]
        var picked = S.picked.indexOf(letter) >= 0
        var right = q.answer.indexOf(letter) >= 0
        var cls = 'kq-game-opt'
        var mark = ''
        if (S.graded) {
          if (right) {
            cls += ' is-right'
            mark = '<span class="kq-go-mark">正确</span>'
          } else if (picked) {
            cls += ' is-wrong'
            mark = '<span class="kq-go-mark">错选</span>'
          } else {
            cls += ' is-muted'
          }
        } else if (picked) {
          cls += ' is-picked'
        }
        if (!S.graded && i === S.game.focus) cls += ' is-focus'
        options +=
          '<button type="button" class="' + cls + '" data-act="opt" data-opt="' + letter + '">' +
          '<span class="kq-go-letter">' + letter + '</span>' +
          '<span class="kq-go-text">' + esc(q.options[i]) + '</span>' + mark +
          '</button>'
      }

      var submitBar = ''
      if (!S.graded && q.type === 'multi') {
        submitBar =
          '<div class="kq-game-submit">' +
          '<button type="button" class="kq-btn kq-btn--primary" data-act="submit"' + (S.picked.length ? '' : ' disabled') + '>提交答案 <span class="kq-kbd">Shift</span>+<span class="kq-kbd">Enter</span></button>' +
          '<span class="kq-hint">已选 ' + S.picked.length + ' 项 · ↑↓ 移动 · Enter 勾选</span>' +
          '</div>'
      }

      var result = ''
      if (S.graded) {
        var ok = sameSet(S.picked, q.answer)
        result =
          '<div class="kq-game-result">' +
          '<span class="kq-res ' + (ok ? 'kq-res--ok' : 'kq-res--bad') + '">' + (ok ? '回答正确' : '回答错误') + '</span>' +
          '<span>正确答案 <b>' + lettersOf(q.answer) + '</b></span>' +
          '<span>你的选择 <b>' + lettersOf(S.picked.slice().sort()) + '</b></span>' +
          '<span class="kq-spacer"></span>' +
          '<button type="button" class="kq-btn" data-act="star">' + (it && it.starred ? '★ 已收藏' : '☆ 收藏') + '</button>' +
          '</div>' +
          '<div class="kq-game-explain">' + (q.explain ? esc(q.explain) : '（这道题没有写解析）') + '</div>'
      }

      var hint = S.graded
        ? 'Enter 下一题 · ← → 翻题 · Esc 菜单'
        : (q.type === 'multi'
          ? '↑↓ 移动 · Enter 勾选 · Shift+Enter 提交 · Esc 菜单'
          : '↑↓ 移动 · Enter 确认 · A–D 也可直选 · Esc 菜单')

      return (
        '<div class="kq-game kq-game--quiz">' +
        '<div class="kq-game-quiz">' +
        '<div class="kq-game-top">' +
        '<span class="kq-gt-count">' + (index + 1) + ' / ' + total + '</span>' +
        '<div class="kq-game-bar"><i style="width:' + pct(done, total) + '"></i></div>' +
        '<span class="kq-gt-meta">' + esc(q.subject) + (q.chapter ? ' · ' + esc(q.chapter) : '') + ' · ' + modeText + '</span>' +
        '<button type="button" class="kq-btn kq-btn--ghost" data-act="game-sheet">题卡 Tab</button>' +
        '<button type="button" class="kq-btn kq-btn--ghost" data-act="game-menu" data-id="back">菜单 Esc</button>' +
        '</div>' +
        '<div class="kq-game-tags">' +
        '<span class="kq-chip kq-chip--subject">' + esc(q.subject) + '</span>' +
        '<span class="kq-chip' + (q.type === 'multi' ? ' kq-chip--multi' : '') + '">' + typeLabel(q) + '</span>' +
        (it && it.last === 'wrong' ? '<span class="kq-chip">上次答错</span>' : '') +
        '</div>' +
        '<div class="kq-game-stem">' + esc(q.stem) + '</div>' +
        '<div class="kq-game-opts">' + options + '</div>' +
        submitBar +
        result +
        '<div class="kq-game-nav">' +
        '<button type="button" class="kq-btn" data-act="prev">上一题</button>' +
        '<button type="button" class="kq-btn" data-act="next">下一题</button>' +
        '<span class="kq-nav-info">还剩 ' + Math.max(0, total - index - 1) + ' 题 · Enter 下一题 · Esc 菜单</span>' +
        '</div>' +
        '</div></div>'
      )
    }

    function viewGameSheet() {
      var list = orderIds()
      var index = currentIndex()
      var done = 0
      var cells = ''
      for (var i = 0; i < list.length; i += 1) {
        var it = itemOf(list[i])
        var cls = 'kq-sheet-cell'
        if (it) {
          if (it.last === 'right') cls += ' is-right'
          else if (it.last === 'wrong') cls += ' is-wrong'
          if (it.starred) cls += ' is-star'
          done += 1
        }
        if (i === index) cls += ' is-now'
        cells += '<button type="button" class="' + cls + '" data-act="game-jump" data-i="' + i + '">' + (i + 1) + '</button>'
      }
      return (
        '<div class="kq-game kq-game--quiz">' +
        '<div class="kq-game-sheet">' +
        '<div class="kq-sheet-head">' +
        '<button type="button" class="kq-btn" data-act="game-sheet-close">← 返回题目</button>' +
        '<b>答题卡</b>' +
        '<span class="kq-hint">' + (S.progress.mode === 'random' ? '随机' : '顺序') + ' · 已做 ' + done + ' / ' + list.length + ' 题</span>' +
        '<span class="kq-spacer"></span>' +
        '<span class="kq-hint">点题号跳转 · Esc 关闭</span>' +
        '</div>' +
        '<div class="kq-sheet-grid">' + cells + '</div>' +
        '</div></div>'
      )
    }

    function runMenu(id) {
      if (id === 'back') {
        S.game.screen = 'menu'
        S.game.picker = null
        paint()
        return
      }
      if (id === 'resume') {
        S.game.screen = 'quiz'
        paint()
        return
      }
      if (id === 'seq') {
        setMode('seq')
        S.game.screen = 'quiz'
        paint()
        return
      }
      if (id === 'random') {
        setMode('random')
        S.game.screen = 'quiz'
        paint()
        return
      }
      if (id === 'chapter') {
        S.game.picker = 'chapter'
        S.game.pickerIndex = 0
        paint()
        return
      }
      if (id === 'wrong') {
        var wrong = wrongIds('pending')
        if (!wrong.length) {
          toast('错题本还是空的，先去刷几道吧', 'bad')
          return
        }
        startBatch(wrong, '错题重刷')
        S.game.screen = 'quiz'
        paint()
        return
      }
      if (id === 'star') {
        var stars = starredIds()
        if (!stars.length) {
          toast('还没有收藏的题', 'bad')
          return
        }
        startBatch(stars, '收藏重刷')
        S.game.screen = 'quiz'
        paint()
        return
      }
      if (id === 'exit') {
        setImmersive(false)
        S.gameMode = false
        paint()
      }
    }

    function gameKey(event) {
      var key = event.key
      if (S.game.sheet) {
        if (key === 'Escape' || key === 'Tab') {
          event.preventDefault()
          S.game.sheet = false
          paint()
        }
        return true
      }
      if (key === 'Tab' && S.game.screen === 'quiz') {
        event.preventDefault()
        S.game.sheet = true
        paint()
        return true
      }
      if (S.game.picker) {
        var total = pickerItems().length
        if (key === 'ArrowDown') {
          S.game.pickerIndex = (S.game.pickerIndex + 1) % total
          event.preventDefault()
          paint()
          return true
        }
        if (key === 'ArrowUp') {
          S.game.pickerIndex = (S.game.pickerIndex - 1 + total) % total
          event.preventDefault()
          paint()
          return true
        }
        if (key === 'Enter') {
          event.preventDefault()
          pickChapter(S.game.pickerIndex)
          return true
        }
        if (key === 'Escape') {
          event.preventDefault()
          S.game.picker = null
          paint()
          return true
        }
        return true
      }
      if (S.game.screen === 'menu') {
        var n = menuEntries().length
        if (key === 'ArrowDown') {
          S.game.index = (S.game.index + 1) % n
          event.preventDefault()
          paint()
          return true
        }
        if (key === 'ArrowUp') {
          S.game.index = (S.game.index - 1 + n) % n
          event.preventDefault()
          paint()
          return true
        }
        if (key === 'Enter') {
          event.preventDefault()
          runMenu(menuEntries()[S.game.index].id)
          return true
        }
        if (key === 'Escape') {
          event.preventDefault()
          setImmersive(false)
          S.gameMode = false
          paint()
          return true
        }
        if (/^[1-7]$/.test(key)) {
          event.preventDefault()
          runMenu(menuEntries()[Number(key) - 1].id)
          return true
        }
        return true
      }
      var q = currentQuestion()
      if ((key === 'ArrowDown' || key === 'ArrowUp') && !S.graded && q) {
        var size = q.options.length || 1
        var step = key === 'ArrowDown' ? 1 : -1
        S.game.focus = ((S.game.focus || 0) + step + size) % size
        event.preventDefault()
        paint()
        return true
      }
      if (key === 'Enter' && !S.graded && q) {
        event.preventDefault()
        if (q.type === 'multi' && (event.shiftKey || event.ctrlKey || event.metaKey)) {
          grade()
          return true
        }
        choose(LETTERS[S.game.focus || 0] || 'A')
        return true
      }
      if (key === 'Escape') {
        event.preventDefault()
        S.game.screen = 'menu'
        S.game.picker = null
        paint()
        return true
      }
      return false
    }

    function viewPractice() {
      var q = currentQuestion()
      if (!q) {
        return '<div class="kq-empty"><b>当前筛选下没有题目</b>换个科目 / 章节 / 题型，或者重置筛选。' +
          '<br><button type="button" class="kq-btn kq-btn--primary" style="margin-top:14px" data-act="reset-filters">重置筛选</button></div>'
      }
      var it = itemOf(q.id)
      var list = orderIds()
      var index = currentIndex()
      var total = list.length || 1
      var modeText = S.progress.mode === 'random' ? '随机' : '顺序'
      var queueLabel = S.progress.mode === 'random' ? S.progress.queue.label : ''

      var status = '未做'
      if (it) {
        if (it.last === 'right') status = '上次答对'
        else if (it.last === 'wrong') status = '上次答错'
        if (it.wrong) status += ' · 累计错 ' + it.wrong + ' 次'
        if (it.streak >= 2) status += ' · 已掌握'
      }

      var head =
        '<div class="kq-qhead">' +
        '<span class="kq-chip kq-chip--subject">' + esc(q.subject) + '</span>' +
        '<span class="kq-chip' + (q.type === 'multi' ? ' kq-chip--multi' : '') + '">' + typeLabel(q) + '</span>' +
        (q.chapter ? '<span>' + esc(q.chapter) + '</span>' : '') +
        '<span class="kq-qstate">' + esc(status) + '</span>' +
        '<span class="kq-qmeta">' + (index + 1) + ' / ' + total + (queueLabel ? ' · ' + esc(queueLabel) : '') + '</span>' +
        '</div>'

      var options = ''
      for (var i = 0; i < q.options.length; i += 1) {
        var letter = LETTERS[i]
        var picked = S.picked.indexOf(letter) >= 0
        var right = q.answer.indexOf(letter) >= 0
        var cls = 'kq-opt'
        var mark = ''
        if (S.graded) {
          if (right) {
            cls += ' is-right'
            mark = '<span class="kq-mark">✓ 正确</span>'
          } else if (picked) {
            cls += ' is-wrong'
            mark = '<span class="kq-mark">✕ 错选</span>'
          } else {
            cls += ' is-muted'
          }
        } else if (picked) {
          cls += ' is-picked'
        }
        options +=
          '<button type="button" class="' + cls + '" data-act="opt" data-opt="' + letter + '">' +
          '<span class="kq-letter">' + letter + '</span>' +
          '<span class="kq-otext">' + esc(q.options[i]) + '</span>' + mark +
          '</button>'
      }

      var actions = ''
      if (!S.graded) {
        if (q.type === 'multi') {
          actions =
            '<button type="button" class="kq-btn kq-btn--primary" data-act="submit"' + (S.picked.length ? '' : ' disabled') + '>提交答案</button>' +
            '<span class="kq-hint">多选已选 ' + S.picked.length + ' 项 · <span class="kq-kbd">1</span>–<span class="kq-kbd">4</span> 选择，<span class="kq-kbd">Enter</span> 提交</span>'
        } else {
          actions = '<span class="kq-hint">点选项即判分 · <span class="kq-kbd">1</span>–<span class="kq-kbd">4</span> 选择，<span class="kq-kbd">→</span> 下一题</span>'
        }
      } else {
        actions =
          '<button type="button" class="kq-btn kq-btn--primary" data-act="next">下一题 <span class="kq-kbd">→</span></button>' +
          '<button type="button" class="kq-btn" data-act="retry">再答一次</button>' +
          '<button type="button" class="kq-btn kq-btn--ghost" data-act="star">' + (it && it.starred ? '★ 已收藏' : '☆ 收藏') + '</button>' +
          '<span class="kq-spacer"></span>' +
          '<button type="button" class="kq-btn kq-btn--ghost" data-act="prev">上一题</button>'
      }

      var explain = ''
      if (S.graded) {
        var ok = sameSet(S.picked, q.answer)
        explain =
          '<div class="kq-explain">' +
          '<div class="kq-explain-head">' +
          '<span class="kq-res ' + (ok ? 'kq-res--ok' : 'kq-res--bad') + '">' + (ok ? '回答正确' : '回答错误') + '</span>' +
          '<span>正确答案 <b>' + lettersOf(q.answer) + '</b></span>' +
          '<span>你的选择 <b>' + lettersOf(S.picked.slice().sort()) + '</b></span>' +
          '</div>' +
          '<p>' + (q.explain ? esc(q.explain) : '（这道题没有写解析）') + '</p>' +
          '</div>'
      }

      return (
        '<div class="kq-main">' +
        '<section>' +
        scopeBar() +
        '<div class="kq-card kq-qcard">' + head +
        '<div class="kq-stem">' + esc(q.stem) + '</div>' +
        '<div class="kq-options">' + options + '</div>' +
        explain +
        '<div class="kq-actions">' + actions + '</div>' +
        '</div>' +
        '</section>' +
        '<aside class="kq-rail">' + railRound(q) + railCard(list, index) +
        '<div class="kq-card kq-railcard kq-note">顺序和随机共用同一份进度：每题按 id 记录，切换模式不会丢任何做题、错题或收藏记录。' +
        '<br><br>快捷键：<span class="kq-kbd">1</span>–<span class="kq-kbd">4</span> 选项 · <span class="kq-kbd">Enter</span> 提交/下一题 · <span class="kq-kbd">←</span><span class="kq-kbd">→</span> 翻题</div>' +
        '</aside>' +
        '</div>'
      )
    }

    function railRound(q) {
      var list = orderIds()
      var done = 0
      for (var i = 0; i < list.length; i += 1) if (itemOf(list[i])) done += 1
      var total = list.length || 1
      var today = S.progress.daily[dayKey()] || { n: 0, c: 0 }
      var goal = S.progress.settings.dailyGoal || 30
      var item = itemOf(q.id)
      return (
        '<div class="kq-card kq-railcard">' +
        '<div class="kq-railhead">本轮进度 <span>' + done + ' / ' + list.length + '</span></div>' +
        '<div class="kq-bar"><i style="width:' + pct(done, total) + '"></i></div>' +
        '<div class="kq-nums">' +
        '<div><b>' + (item ? item.correct : 0) + '</b><small>对</small></div>' +
        '<div><b>' + (item ? item.wrong : 0) + '</b><small>错</small></div>' +
        '<div><b>' + (item ? item.streak : 0) + '</b><small>连对</small></div>' +
        '</div>' +
        '<div class="kq-railhead" style="margin:14px 0 8px">今日目标 <span>' + today.n + ' / ' + goal + '</span></div>' +
        '<div class="kq-bar"><i class="kq-bar-ok" style="width:' + pct(Math.min(today.n, goal), goal) + '"></i></div>' +
        '</div>'
      )
    }

    function railCard(list, index) {
      var cells = ''
      for (var i = 0; i < list.length; i += 1) {
        var id = list[i]
        var it = itemOf(id)
        var cls = 'kq-cell'
        if (it) {
          if (it.last === 'right') cls += ' is-right'
          else if (it.last === 'wrong') cls += ' is-wrong'
          if (it.starred) cls += ' is-star'
        }
        if (i === index) cls += ' is-now'
        cells += '<button type="button" class="' + cls + '" data-act="jump" data-i="' + i + '" title="第 ' + (i + 1) + ' 题">' + (i + 1) + '</button>'
      }
      return (
        '<div class="kq-card kq-railcard">' +
        '<div class="kq-railhead">答题卡 <span>' + (index + 1) + ' / ' + list.length + '</span></div>' +
        '<div class="kq-grid">' + cells + '</div>' +
        '</div>'
      )
    }

    function viewListing(kind) {
      var isWrong = kind === 'wrong'
      var ids = isWrong ? (S.wrongMode === 'all' ? wrongIds('all') : wrongIds('pending')) : starredIds()
      var title = isWrong ? '错题本' : '收藏'
      var desc = isWrong
        ? '答错自动进来；再答对后默认移出待订正，历史仍然保留。'
        : '刷题时点「☆ 收藏」收进来的题，适合二刷重点。'
      var filters = ''
      if (isWrong) {
        filters =
          '<div class="kq-filters">' +
          '<button type="button" class="kq-filter' + (S.wrongMode === 'pending' ? ' is-on' : '') + '" data-act="wrong-mode" data-f="pending">待订正 ' + wrongIds('pending').length + '</button>' +
          '<button type="button" class="kq-filter' + (S.wrongMode === 'all' ? ' is-on' : '') + '" data-act="wrong-mode" data-f="all">全部错题 ' + wrongIds('all').length + '</button>' +
          '</div>'
      }

      var rows = ''
      if (ids.length === 0) {
        rows = '<div class="kq-empty"><b>' + (isWrong ? '还没有错题' : '还没有收藏') + '</b>' +
          (isWrong ? '做错的题会自动出现在这里，答对一次后进入「已订正」。' : '在刷题页点「☆ 收藏」就能把题存到这里。') + '</div>'
      } else {
        for (var i = 0; i < ids.length; i += 1) {
          var q = S.byId[ids[i]]
          if (!q) continue
          var it = itemOf(q.id) || {}
          rows +=
            '<div class="kq-row">' +
            '<div class="kq-rownum">' + (i + 1) + '</div>' +
            '<div class="kq-rowbody">' +
            '<div class="kq-rowtitle">' + esc(q.stem) + '</div>' +
            '<div class="kq-rowmeta">' +
            '<span class="kq-chip kq-chip--subject">' + esc(q.subject) + '</span>' +
            '<span>' + typeLabel(q) + '</span>' +
            '<span>错 ' + one(it.wrong) + ' 次</span>' +
            '<span>' + (it.last === 'right' ? '已订正' : '待订正') + '</span>' +
            (it.starred ? '<span>★</span>' : '') +
            '</div></div>' +
            '<div class="kq-rowacts">' +
            '<button type="button" class="kq-btn" data-act="single" data-id="' + esc(q.id) + '">重做</button>' +
            (isWrong
              ? '<button type="button" class="kq-btn kq-btn--ghost" data-act="forget" data-id="' + esc(q.id) + '" title="从错题记录里移除">移出</button>'
              : '<button type="button" class="kq-btn kq-btn--ghost" data-act="unstar" data-id="' + esc(q.id) + '">取消收藏</button>') +
            '</div></div>'
        }
      }

      return (
        '<div class="kq-page">' +
        '<div class="kq-pagehead"><h2>' + title + '</h2><p>' + desc + '</p></div>' +
        '<div class="kq-toolbar">' + filters +
        '<span style="margin-left:auto"></span>' +
        (ids.length
          ? '<button type="button" class="kq-btn kq-btn--primary" data-act="batch" data-kind="' + kind + '">开始重做这批（' + ids.length + ' 题）</button>'
          : '') +
        '</div>' +
        '<div class="kq-list" style="margin-top:12px">' + rows + '</div>' +
        '</div>'
      )
    }

    function viewStats() {
      var total = S.questions.length
      var seen = 0
      var attempts = 0
      var correctAttempts = 0
      var firstRight = 0
      var mastered = 0
      var bySubject = {}
      for (var i = 0; i < S.subjects.length; i += 1) {
        bySubject[S.subjects[i]] = { total: 0, seen: 0, right: 0, wrong: 0 }
      }
      for (var j = 0; j < S.questions.length; j += 1) {
        var q = S.questions[j]
        var bucket = bySubject[q.subject] || (bySubject[q.subject] = { total: 0, seen: 0, right: 0, wrong: 0 })
        bucket.total += 1
        var it = itemOf(q.id)
        if (!it || !it.attempts) continue
        seen += 1
        bucket.seen += 1
        attempts += it.attempts
        correctAttempts += it.correct
        if (it.firstResult === 'right') {
          firstRight += 1
          bucket.right += 1
        }
        if (it.firstResult === 'wrong') bucket.wrong += 1
        if (it.mastered) mastered += 1
      }
      var pending = wrongIds('pending').length
      var today = S.progress.daily[dayKey()] || { n: 0, c: 0 }

      var stats =
        '<div class="kq-stats">' +
        statCard('题库', total, '题') +
        statCard('已做', seen, '题 · ' + pct(seen, total)) +
        statCard('首答正确率', seen ? Math.round((firstRight / seen) * 100) : 0, '%') +
        statCard('已掌握', mastered, '题（连对 2 次）') +
        '</div>' +
        '<div class="kq-stats">' +
        statCard('累计作答', attempts, '次') +
        statCard('错题待订正', pending, '题') +
        statCard('今日', today.n, '题 / 目标 ' + (S.progress.settings.dailyGoal || 30)) +
        statCard('总正确率', attempts ? Math.round((correctAttempts / attempts) * 100) : 0, '%（含重复作答）') +
        '</div>'

      var subjectRows = ''
      for (var s = 0; s < S.subjects.length; s += 1) {
        var name = S.subjects[s]
        var b = bySubject[name]
        subjectRows +=
          '<div class="kq-subj">' +
          '<span class="kq-sname">' + esc(name) + '</span>' +
          '<span class="kq-bar"><i style="width:' + pct(b.seen, b.total) + '"></i></span>' +
          '<span class="kq-snum">' + b.seen + ' / ' + b.total + ' · 首答 ' + (b.seen ? Math.round((b.right / b.seen) * 100) : 0) + '%</span>' +
          '</div>'
      }

      var days = ''
      var max = 1
      var series = []
      for (var d = 6; d >= 0; d -= 1) {
        var date = new Date()
        date.setDate(date.getDate() - d)
        var key = dayKey(date)
        var entry = S.progress.daily[key] || { n: 0, c: 0 }
        max = Math.max(max, entry.n)
        series.push({ label: dayLabel(date), n: entry.n, key: key })
      }
      for (var k = 0; k < series.length; k += 1) {
        var h = series[k].n ? Math.max(4, Math.round((series[k].n / max) * 68)) : 2
        days +=
          '<div class="kq-day" title="' + series[k].key + '：' + series[k].n + ' 题">' +
          '<b>' + (series[k].n || '') + '</b>' +
          '<i style="height:' + h + 'px"></i>' +
          '<span>' + series[k].label + '</span>' +
          '</div>'
      }

      return (
        '<div class="kq-page">' +
        '<div class="kq-pagehead"><h2>统计</h2><p>顺序和随机共用这份数据；数字随做题实时更新。</p></div>' +
        '<div style="margin-top:14px">' + stats + '</div>' +
        '<div class="kq-section"><h3>分科目进度</h3>' + subjectRows + '</div>' +
        '<div class="kq-section"><h3>最近 7 天</h3><div class="kq-days">' + days + '</div></div>' +
        '<div class="kq-section"><h3>进度概览</h3>' +
        '<div class="kq-note" style="padding:12px 14px;border:1px dashed var(--kq-line);border-radius:10px">' +
        '未做 ' + (total - seen) + ' 题 · 做过但未掌握 ' + Math.max(0, seen - mastered) + ' 题 · 已掌握 ' + mastered + ' 题 · 错题待订正 ' + pending + ' 题' +
        '</div></div>' +
        '</div>'
      )
    }

    function statCard(label, value, unit) {
      return '<div class="kq-stat"><small>' + esc(label) + '</small><b>' + esc(value) + '<i>' + esc(unit || '') + '</i></b></div>'
    }

    function viewBank() {
      var meta = S.meta || {}
      var banner = ''
      if (S.storage === 'local') {
        banner = '<div class="kq-banner">Host 路由不可用，进度目前只存在当前浏览器（localStorage）。DSH 换端口或重启后会读不到，恢复 Host 路由后请重新导入进度。</div>'
      }
      var bankRows =
        '<div class="kq-field"><div><div class="kq-flabel">内置题库</div><div class="kq-fdesc">' +
        esc(meta.title || 'bank.json') + '</div></div><div class="kq-fright"><b>' + one(meta.builtin) + ' 题</b></div></div>' +
        '<div class="kq-field"><div><div class="kq-flabel">导入题库</div><div class="kq-fdesc">存在 DSH 主目录 kaoyan-quiz/bank-custom.json，同 id 覆盖内置题</div></div>' +
        '<div class="kq-fright"><b>' + one(meta.custom) + ' 题</b>' +
        (one(meta.custom) ? '<button type="button" class="kq-btn kq-btn--ghost kq-btn--danger" data-act="bank-clear">删除导入</button>' : '') +
        '</div></div>' +
        '<div class="kq-field"><div><div class="kq-flabel">当前生效</div><div class="kq-fdesc">内置 + 导入合并去重后的题目</div></div>' +
        '<div class="kq-fright"><b>' + S.questions.length + ' 题</b></div></div>'

      var settings =
        '<div class="kq-field"><div><div class="kq-flabel">答对后移出错题本</div>' +
        '<div class="kq-fdesc">关闭后，答错过的题会一直留在「待订正」里</div></div>' +
        '<div class="kq-fright"><button type="button" class="kq-switch' + (S.progress.settings.autoRemoveWrong ? ' is-on' : '') +
        '" role="switch" aria-checked="' + (S.progress.settings.autoRemoveWrong ? 'true' : 'false') + '" data-act="toggle-auto"></button></div></div>' +
        '<div class="kq-field"><div><div class="kq-flabel">每日目标</div><div class="kq-fdesc">只影响首页的今日进度条</div></div>' +
        '<div class="kq-fright"><input class="kq-num" type="number" min="1" max="999" value="' +
        (S.progress.settings.dailyGoal || 30) + '" data-act="goal"><span class="kq-hint">题</span></div></div>'

      return (
        '<div class="kq-page">' +
        '<div class="kq-pagehead"><h2>题库与设置</h2><p>题库、进度都能导入导出；换机器搬进度不用重刷。</p></div>' +
        banner +
        '<div class="kq-section"><h3>题库</h3>' + bankRows +
        '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">' +
        '<label class="kq-btn kq-btn--primary">导入题库 JSON<input type="file" accept=".json,application/json" data-act="pick-bank" hidden></label>' +
        '<button type="button" class="kq-btn" data-act="bank-template">复制格式模板</button>' +
        '<button type="button" class="kq-btn kq-btn--ghost" data-act="bank-export">导出当前题库</button>' +
        '</div>' +
        '<div class="kq-hint" style="margin-top:10px;line-height:1.8">支持字段：id、subject、chapter、type（single/multi）、stem、options（数组，按 A/B/C/D 顺序）、answer（如 <b>"B"</b> 或 <b>"BD"</b>）、explain。也可以直接粘贴 JSON 数组到下面再点「导入粘贴内容」。</div>' +
        '<textarea class="kq-textarea" id="kq-bank-paste" placeholder=\'[{"stem":"题干","options":["A 项","B 项","C 项","D 项"],"answer":"B","subject":"马原","explain":"解析"}]\'></textarea>' +
        '<div style="margin-top:8px"><button type="button" class="kq-btn" data-act="bank-paste">导入粘贴内容</button></div>' +
        '<div class="kq-hint" style="margin-top:14px;line-height:1.8">或者填一个题库 JSON 的下载链接，由 Host 直接下载导入（不受浏览器跨域限制）：</div>' +
        '<div class="kq-urlrow"><input class="kq-input" id="kq-bank-url" type="url" placeholder="https://example.com/kaoyan-bank.json" spellcheck="false"><button type="button" class="kq-btn kq-btn--primary" data-act="bank-url">从链接导入</button></div>' +
        '</div>' +
        '<div class="kq-section"><h3>偏好</h3>' + settings + '</div>' +
        '<div class="kq-section"><h3>进度</h3>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<label class="kq-btn">导入进度<input type="file" accept=".json,application/json" data-act="pick-state" hidden></label>' +
        '<button type="button" class="kq-btn" data-act="state-export">导出进度</button>' +
        '<button type="button" class="kq-btn kq-btn--ghost kq-btn--danger" data-act="state-reset">清空全部进度</button>' +
        '</div>' +
        '<textarea class="kq-textarea" id="kq-state-paste" style="margin-top:10px;min-height:110px" placeholder="导出的进度 JSON 会出现在这里，也可以粘贴进度 JSON 后点下面的按钮导入。"></textarea>' +
        '<div style="margin-top:8px"><button type="button" class="kq-btn" data-act="state-paste">导入粘贴的进度</button></div>' +
        '</div>' +
        '<div class="kq-section"><h3>说明</h3>' +
        '<div class="kq-note" style="padding:12px 14px;border:1px dashed var(--kq-line);border-radius:10px;line-height:1.9">' +
        '内置题库已换成导入的 2027 版肖秀荣《1000 题》选择题（1137 道，含答案与解析，来自本机两本 PDF）。' +
        '也可以按上面的字段格式再导入自己的题库，导入后自动与内置题合并、按 id 去重。<br>' +
        '进度文件：<b>%DSH_HOME%\\kaoyan-quiz\\state.json</b>；导入的题库：<b>bank-custom.json</b>。' +
        '</div></div>' +
        '</div>'
      )
    }

    /* -------------------------------------------------------------- events */

    function onClick(event) {
      var target = event.target
      if (!target || !target.closest) return
      var trigger = target.closest('[data-act]')
      if (!trigger || !root.contains(trigger)) return
      var act = trigger.getAttribute('data-act')

      if (act === 'tab') {
        S.tab = trigger.getAttribute('data-tab')
        S.picked = []
        S.graded = false
        if (S.immersive && S.tab !== 'practice') setImmersive(false)
        paint()
        return
      }
      if (act === 'mode') {
        setMode(trigger.getAttribute('data-mode'))
        return
      }
      if (act === 'subject') {
        setSubject(trigger.getAttribute('data-subject'))
        return
      }
      if (act === 'qtype') {
        setQtype(trigger.getAttribute('data-qtype'))
        return
      }
      if (act === 'reset-filters') {
        resetFilters()
        return
      }
      if (act === 'immersive') {
        setImmersive(!S.immersive)
        return
      }
      if (act === 'game-menu') {
        runMenu(trigger.getAttribute('data-id'))
        return
      }
      if (act === 'game-pick') {
        pickChapter(Number(trigger.getAttribute('data-i')))
        return
      }
      if (act === 'game-sheet') {
        S.game.sheet = true
        paint()
        return
      }
      if (act === 'game-sheet-close') {
        S.game.sheet = false
        paint()
        return
      }
      if (act === 'game-jump') {
        var jumpTo = Number(trigger.getAttribute('data-i'))
        S.game.sheet = false
        jump(jumpTo)
        return
      }
      if (act === 'opt') {
        choose(trigger.getAttribute('data-opt'))
        return
      }
      if (act === 'submit') {
        grade()
        return
      }
      if (act === 'next') {
        move(1)
        return
      }
      if (act === 'prev') {
        move(-1)
        return
      }
      if (act === 'retry') {
        retry()
        return
      }
      if (act === 'star') {
        toggleStar()
        return
      }
      if (act === 'jump') {
        jump(Number(trigger.getAttribute('data-i')))
        return
      }
      if (act === 'wrong-mode') {
        S.wrongMode = trigger.getAttribute('data-f') === 'all' ? 'all' : 'pending'
        paint()
        return
      }
      if (act === 'single') {
        var id = trigger.getAttribute('data-id')
        if (S.byId[id]) startBatch([id], '单题重做')
        return
      }
      if (act === 'batch' || act === 'batch-one') {
        var kind = trigger.getAttribute('data-kind')
        var ids = kind === 'wrong' ? (S.wrongMode === 'all' ? wrongIds('all') : wrongIds('pending')) : starredIds()
        if (!ids.length) return
        startBatch(act === 'batch-one' ? [ids[0]] : ids, kind === 'wrong' ? '错题重做' : '收藏重刷')
        return
      }
      if (act === 'forget') {
        var fid = trigger.getAttribute('data-id')
        var fit = S.progress.items[fid]
        if (fit) {
          fit.wrong = 0
          fit.last = ''
          fit.lastPicked = []
          fit.streak = 0
          fit.mastered = false
          scheduleSave()
          paint()
          toast('已从错题本移除', 'ok')
        }
        return
      }
      if (act === 'unstar') {
        var sid = trigger.getAttribute('data-id')
        var sit = S.progress.items[sid]
        if (sit) {
          sit.starred = false
          scheduleSave()
          paint()
        }
        return
      }
      if (act === 'toggle-auto') {
        S.progress.settings.autoRemoveWrong = !S.progress.settings.autoRemoveWrong
        scheduleSave()
        paint()
        return
      }
      if (act === 'bank-clear') {
        fetch(api + '/bank', { method: 'DELETE' })
          .then(function () { return load() })
          .then(function () { toast('已删除导入题库，回到内置题库', 'ok') })
          .catch(function (error) { toast('删除失败：' + String((error && error.message) || error), 'bad') })
        return
      }
      if (act === 'bank-template') {
        var template = [
          {
            id: 'ma-0001',
            subject: '马原',
            chapter: '第一章',
            type: 'single',
            stem: '题干写在这里',
            options: ['A 选项', 'B 选项', 'C 选项', 'D 选项'],
            answer: 'B',
            explain: '解析写在这里',
          },
          {
            id: 'ma-0002',
            subject: '马原',
            chapter: '第一章',
            type: 'multi',
            stem: '多选题题干',
            options: ['A 选项', 'B 选项', 'C 选项', 'D 选项'],
            answer: 'ABD',
            explain: '多选题答案写成字母串',
          },
        ]
        copyText(JSON.stringify(template, null, 2))
        return
      }
      if (act === 'bank-export') {
        var exportBank = S.questions.map(function (q) {
          return {
            id: q.id,
            subject: q.subject,
            chapter: q.chapter,
            type: q.type,
            stem: q.stem,
            options: q.options,
            answer: lettersOf(q.answer),
            explain: q.explain,
          }
        })
        copyText(JSON.stringify(exportBank, null, 2), '题库已复制到剪贴板（' + exportBank.length + ' 题）')
        return
      }
      if (act === 'state-export') {
        var area = root.querySelector('#kq-state-paste')
        var text = JSON.stringify(S.progress, null, 2)
        if (area) area.value = text
        copyText(text, '进度已复制到剪贴板')
        return
      }
      if (act === 'state-reset') {
        if (!window.confirm('清空全部做题进度、错题本和收藏？这个操作不能撤销。')) return
        fetch(api + '/state', { method: 'DELETE' })
          .then(function () {
            S.progress = blankProgress()
            writeLocal()
            S.picked = []
            S.graded = false
            S.tab = 'practice'
            ensurePosition()
            paint()
            toast('进度已清空', 'ok')
          })
          .catch(function (error) { toast('清空失败：' + String((error && error.message) || error), 'bad') })
        return
      }
      if (act === 'bank-paste' || act === 'state-paste') {
        var field = root.querySelector(act === 'bank-paste' ? '#kq-bank-paste' : '#kq-state-paste')
        var raw = field ? field.value.trim() : ''
        if (!raw) {
          toast('先粘贴 JSON 内容', 'bad')
          return
        }
        var parsed
        try {
          parsed = JSON.parse(raw)
        } catch (error) {
          toast('JSON 解析失败：' + String((error && error.message) || error), 'bad')
          return
        }
        if (act === 'bank-paste') importBank(Array.isArray(parsed) ? parsed : parsed.questions)
        else importState(parsed)
      }
      if (act === 'bank-url') {
        var urlField = root.querySelector('#kq-bank-url')
        var bankUrl = urlField ? urlField.value.trim() : ''
        if (!bankUrl) {
          toast('先填题库链接', 'bad')
          return
        }
        toast('正在下载题库…', 'ok')
        fetch(api + '/import', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: bankUrl }),
        })
          .then(function (res) { return res.json() })
          .then(function (result) {
            if (!result || result.ok === false) {
              toast('导入失败：' + ((result && result.error) || '未知错误'), 'bad')
              return
            }
            var skipped = Array.isArray(result.skipped) ? result.skipped.length : 0
            toast('已从链接导入 ' + result.accepted + ' 题' + (skipped ? '，跳过 ' + skipped + ' 条' : ''), 'ok')
            S.progress.queue = { ids: [], pos: 0, subject: S.subject, label: '', scope: '' }
            S.subject = '全部'
            S.chapter = '全部'
            S.qtype = 'all'
            return load().then(function () {
              S.tab = 'practice'
              ensurePosition()
              paint()
            })
          })
          .catch(function (error) { toast('导入失败：' + String((error && error.message) || error), 'bad') })
        return
      }
    }

    function onChange(event) {
      var target = event.target
      if (!target) return
      if (target.getAttribute('data-act') === 'chapter') {
        var raw = target.value
        if (raw === '全部') {
          setChapter('全部')
          return
        }
        var cut = raw.indexOf('||')
        if (cut > 0) {
          var subj = raw.slice(0, cut)
          var name = raw.slice(cut + 2)
          if (subj !== S.subject) {
            S.subject = subj
            S.chapter = name
            reseedScope()
            return
          }
          setChapter(name)
          return
        }
        setChapter(raw)
        return
      }
      if (target.getAttribute('data-act') === 'goal') {
        var value = Math.max(1, Math.min(999, Math.floor(Number(target.value) || 30)))
        S.progress.settings.dailyGoal = value
        scheduleSave()
        paint()
        return
      }
      if (target.getAttribute('data-act') === 'pick-bank') {
        readFile(target, function (text) {
          var parsed
          try {
            parsed = JSON.parse(text)
          } catch (error) {
            toast('JSON 解析失败：' + String((error && error.message) || error), 'bad')
            return
          }
          importBank(Array.isArray(parsed) ? parsed : parsed.questions)
        })
        return
      }
      if (target.getAttribute('data-act') === 'pick-state') {
        readFile(target, function (text) {
          var parsed
          try {
            parsed = JSON.parse(text)
          } catch (error) {
            toast('JSON 解析失败：' + String((error && error.message) || error), 'bad')
            return
          }
          importState(parsed && parsed.state ? parsed.state : parsed)
        })
      }
    }

    function onKey(event) {
      var tag = event.target && event.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      var key = event.key
      if (S.tab !== 'practice') return
      if (S.gameMode && gameKey(event)) return
      if (key === 'Escape') {
        if (S.immersive) {
          event.preventDefault()
          setImmersive(false)
        }
        return
      }
      if (key === 'f' || key === 'F') {
        event.preventDefault()
        setImmersive(!S.immersive)
        return
      }
      if (/^[1-8]$/.test(key)) {
        var letter = LETTERS[Number(key) - 1]
        if (letter && currentQuestion() && currentQuestion().options.length >= Number(key)) {
          event.preventDefault()
          choose(letter)
        }
        return
      }
      if (/^[a-hA-H]$/.test(key)) {
        var l = key.toUpperCase()
        if (currentQuestion() && currentQuestion().options.length > LETTERS.indexOf(l)) {
          event.preventDefault()
          choose(l)
        }
        return
      }
      if (key === 'Enter') {
        event.preventDefault()
        if (S.graded) move(1)
        else if (currentQuestion() && currentQuestion().type === 'multi') grade()
        return
      }
      if (key === 'ArrowRight') {
        event.preventDefault()
        move(1)
        return
      }
      if (key === 'ArrowLeft') {
        event.preventDefault()
        move(-1)
      }
    }

    function readFile(input, done) {
      var file = input.files && input.files[0]
      if (!file) return
      var reader = new FileReader()
      reader.onload = function () {
        done(String(reader.result || ''))
        input.value = ''
      }
      reader.onerror = function () {
        toast('读取文件失败', 'bad')
      }
      reader.readAsText(file, 'utf-8')
    }

    function importBank(questions) {
      if (!Array.isArray(questions) || questions.length === 0) {
        toast('没有可导入的题目（需要 questions 数组）', 'bad')
        return
      }
      fetch(api + '/bank', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ questions: questions }),
      })
        .then(function (res) { return res.json() })
        .then(function (result) {
          if (!result || result.ok === false) {
            toast('导入失败：' + ((result && result.error) || '未知错误'), 'bad')
            return
          }
          var skipped = Array.isArray(result.skipped) ? result.skipped.length : 0
          toast('已导入 ' + result.accepted + ' 题' + (skipped ? '，跳过 ' + skipped + ' 条无效数据' : ''), 'ok')
          S.progress.queue = { ids: [], pos: 0, subject: S.subject, label: '', scope: '' }
          S.subject = '全部'
          S.chapter = '全部'
          S.qtype = 'all'
          return load().then(function () {
            S.tab = 'practice'
            ensurePosition()
            paint()
          })
        })
        .catch(function (error) {
          toast('导入失败：' + String((error && error.message) || error), 'bad')
        })
    }

    function importState(state) {
      if (state === null || typeof state !== 'object' || Array.isArray(state)) {
        toast('进度 JSON 必须是对象', 'bad')
        return
      }
      S.progress = normalizeProgress(state)
      S.picked = []
      S.graded = false
      ensurePosition()
      flush().then(function () {
        paint()
        toast('进度已导入', 'ok')
      })
    }

    function copyText(text, message) {
      var done = function () {
        toast(message || '已复制', 'ok')
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {
          fallbackCopy(text, done)
        })
        return
      }
      fallbackCopy(text, done)
    }

    function fallbackCopy(text, done) {
      var area = root.querySelector('#kq-state-paste')
      if (area) {
        area.value = text
        area.select()
      }
      toast('内容已放进下方文本框，手动复制即可', 'ok')
      if (done) done()
    }

    /* --------------------------------------------------------------- setup */

    root.addEventListener('click', onClick)
    root.addEventListener('change', onChange)
    root.addEventListener('keydown', onKey)

    var onHide = function () {
      if (S.saveTimer) {
        window.clearTimeout(S.saveTimer)
        S.saveTimer = 0
        void flush()
      }
    }
    window.addEventListener('pagehide', onHide)

    var onDocKey = function (event) {
      if (!S.immersive) return
      if (root.contains(event.target)) return
      onKey(event)
    }
    document.addEventListener('keydown', onDocKey)

    var onFsChange = function () {
      if (!document.fullscreenElement && S.immersive) setImmersive(false)
    }
    document.addEventListener('fullscreenchange', onFsChange)

    load().catch(function (error) {
      if (S.disposed) return
      S.ready = true
      bodyEl.innerHTML =
        '<div class="kq-empty"><b>加载失败</b>' + esc(String((error && error.message) || error)) +
        '<br><button type="button" class="kq-btn" style="margin-top:12px" data-act="reload">重试</button></div>'
      root.addEventListener('click', function retryClick(event) {
        var t = event.target
        if (t && t.closest && t.closest('[data-act="reload"]')) {
          root.removeEventListener('click', retryClick)
          window.location.reload()
        }
      })
    })

    return {
      dispose: function () {
        if (S.saveTimer) {
          window.clearTimeout(S.saveTimer)
          S.saveTimer = 0
          void flush()
        }
        S.disposed = true
        window.clearTimeout(S.toastTimer)
        window.removeEventListener('pagehide', onHide)
        document.removeEventListener('keydown', onDocKey)
        document.removeEventListener('fullscreenchange', onFsChange)
        document.documentElement.classList.remove('kq-immersive-lock')
        root.removeEventListener('click', onClick)
        root.removeEventListener('change', onChange)
        root.removeEventListener('keydown', onKey)
        if (root.parentNode) root.parentNode.removeChild(root)
      },
      state: S,
    }
  }

  window.KaoyanQuizUI = { mount: mount, version: '2.3.0' }
})()
