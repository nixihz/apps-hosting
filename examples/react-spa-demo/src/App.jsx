import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const base = '/x/react-spa-demo';
const cells = Array.from({ length: 42 }, (_, index) => index);
const sparks = Array.from({ length: 18 }, (_, index) => index);

function navigate(path) {
  window.history.pushState({}, '', `${base}${path}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function useRoute() {
  const [path, setPath] = useState(() => window.location.pathname.replace(base, '') || '/');
  React.useEffect(() => {
    const update = () => setPath(window.location.pathname.replace(base, '') || '/');
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  return path;
}

function usePointerGlow(ref) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    let frame = 0;
    const update = (event) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width - 0.5).toFixed(3);
        const y = ((event.clientY - rect.top) / rect.height - 0.5).toFixed(3);
        element.style.setProperty('--mx', x);
        element.style.setProperty('--my', y);
        element.style.setProperty('--gx', `${event.clientX - rect.left}px`);
        element.style.setProperty('--gy', `${event.clientY - rect.top}px`);
      });
    };

    element.addEventListener('pointermove', update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('pointermove', update);
    };
  }, [ref]);
}

function App() {
  const path = useRoute();
  const stageRef = useRef(null);
  usePointerGlow(stageRef);

  const page = useMemo(() => {
    if (path.startsWith('/metrics')) return <Metrics />;
    if (path.startsWith('/settings')) return <Settings />;
    return <Home />;
  }, [path]);

  return <main ref={stageRef} className="stage">
    <KineticBackdrop />
    <aside>
      <div className="mark">K</div>
      <p className="eyebrow">KELI APPS SPA</p>
      <h1><span>React</span> 小应用驾驶舱</h1>
      <p className="aside-copy">几何块、路径线和弹性入场组成一套轻量动效，不引入额外动画依赖。</p>
      <nav>
        <button className={path === '/' ? 'active' : ''} onClick={() => navigate('/')}>概览 <i /></button>
        <button className={path.startsWith('/metrics') ? 'active' : ''} onClick={() => navigate('/metrics')}>指标 <i /></button>
        <button className={path.startsWith('/settings') ? 'active' : ''} onClick={() => navigate('/settings/profile')}>深层路由 <i /></button>
      </nav>
    </aside>
    <section className="panel" data-reveal>{page}</section>
  </main>;
}

function KineticBackdrop() {
  return <div className="kinetic" aria-hidden="true">
    <div className="orbit orbit-a" />
    <div className="orbit orbit-b" />
    <div className="beam" />
    <div className="cell-field">
      {cells.map((cell) => <span key={cell} style={{ '--i': cell }} />)}
    </div>
    <div className="sparks">
      {sparks.map((spark) => <b key={spark} style={{ '--i': spark, '--x': `${(spark * 53) % 100}%`, '--y': `${8 + ((spark * 37) % 82)}%` }} />)}
    </div>
  </div>;
}

function Home() {
  return <>
    <span className="tag">已托管在 /x/react-spa-demo</span>
    <h2>一个真实的 React SPA Demo</h2>
    <p>这个页面演示子路径部署、History 路由和 Keli Apps SPA fallback。新增的动效灵感来自 animejs.com：错位网格、弹性轨道、明亮几何和鼠标响应光晕。</p>
    <div className="cards">
      <article><b>base</b><strong>/x/react-spa-demo/</strong></article>
      <article><b>motion</b><strong>CSS + RAF</strong></article>
      <article><b>route</b><strong>History API</strong></article>
    </div>
  </>;
}

function Metrics() {
  return <>
    <span className="tag">runtime metrics</span>
    <h2>指标页</h2>
    <div className="meter"><i style={{ width: '72%' }} /></div>
    <p>进度条加入了流动高光和弹性入场，用来确认 SPA 内部导航不会触发整页刷新。</p>
  </>;
}

function Settings() {
  return <>
    <span className="tag">deep route</span>
    <h2>深层路由可刷新</h2>
    <p>尝试直接打开 <code>/x/react-spa-demo/settings/profile</code>，Keli Apps 会把请求 fallback 到应用的 <code>dist/index.html</code>。</p>
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
