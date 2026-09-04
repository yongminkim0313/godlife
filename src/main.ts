import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import './styles.css';

createApp(App).use(createPinia()).use(router).mount('#app');

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    // 하위 경로로 배포하면 워커도 그 아래에 있어야 scope가 앱 전체를 덮는다.
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // 서비스 워커가 없어도 localStorage 캐시로 오프라인 조회는 동작한다.
    });
  });
}
