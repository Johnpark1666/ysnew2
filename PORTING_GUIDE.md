# Porting Guide (Linux Environment & AI Agent Context)

이 가이드는 현재 Windows 환경의 프로젝트를 Linux 환경으로 마이그레이션(포팅)하고, 리눅스 컴퓨터의 AI 에이전트가 본 프로젝트를 즉시 분석하고 실행할 수 있도록 안내하는 포팅 가이드입니다.

---

## 1. 프로젝트 개요 (Project Overview)

- **프로젝트 명**: 인사이트 클리핑 (YouTube & GitHub Insight Clipping Tool)
- **개발 환경/프레임워크**: Vite (Vanilla JS 기반 빌드 도구)
- **주요 기능**:
  - Google Sheets GViz API를 이용해 YouTube 요약 정보 및 GitHub 프로젝트 메타데이터 실시간 연동
  - 카테고리/채널별 필터링, 검색, 다중 선택(일괄 읽음 처리), 즐겨찾기 관리
  - 캔버스 기반 백그라운드 파티클 애니메이션 제공 (HTML-in-Canvas는 호환성 문제로 비활성화 상태)

---

## 2. Git 추적 대상 제외 파일 목록 (Git-ignored Files)

아래 목록은 `.gitignore` 등으로 인해 Git 원격 저장소에 포함되지 않아, 리눅스 서버로 복사/다운로드 후 직접 생성하거나 관리해야 하는 파일들입니다.

1. **`node_modules/`**
   - **이유**: 프로젝트 실행에 필요한 외부 npm 패키지 저장소입니다. 용량이 크고 플랫폼 종속성이 있을 수 있어 Git에서 배제됩니다.
   - **조치**: 리눅스 컴에서 프로젝트 루트 경로로 이동한 뒤 `npm install` 명령어를 실행하여 새로 설치해야 합니다.
2. **`dist/`**
   - **이유**: 배포용 빌드 파일(HTML, CSS, JS 컴파일 결과물)이 생성되는 경로입니다.
   - **조치**: 개발 시에는 필요치 않으며, 실서버 배포 시 `npm run build` 명령어로 생성할 수 있습니다.
3. **`.DS_Store`**
   - macOS 시스템에서 자동 생성되는 메타데이터 파일로 무시하셔도 됩니다.

---

## 3. 리눅스 환경 포팅 및 구동 방법 (Run & Build on Linux)

리눅스 컴에서 개발 서버를 실행하거나 빌드하려면 아래 단계를 진행하십시오.

### 1) 필수 도구 설치 (Node.js & npm)
리눅스 배포판(Ubuntu 기준)에 Node.js 및 npm이 설치되어 있어야 합니다.
```bash
# Node.js LTS 버전 설치 권장 (18.x 또는 20.x 이상)
sudo apt update
sudo apt install -y nodejs npm
```

### 2) 의존성 패키지 설치
프로젝트 루트 디렉토리에서 아래 명령어로 의존성 패키지를 설치합니다.
```bash
npm install
```

### 3) 로컬 개발 서버 실행
```bash
npm run dev
```
* 기본적으로 `http://localhost:5173` 포트에서 실행됩니다.
* **만약 외부 컴퓨터나 VM 환경에서 접속해야 한다면**, `--host` 옵션을 주어 모든 대역에서 접속을 허용하십시오:
  ```bash
  npm run dev -- --host
  ```

### 4) 프로덕션 빌드 및 검증
```bash
# 배포용 정적 파일 빌드
npm run build

# 빌드된 dist 폴더 내용 로컬 테스트 실행
npm run preview -- --host
```

---

## 4. 리눅스 환경 이식 시 주의 사항 (Platform Differences)

1. **경로 대소문자 구분 (Case Sensitivity)**:
   - Windows는 파일 경로의 대소문자를 구분하지 않지만, **Linux는 대소문자를 엄격하게 구분합니다.**
   - 코드 상의 `import` 또는 HTML 내 `src` 경로에서 대소문자가 일치하지 않는 경우 Linux 환경에서는 `404 Not Found` 또는 빌드 에러가 발생하므로 주의하십시오. (현재 소스코드는 대소문자 일치가 확인된 상태입니다.)
2. **포트 방화벽 설정**:
   - 리눅스 서버에서 개발 서버(`5173` 포트)나 프리뷰 서버(`4173` 포트)를 실행할 경우, 외부 브라우저에서 접속할 수 있도록 방화벽(ufw 등) 포트를 허용해야 합니다.
   ```bash
   sudo ufw allow 5173/tcp
   sudo ufw allow 4173/tcp
   ```

---

## 5. 리눅스 AI 에이전트를 위한 소스 코드 맵 (Context Map for AI Agents)

리눅스 컴퓨터의 AI 에이전트가 코드를 수정하고 개선할 때 참고해야 할 핵심 파일 맵입니다.

- **[index.html](file:///index.html)**: 메인 레이아웃 뼈대이자 진입점. Phosphor Icons 및 Google SSO 라이브러리를 CDN에서 로드하고 있습니다.
- **[src/main.js](file:///src/main.js)**: 앱의 두뇌 역할을 하는 단일 핵심 자바스크립트 파일.
  - **구글 시트 연동**: 상단의 `GAS_API_URL`, `SPREADSHEET_ID`, `GVIZ_URL` 변수를 기반으로 데이터를 가져옵니다.
  - **성능 최적화**: `fetchData()` 내부에서 3개의 시트 데이터(`allData`, `mixData`, `githubData`)를 `Promise.all`로 병렬 처리하고 있습니다.
  - **애니메이션**: 최하단의 `initBgAnimation()`이 캔버스를 이용해 백그라운드 파티클을 60 FPS로 렌더링합니다.
- **[src/style.css](file:///src/style.css)**: 브루탈리즘(Brutalism) 컨셉의 레이아웃 스타일 및 모바일 대응 반응형 미디어 쿼리가 선언된 메인 CSS 파일.
- **[vite.config.js](file:///vite.config.js)**: Vite 빌드 환경설정.
