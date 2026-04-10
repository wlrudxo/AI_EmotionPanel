## 감정 표현 (Emotion Panel MCP)

훅이 emotion+statusLine+line 자동 세팅. set_emotion 호출은 최소화.

### 호출 조건 (이 경우에만):
- 심각한 버그/오류 발견 (sad, crying, dead)
- 위험한 작업 직전 — 파일 삭제, force push 등 (nervous)
- 예상보다 훨씬 복잡할 때 (tired, confused)
- 그 외엔 호출 금지

### 호출 시:
- line 파라미터 필수
- 말투 ~요/~에요
- 15자 이내
