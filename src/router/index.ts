import { createRouter, createWebHashHistory } from 'vue-router';

/** 기획서 4장의 화면 이동 흐름을 그대로 라우트로 옮긴 것. 경로는 React 버전과 동일하다. */
const routes = [
  { path: '/', name: 'splash', component: () => import('../screens/SplashScreen.vue') },
  { path: '/login', name: 'login', component: () => import('../screens/LoginScreen.vue') },
  { path: '/home', name: 'home', component: () => import('../screens/HomeScreen.vue') },
  { path: '/calendar', name: 'calendar', component: () => import('../screens/CalendarScreen.vue') },
  { path: '/schedule/new', name: 'schedule-new', component: () => import('../screens/ScheduleFormScreen.vue') },
  { path: '/schedule/:id/edit', name: 'schedule-edit', component: () => import('../screens/ScheduleFormScreen.vue') },
  { path: '/schedule/:id/:date', name: 'schedule-detail', component: () => import('../screens/ScheduleDetailScreen.vue') },
  {
    path: '/schedule/:id/:date/notifications',
    name: 'schedule-notifications',
    component: () => import('../screens/NotificationSettingsScreen.vue'),
  },
  { path: '/mail', name: 'mail', component: () => import('../screens/MailImportScreen.vue') },
  { path: '/mail/:id/review', name: 'mail-review', component: () => import('../screens/AiReviewScreen.vue') },
  { path: '/settings', name: 'settings', component: () => import('../screens/SettingsScreen.vue') },
  { path: '/widget', name: 'widget', component: () => import('../screens/WidgetPreviewScreen.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/home' },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});
