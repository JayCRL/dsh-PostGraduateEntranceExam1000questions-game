/* 考研政治刷题台 — Client 半边。只负责把 UI 挂进主面板，真正界面在 ui.js 里（Host 路由提供）。 */
window.__ModuleLoader__.load({
  id: '@local/kaoyan-quiz',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const PANEL_KEY = 'kaoyan-quiz'
    const UI_VERSION = '2.3.0'
    const UI_URL = '/plugin/kaoyan-quiz/ui.js?v=' + UI_VERSION

    function PanelIcon(props) {
      const size = props && Number.isFinite(props.size) ? props.size : 20
      const active = props && props.active === true
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          'aria-hidden': 'true',
          style: { display: 'block', opacity: active ? 1 : 0.72 },
        },
        h('path', {
          d: 'M4 5.2c0-.6.5-1 1-1h5.1c.7 0 1.3.3 1.8.9l.2.2.2-.2c.5-.6 1.1-.9 1.8-.9H19c.6 0 1 .4 1 1v13.6c0 .6-.4 1-1 1h-5.6c-.6 0-1.2.2-1.6.7l-.2.2-.2-.2c-.4-.5-1-.7-1.6-.7H5c-.6 0-1-.4-1-1V5.2z',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinejoin: 'round',
        }),
        h('path', { d: 'M12 5.6v15', stroke: 'currentColor', strokeWidth: 1.2, opacity: 0.45 }),
        h('path', {
          d: 'M7.4 16.4l1.7-1.8 1.3 1.2 2.6-2.9',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          opacity: active ? 1 : 0.9,
        }),
      )
    }

    function Surface() {
      const ref = React.useRef(null)
      React.useEffect(function () {
        const host = ref.current
        if (!host) return undefined
        let disposed = false
        let api = null

        function boot() {
          if (disposed || !window.KaoyanQuizUI) return
          try {
            api = window.KaoyanQuizUI.mount(host, { api: '/plugin/kaoyan-quiz' })
          } catch (error) {
            console.error('[kaoyan-quiz] 面板挂载失败', error)
            host.innerHTML = '<div class="kq-fatal">刷题台挂载失败：' + String((error && error.message) || error) + '</div>'
          }
        }

        const loaded = window.KaoyanQuizUI && window.KaoyanQuizUI.version === UI_VERSION
        if (loaded) {
          boot()
        } else {
          const existing = document.querySelector('script[data-kaoyan-quiz-ui="' + UI_VERSION + '"]')
          if (existing) {
            existing.addEventListener('load', boot, { once: true })
            existing.addEventListener('error', onError, { once: true })
          } else {
            const script = document.createElement('script')
            script.src = UI_URL
            script.async = true
            script.dataset.kaoyanQuizUi = UI_VERSION
            script.addEventListener('load', boot, { once: true })
            script.addEventListener('error', onError, { once: true })
            document.head.appendChild(script)
          }
        }

        function onError() {
          if (disposed) return
          host.innerHTML = '<div class="kq-fatal">刷题台脚本加载失败（' + UI_URL + '）</div>'
        }

        return function () {
          disposed = true
          if (api && typeof api.dispose === 'function') api.dispose()
          api = null
          host.innerHTML = ''
        }
      }, [])

      return h('div', { ref: ref, style: { height: '100%', overflow: 'hidden' } })
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', function () {
          return ctx.slots.register(
            { name: 'sidebar.panellist', id: PANEL_KEY, order: 40, label: () => '政治刷题' },
            PanelIcon,
          )
        })
        ctx.slots.inject('main', function () {
          return ctx.slots.register({ name: 'main', key: PANEL_KEY }, Surface)
        })
      },
    }
  },
})
