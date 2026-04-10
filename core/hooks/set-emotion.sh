#!/usr/bin/env bash
# set-emotion.sh — Claude Code hook emotion setter
# Usage: set-emotion.sh <base_emotion> [statusLine] [line]

set -euo pipefail

BASE_EMOTION="${1:-neutral}"
STATUS_LINE="${2:-}"
LINE="${3:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_FILE="$SCRIPT_DIR/../state.json"
ASSETS_DIR="$SCRIPT_DIR/../../assets"

# ── 1. Read current state ──
CURRENT_SOURCE=""
CURRENT_TS=0
CURRENT_EMOTION=""
CURRENT_VARIANT=""

if [[ -f "$STATE_FILE" ]]; then
  CURRENT_SOURCE=$(sed -n 's/.*"source" *: *"\([^"]*\)".*/\1/p' "$STATE_FILE")
  CURRENT_TS=$(sed -n 's/.*"timestamp" *: *\([0-9]*\).*/\1/p' "$STATE_FILE")
  CURRENT_EMOTION=$(sed -n 's/.*"emotion" *: *"\([^"]*\)".*/\1/p' "$STATE_FILE")
fi

# ── 2. MCP protection: source="mcp" & within 5s → skip ──
NOW=$(date +%s)
if [[ "$CURRENT_SOURCE" == "mcp" ]]; then
  DIFF=$((NOW - CURRENT_TS))
  if [[ $DIFF -le 5 ]]; then
    exit 0
  fi
fi

# ── 3. done → happy or proud random ──
if [[ "$BASE_EMOTION" == "done" ]]; then
  DONE_EMOTIONS=("happy" "proud")
  FINAL_EMOTION="${DONE_EMOTIONS[$((RANDOM % 2))]}"
  case "$FINAL_EMOTION" in
    happy) LINE="다 됐어요~"; STATUS_LINE="작업 완료!" ;;
    proud) LINE="해냈어요!"; STATUS_LINE="작업 완료!" ;;
  esac
  printf '{"emotion":"%s","line":"%s","statusLine":"%s","source":"hook","timestamp":%d}\n' \
    "$FINAL_EMOTION" "$LINE" "$STATUS_LINE" "$NOW" > "$STATE_FILE"
  exit 0
fi

# ── 4. Count variants for this base emotion ──
VARIANTS=()
# Base file
if [[ -f "$ASSETS_DIR/${BASE_EMOTION}.webp" ]]; then
  VARIANTS+=("$BASE_EMOTION")
fi
# _2, _3, ... variants
for i in 2 3 4 5 6 7 8 9; do
  if [[ -f "$ASSETS_DIR/${BASE_EMOTION}_${i}.webp" ]]; then
    VARIANTS+=("${BASE_EMOTION}_${i}")
  else
    break
  fi
done

VARIANT_COUNT=${#VARIANTS[@]}

if [[ $VARIANT_COUNT -eq 0 ]]; then
  # No variant assets found, use base emotion as-is
  FINAL_EMOTION="$BASE_EMOTION"
else
  # Extract current base for comparison
  CURRENT_BASE=$(echo "$CURRENT_EMOTION" | sed 's/_[0-9]*$//')

  if [[ "$CURRENT_BASE" == "$BASE_EMOTION" && $VARIANT_COUNT -gt 1 ]]; then
    # Same base emotion: exclude current variant
    FILTERED=()
    for v in "${VARIANTS[@]}"; do
      if [[ "$v" != "$CURRENT_EMOTION" ]]; then
        FILTERED+=("$v")
      fi
    done
    FINAL_EMOTION="${FILTERED[$((RANDOM % ${#FILTERED[@]}))]}"
  else
    # Different base: free random
    FINAL_EMOTION="${VARIANTS[$((RANDOM % VARIANT_COUNT))]}"
  fi
fi

# ── 5. resolve_variant: auto-map line & statusLine per variant ──
if [[ -z "$LINE" ]]; then
  case "$FINAL_EMOTION" in
    thinking)    LINE="음... 생각 중이에요";        STATUS_LINE="프롬프트 분석 중..." ;;
    thinking_2)  LINE="뭔가 떠오를 것 같은데...";   STATUS_LINE="아이디어 정리 중..." ;;
    thinking_3)  LINE="으음... 이건 좀 고민되네요";  STATUS_LINE="깊이 생각하는 중..." ;;
    coding)      LINE="코드 수정 중이에요~";         STATUS_LINE="파일 수정 중..." ;;
    coding_2)    LINE="열심히 쓰는 중...!";          STATUS_LINE="코드 작성 중..." ;;
    coding_3)    LINE="으아아 안 돼!!";              STATUS_LINE="코드 수정 중..." ;;
    building)    LINE="차근차근 쌓는 중...";         STATUS_LINE="명령 실행 중..." ;;
    building_2)  LINE="제발 무너지지 마...";         STATUS_LINE="빌드 중..." ;;
    building_3)  LINE="무너지면 안 돼...!!";         STATUS_LINE="실행 중..." ;;
    reading)     LINE="꼼꼼히 읽는 중이에요";        STATUS_LINE="파일 읽는 중..." ;;
    reading_2)   LINE="서류가 너무 많아요...";       STATUS_LINE="코드 분석 중..." ;;
    reading_3)   LINE="읽을 게 너무 많아요...";      STATUS_LINE="탐색 중..." ;;
    searching)   LINE="어디 있을까...?";             STATUS_LINE="에이전트 조사 중..." ;;
    searching_2) LINE="어딨지...?";                  STATUS_LINE="검색 중..." ;;
    searching_3) LINE="아직 못 찾았어요...";         STATUS_LINE="탐색 중..." ;;
    *)           LINE="";                            STATUS_LINE="" ;;
  esac
fi

# ── 6. Write state.json (overwrite in-place for fs.watch inode preservation) ──
printf '{"emotion":"%s","line":"%s","statusLine":"%s","source":"hook","timestamp":%d}\n' \
  "$FINAL_EMOTION" "$LINE" "$STATUS_LINE" "$NOW" > "$STATE_FILE"
