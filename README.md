# Personal Homepage

`suwonyoon.com` 디자인을 그대로 복제한 개인 홈페이지 템플릿입니다. **GitHub Pages**에서 무료로 영구 호스팅되며, `/admin` 페이지에서 **GitHub Personal Access Token (PAT)**으로 로그인해 내용을 직접 수정할 수 있습니다.

## 구조

```
.
├── index.html              # 메인 페이지
├── styles.css              # 스타일
├── render.js               # data.json을 읽어서 페이지 렌더링
├── data.json               # 모든 컨텐츠 (수정 대상)
├── .nojekyll               # GitHub Pages에서 Jekyll 빌드 비활성화
├── admin/
│   ├── index.html          # 편집기 페이지
│   └── admin.js            # GitHub API 클라이언트
└── assets/
    ├── profile.svg         # 프로필 사진 (교체 권장)
    ├── paper-placeholder.svg
    └── project-placeholder.svg
```

## 셋업 가이드

### 1. GitHub 레포지토리 만들기

GitHub에서 **`<username>.github.io`** 이름으로 **public** 레포지토리를 만듭니다. 예: `minseong.github.io`

이 이름 규칙을 따르면 자동으로 `https://<username>.github.io/` 주소로 배포됩니다.

### 2. 파일 업로드

이 폴더의 모든 파일을 레포지토리에 push합니다:

```bash
git init
git add .
git commit -m "Initial homepage"
git branch -M main
git remote add origin https://github.com/<username>/<username>.github.io.git
git push -u origin main
```

또는 GitHub 웹 UI에서 드래그앤드롭으로 업로드해도 됩니다.

### 3. GitHub Pages 활성화

레포지토리의 **Settings → Pages**에서:
- **Source**: `Deploy from a branch`
- **Branch**: `main` / `/ (root)`

1~2분 후 `https://<username>.github.io/`에서 사이트를 볼 수 있습니다.

### 4. PAT (Personal Access Token) 발급

`/admin` 페이지에서 내용을 수정하려면 PAT가 필요합니다.

**옵션 A — Fine-grained PAT (권장)**
1. https://github.com/settings/personal-access-tokens/new 이동
2. **Token name**: `homepage-admin` 같은 식별 이름
3. **Expiration**: 원하는 기간 (최대 1년, 만료되면 재발급)
4. **Repository access**: `Only select repositories` → 해당 `<username>.github.io` 레포 선택
5. **Repository permissions**:
   - **Contents**: `Read and write`
   - (Metadata: Read-only로 자동 설정됨)
6. **Generate token** → 토큰 복사 (`github_pat_...`로 시작)

**옵션 B — Classic PAT (더 간단)**
1. https://github.com/settings/tokens 이동
2. **Generate new token** → **Generate new token (classic)**
3. **Note**: `homepage-admin`
4. **Expiration**: 원하는 기간 (영구로 하려면 `No expiration`)
5. **Scopes**: `repo` 체크 (Full control of private repositories)
6. **Generate token** → 토큰 복사 (`ghp_...`로 시작)

⚠️ 토큰은 **한 번만 보입니다.** 안전한 곳에 백업해두세요.

### 5. Admin 페이지 사용

1. `https://<username>.github.io/admin/`로 접속
2. **Token**: 위에서 발급한 PAT 붙여넣기
3. **Repository**: `<username>/<username>.github.io` (예: `minseong/minseong.github.io`)
4. **Branch**: `main`
5. **Remember on this device** 체크하면 브라우저 localStorage에 저장 (본인 기기에서만)
6. **Sign in**

로그인 성공 후 모든 섹션(Profile, About, News, Publications, Projects, Nav, Footer)을 편집할 수 있습니다. **Save changes** 버튼을 누르면 GitHub에 자동 커밋되고, 30~60초 후 사이트가 업데이트됩니다.

### 6. 프로필 사진 교체

1. 본인 사진을 `assets/profile.jpg` (또는 `.png`)로 업로드 (GitHub 웹에서 직접 업로드 가능)
2. Admin → **Profile** → **Photo path**를 `assets/profile.jpg`로 변경
3. **Save changes**

## 보안

- PAT는 본인 기기의 `localStorage`에만 저장됩니다. 다른 사람이 admin URL을 알아도 토큰이 없으면 아무것도 못 합니다.
- 공용 컴퓨터에서는 **Remember on this device** 체크를 해제하세요.
- 토큰이 노출되면 즉시 GitHub Settings에서 revoke하고 새로 발급하세요.
- Fine-grained PAT는 특정 레포에만 권한이 있어 더 안전합니다.

## 한국어 폰트 (선택)

기본 스택은 `Apple SD Gothic Neo`, `Pretendard` 포함. 더 일관된 한국어 표시를 원하면 `index.html`의 `<head>`에 다음을 추가:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
```

## 디자인 출처

레이아웃과 디자인 토큰은 https://suwonyoon.com/ 을 참고했습니다 (Next.js + Tailwind + shadcn/ui 기반 → vanilla HTML/CSS로 재작성).
