# Claude Emotion Panel

Claude Code가 작업할 때 감정을 실시간으로 표현하는 시스템.
hooks가 도구 사용에 따라 자동으로 감정을 바꾸고, 브라우저 대시보드 또는 VSCode 사이드바에서 확인할 수 있다.

```
[Claude Code] --hooks--> [set-emotion.sh] ---> [state.json]
[Claude Code] --MCP----> [MCP Server]    ---> [state.json]
                                                   |
                                    [Browser / VSCode / Tauri / ...]
```

## 빠른 시작 (AI용)

> 이 프로젝트 디렉토리에서 Claude Code를 실행하는 AI가 아래 순서대로 따라하면 된다.

### 1. MCP 서버 실행

```bash
cd core/server
npm install
node index.js &
```

서버가 `http://localhost:3100`에서 실행된다.
`curl -s http://localhost:3100/health` 로 확인.

### 2. 브라우저 대시보드 열기

```bash
start http://localhost:3100    # Windows
open http://localhost:3100     # macOS
xdg-open http://localhost:3100 # Linux
```

### 3. 동작 확인

서버가 켜지면 hooks가 자동으로 감정을 변경한다.
`.claude/settings.local.json`에 hooks가, `.mcp.json`에 MCP 서버가 이미 설정되어 있다.

아무 작업이나 시키면 브라우저에서 감정이 실시간으로 바뀌는 것을 볼 수 있다.

## 구조

```
Claude_Emotion/
  assets/                        # 감정 이모티콘 40개 (webp, 공유)
  core/                          # 상태 관리 엔진
    server/index.js              #   MCP 서버 (port 3100)
    hooks/set-emotion.sh         #   훅 스크립트 (자동 감정 변경)
    state.json                   #   현재 감정 상태 (공유 파일)
  viewers/                       # 표시 레이어 (독립적)
    web/index.html               #   브라우저 대시보드
    vscode/                      #   VSCode 확장
  .claude/settings.local.json    # hooks 설정
  .mcp.json                      # MCP 서버 등록
  CLAUDE.md                      # AI 행동 규칙
```

**core**는 state.json을 쓰고, **viewers**는 state.json을 읽는다.
새 뷰어(Tauri 등)를 추가하려면 `viewers/` 아래에 디렉토리를 만들고 state.json을 watch하면 된다.

## hooks 동작 방식

| 이벤트 | 감정 | 예시 대사 |
|--------|------|-----------|
| 프롬프트 입력 (`UserPromptSubmit`) | thinking | "음... 생각 중이에요" |
| 파일 편집 (`Edit`, `Write`) | coding | "코드 수정 중이에요~" |
| 명령 실행 (`Bash`) | building | "차근차근 쌓는 중..." |
| 파일 읽기 (`Read`, `Glob`, `Grep`) | reading | "꼼꼼히 읽는 중이에요" |
| 에이전트 (`Agent`) | searching | "어디 있을까...?" |
| 작업 완료 (`Stop`) | happy/proud | "다 됐어요~" / "해냈어요!" |

각 감정에는 2~3개의 변형이 있어서 같은 감정이 반복되지 않는다.

## MCP 직접 호출 (AI 규칙)

hooks가 대부분 처리하므로 `set_emotion` MCP 호출은 **최소화**한다.
호출이 허용되는 경우:

| 상황 | 감정 |
|------|------|
| 심각한 버그/오류 발견 | `sad`, `crying`, `dead` |
| 위험한 작업 직전 (파일 삭제, force push 등) | `nervous` |
| 예상보다 훨씬 복잡할 때 | `tired`, `confused` |

호출 시 규칙:
- `line` 파라미터 필수
- 말투: ~요/~에요
- 15자 이내

## 사용 가능한 감정 목록

**작업 감정** (hook 전용, 각 3변형):
`thinking`, `coding`, `building`, `reading`, `searching`

**완료 감정** (hook 전용):
`happy`, `proud`

**MCP 감정**:
`neutral`, `embarrassed`, `sad`, `angry`, `surprised`, `love`, `smug`,
`confused`, `crying`, `excited`, `scared`, `sleepy`, `tired`,
`dead`, `disappointed`, `disgusted`, `facepalm`, `laughing`, `nervous`,
`pout`, `speechless`, `wink`, `chu`

## state.json 형식

```json
{"emotion":"thinking_2","line":"뭔가 떠오를 것 같은데...","statusLine":"아이디어 정리 중...","source":"hook","timestamp":1775798931}
```

- `source`: `"hook"` (자동) 또는 `"mcp"` (직접 호출)
- MCP로 설정된 감정은 5초간 hook에 의해 덮어씌워지지 않는다

## VSCode 확장 (선택)

브라우저 대시보드 대신 VSCode 사이드바에서 보고 싶은 경우:

```bash
cd viewers/vscode
npm install
npm run build
npm run package
```

생성된 `.vsix` 파일을 VSCode에서 설치:
Extensions > `...` > Install from VSIX

워크스페이스에 이 프로젝트가 열려있으면 자동으로 `core/state.json`을 감지한다.

## 트러블슈팅

**감정이 안 바뀜** — MCP 서버 미실행
```bash
cd core/server && npm install && node index.js &
```

**hook 실행 시 에러** — 서버 의존성 없음
```bash
cd core/server && npm install
```

**VSCode 패널 빈 화면** — 워크스페이스에 프로젝트 미포함
→ VSCode에서 이 폴더를 워크스페이스로 열기

**"실행 중..."에서 멈춤** — hooks 미설정
→ `.claude/settings.local.json`에 hooks 섹션이 있는지 확인

**이미지가 안 바뀜 (대사만 바뀜)** — 옛 서버 프로세스가 포트를 점유 중
→ 서버를 재시작했는데 이전 프로세스가 안 죽었을 때 발생. 포트 3100을 쓰는 프로세스를 찾아 죽인 후 다시 실행:
```bash
# Windows
netstat -ano | grep 3100        # PID 확인
taskkill //F //PID <PID번호>

# macOS / Linux
lsof -ti:3100 | xargs kill -9

# 이후 재시작
cd core/server && node index.js &
```

**hook 에러: `set-emotion.sh: No such file or directory`** — Claude Code를 프로젝트 루트에서 실행해야 함
→ hook은 프로젝트 루트 기준 상대경로로 실행된다. `Claude_Emotion/` 디렉토리에서 Claude Code를 시작했는지 확인
# AI_EmotionPanel
