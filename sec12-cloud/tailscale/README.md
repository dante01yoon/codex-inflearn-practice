# Codex Cloud × Tailscale — 사내 서버 연결하기

섹션 12 「[GPT6.1 업데이트] Codex Cloud에서 Tailscale로 사내 서버 연결하기」 수업 자료입니다.

- 실습 저장소(Codex에게 맡길 저장소): https://github.com/dante01yoon/codex-tailscale-demo
- 따라 하기 문서: https://github.com/dante01yoon/codex-tailscale-demo/blob/main/TUTORIAL.md
- 사내 API 서버(Docker로 개인 tailnet에 올림): https://github.com/dante01yoon/codex-tailscale-demo-server
- 정책 예시: [tailscale-policy.hujson](tailscale-policy.hujson) — Codex(`tag:codex`)는 데모 API의 8080만, 9090은 막힘. 회사 tailnet에 그대로 붙여 넣지 마세요.

## 수업에서 나온 결과 (2026-10-08)

| 환경 | 결과 |
|---|---|
| VPN 없음 | HTTP 503, `vpn_configured: false`, 코드 수정 안 함 |
| Tailscale 연결 | 실제 v2 응답 확인 → `inventory/client.py` +11 −2, 테스트 2개 통과(1분 41초) |
| 9090 호출 | 연결 시간 초과, 서버 기록 0건 |

인증 키(`tskey-auth-…`)는 저장소에 올리지 않습니다. Codex 환경의 Advanced › VPN › Tailscale 칸에만 넣으세요.
