# Personal Homepage v2

`suwonyoon.com` 디자인을 정교하게 복제한 개인 홈페이지 + **실시간 미리보기**가 있는 admin 편집기.

## v2의 새 기능

- **🎨 Design 섹션** — admin에서 액센트 컬러(light/dark), 폰트, 폰트 크기, 굵기를 직접 조절. 10가지 컬러 프리셋 + 컬러 피커.
- **⚡ 라이브 프리뷰** — admin 페이지 우측에 사이트가 iframe으로 표시되며, 어떤 변경이든 즉시(80ms debounce) 반영. GitHub 저장 전에 결과 확인 가능.
- **디자인 디테일 개선** — Paper PDF 버튼 그림자, type tag 흰 배경, 더 굵은 bold weight, mono 폰트 조정, sidebar 너비 확장(긴 이름 한 줄 유지).
- **Pretendard 자동 로드** — 한국어 폰트가 깔끔하게 표시됨.

## 디렉토리 구조

```
.
├── index.html              # 메인 페이지
├── styles.css              # 디자인 토큰 + admin 스타일
├── render.js               # data.json 렌더링 + postMessage 라이브 프리뷰 수신
├── data.json               # 모든 컨텐츠 + design 토큰
├── .nojekyll
├── admin/
│   ├── index.html          # 2-pane 편집기 + 라이브 프리뷰
│   └── admin.js            # GitHub API + postMessage
└── assets/
    ├── profile.svg
    ├── paper-placeholder.svg
    └── project-placeholder.svg
```

## 셋업 (기존과 동일)

이미 `gimme-some.github.io` 레포가 있으면 기존 파일을 이 v2로 **덮어쓰기**만 하면 됩니다. `data.json`은 기존 내용에 `design` 객체만 추가하면 자동으로 작동합니다.

기존 `data.json`에 다음을 추가하면 v2의 모든 기능이 활성화됩니다:

```json
{
  "design": {
    "primary": "#dc2626",
    "primary_dark": "#f87171",
    "font_sans": "system",
    "font_mono": "system",
    "base_font_size": 16,
    "name_font_size": 36,
    "heading_weight": 500,
    "bold_weight": 700,
    "tag_weight": 500
  },
  ...
}
```

자동으로 기본값이 채워지긴 하지만, 명시적으로 넣어두는 게 안전합니다.

## 데이터 스키마 변경점

- `design` 객체 추가 (모든 키 optional, 누락 시 기본값)
- 나머지는 v1과 동일

## 라이브 프리뷰 동작 원리

1. admin/index.html에 `<iframe src="../index.html">`이 우측에 떠 있음
2. iframe의 render.js가 자기가 iframe 안에 있는 걸 감지 → `data.json` fetch 안 함
3. admin.js의 input change 핸들러가 80ms debounce 후 `postMessage({type:'data', payload: STATE.data})`
4. iframe의 render.js가 메시지 받아서 즉시 `applyDesign()` + `render()`
5. **결과**: 슬라이더/색상 피커 움직이는 즉시 우측에 반영됨

## 라이센스

자유롭게 사용/수정하세요.
