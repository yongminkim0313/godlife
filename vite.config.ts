/// <reference types="vitest" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { precachePlugin } from './src/build/precache-plugin';

// youthvision.co.kr/godlife 처럼 하위 경로로 서빙한다. 루트로 옮기려면 BASE_PATH=/ 로 빌드.
const base = process.env.BASE_PATH ?? '/godlife/';

export default defineConfig({
  base,
  plugins: [vue(), precachePlugin(base)],
  /*
   * 원격 컨테이너·터널을 통해 열어볼 때를 위한 설정.
   * Vite 5는 Host 헤더가 localhost가 아니면 403으로 막는데, 프록시 도메인으로 들어오는
   * 요청이 여기 걸린다. 정적 결과물만 내보내는 미리보기 서버라 호스트 검사를 열어둔다.
   * (개발 서버·미리보기 전용이며 배포 산출물에는 영향이 없다.)
   */
  server: { host: true, allowedHosts: true },
  preview: { host: true, allowedHosts: true },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
