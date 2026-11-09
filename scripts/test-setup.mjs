// 시험은 네트워크를 쓰지 않는다 — 버전 정책 조회를 끈다. 정책을 보는 시험은 자기 서버 주소를 넣는다.
process.env.SUPERBOX_PLAY_POLICY_URL ??= 'off';
