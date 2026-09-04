import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

/**
 * 서비스 워커에 실제 빌드 산출물 목록을 주입한다 (기획서 3.2 오프라인 캐싱).
 *
 * 손으로 적은 셸 목록만 precache하면, 해시가 붙은 엔트리 JS·CSS·라우트 청크는
 * "서비스 워커가 가로챈 요청"에만 우연히 담긴다. 첫 방문은 워커가 제어하기 전이라
 * 정작 앱을 띄우는 파일이 빠지고, 그 상태로 오프라인이 되면 빈 화면이 뜬다.
 * 그래서 빌드가 끝난 뒤 dist를 훑어 목록과 캐시 버전을 sw.js에 박아 넣는다.
 */
export function precachePlugin(base = '/'): Plugin {
  return {
    name: 'godlife-precache',
    apply: 'build',
    closeBundle() {
      const dist = 'dist';
      const swPath = join(dist, 'sw.js');

      const files: string[] = [];
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir)) {
          const full = join(dir, entry);
          if (statSync(full).isDirectory()) walk(full);
          else files.push('/' + relative(dist, full).split(sep).join(posix.sep));
        }
      };
      walk(dist);

      // 하위 경로 배포에서는 캐시 키도 그 경로여야 한다. base는 항상 '/'로 끝난다.
      const prefixed = files.filter((f) => f !== '/sw.js').map((f) => base + f.slice(1));
      // sw.js 자신은 캐시하지 않는다. 캐시되면 새 워커를 못 받는다.
      const precache = [base, ...prefixed].sort();
      // 산출물이 바뀌면 캐시 이름이 바뀌어 옛 캐시가 정리된다.
      const version = createHash('sha256').update(precache.join('|')).digest('hex').slice(0, 8);

      const source = readFileSync(swPath, 'utf8')
        .replace("'__PRECACHE_MANIFEST__'", JSON.stringify(precache, null, 2))
        .replace('__CACHE_VERSION__', version)
        .replace(/__BASE__/g, base);
      writeFileSync(swPath, source);

      console.log(`  서비스 워커 precache ${precache.length}개 파일 (캐시 godlife-${version})`);
    },
  };
}
