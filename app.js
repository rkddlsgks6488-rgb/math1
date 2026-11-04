const generateProblem = window.generateProblem;

// MediaPipe Tasks Vision CDN
const MP_VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MP_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MP_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

// ================= SOUND SYNTHESIZER (Web Audio API) =================
class SoundFX {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTone(freq, type = 'sine', duration = 0.15, vol = 0.25, slideTo = null) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    }

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  pop() {
    this.playTone(520, 'triangle', 0.12, 0.35, 140);
  }

  repCount(count) {
    const base = 360 + Math.min(count, 10) * 45;
    this.playTone(base, 'sine', 0.16, 0.3, base * 1.35);
  }

  correct() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => {
      setTimeout(() => this.playTone(n, 'triangle', 0.22, 0.3), i * 85);
    });
  }

  wrong() {
    this.playTone(190, 'sawtooth', 0.25, 0.28, 130);
    setTimeout(() => this.playTone(150, 'sawtooth', 0.3, 0.28, 110), 140);
  }

  tick() {
    this.playTone(880, 'sine', 0.06, 0.15);
  }

  fanfare() {
    const melody = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
    const delays = [0, 120, 240, 360, 520, 660];
    melody.forEach((n, i) => {
      setTimeout(() => this.playTone(n, 'triangle', 0.28, 0.35), delays[i]);
    });
  }
}

const sfx = new SoundFX();

// ================= STATE & CONFIG =================
const state = {
  mode: 'balloon',          // 'balloon' | 'squat'
  diff: 'mild',             // 'mild' | 'spicy' | 'mala' | 'nuclear'
  exerciseType: 'both',     // 'both' | 'squat' | 'jump'
  submitRule: 'bell',       // 'bell' | 'instant'
  totalRounds: 7,
  currentRound: 1,
  roundTimeLeft: 25,
  roundTimerId: null,
  phase: 'setup',           // 'setup' | 'ready' | 'playing' | 'roundEnd' | 'gameOver'
  showSkeleton: true,
  useCamera: false,
  poseLandmarker: null,
  aiReady: false,

  score: { blue: 0, red: 0 },
  problem: null,

  // 각 팀 플레이어 포즈 및 운동 상태
  players: {
    blue: createPlayerState('blue'),
    red: createPlayerState('red')
  },

  // 풍선 및 제출벨 오브젝트
  targets: [],
  particles: []
};

function createPlayerState(team) {
  return {
    team,
    detected: false,
    landmarks: null,         // 화면 정규화 좌표 (거울 반전 적용된 mx, my)
    effectors: [],           // 손/머리 타겟 포인트 [{x, y, label}]
    shoulderY: null,
    hipY: null,
    torsoLen: 0.22,
    baselineY: null,
    calibSamples: [],
    poseState: 'NEUTRAL',    // 'NEUTRAL' | 'SQUAT_DOWN' | 'JUMP_AIR'
    repCount: 0,
    lastRepTime: 0,
    penaltyUntil: 0,         // 오답 선택 시 잠깐 페널티 쿨타임
    statusMessage: '대기 중'
  };
}

// ================= DOM ELEMENTS =================
const video = document.getElementById('webcam');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const blueScoreEl = document.getElementById('blueScore');
const redScoreEl = document.getElementById('redScore');
const bluePoseStatusEl = document.getElementById('bluePoseStatus');
const redPoseStatusEl = document.getElementById('redPoseStatus');

const currentModeBadge = document.getElementById('currentModeBadge');
const currentDiffBadge = document.getElementById('currentDiffBadge');
const roundCounterEl = document.getElementById('roundCounter');
const timerDisplayEl = document.getElementById('timerDisplay');
const equationBoxEl = document.getElementById('equationBox');
const equationHintEl = document.getElementById('equationHint');
const equationMainEl = document.getElementById('equationMain');

const centerAnnouncement = document.getElementById('centerAnnouncement');
const announcementTitle = document.getElementById('announcementTitle');
const announcementSub = document.getElementById('announcementSub');

const setupModal = document.getElementById('setupModal');
const resultModal = document.getElementById('resultModal');
const aiSpinner = document.getElementById('aiSpinner');
const aiStatusText = document.getElementById('aiStatusText');

// ================= MEDIAPIPE POSE INITIALIZATION =================
async function initMediaPipePose() {
  try {
    aiStatusText.textContent = 'AI 자세 인식 모델(MediaPipe Pose) 불러오는 중...';
    const vision = await import(MP_VISION_URL);
    const { PoseLandmarker, FilesetResolver } = vision;

    const filesetResolver = await FilesetResolver.forVisionTasks(MP_WASM_URL);
    state.poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: MP_MODEL_URL,
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numPoses: 2,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    state.aiReady = true;
    aiSpinner.classList.add('ready');
    aiStatusText.textContent = '✅ AI 2인 실시간 자세 인식(스쿼트/점프/손 추적) 준비 완료!';
  } catch (err) {
    console.warn('MediaPipe Pose 로드 실패 (터치/키보드 모드로 동작 가능):', err);
    aiStatusText.textContent = '⚠️ 오프라인/모델 로드 제한: 마우스·터치·키보드 모드로 즉시 플레이 가능';
  }
}

initMediaPipePose();

// ================= CAMERA SETUP =================
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user'
      },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
    state.useCamera = true;
    return true;
  } catch (err) {
    alert('웹캠을 열 수 없어 [교사용 마우스/터치/키보드 모드]로 시작합니다.\n(' + err.message + ')');
    state.useCamera = false;
    return false;
  }
}

// ================= RESIZE CANVAS =================
function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ================= POSE PROCESSING (2 PLAYERS: LEFT BLUE / RIGHT RED) =================
let lastVideoTime = -1;

function detectPoses(nowMs) {
  const blueP = state.players.blue;
  const redP = state.players.red;
  blueP.detected = false;
  redP.detected = false;
  blueP.effectors = [];
  redP.effectors = [];

  if (!state.useCamera || !state.poseLandmarker || video.readyState < 2) {
    updatePoseHUD();
    return;
  }

  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;

  let result;
  try {
    result = state.poseLandmarker.detectForVideo(video, nowMs);
  } catch (e) {
    return;
  }

  if (!result || !result.landmarks || result.landmarks.length === 0) {
    updatePoseHUD();
    return;
  }

  // 거울 모드 변환: mx = 1 - x, my = y
  for (const rawLm of result.landmarks) {
    const lm = rawLm.map(pt => ({
      x: 1 - pt.x,
      y: pt.y,
      z: pt.z,
      visibility: pt.visibility ?? 1
    }));

    // 중심 X 좌표 계산 (코, 양쪽 어깨 평균)
    const nose = lm[0];
    const lShoulder = lm[11];
    const rShoulder = lm[12];
    const centerX = (nose.x + lShoulder.x + rShoulder.x) / 3;

    const targetPlayer = centerX < 0.5 ? blueP : redP;
    // 이미 해당 구역에 플레이어가 배정되었다면 건너뜀
    if (targetPlayer.detected) continue;

    targetPlayer.detected = true;
    targetPlayer.landmarks = lm;

    // 손 끝(검지 19, 20 / 손목 15, 16) 및 머리(코 0) 타겟 포인트 추출
    const handIndices = [
      { idx: 19, wrist: 15, label: '손' },
      { idx: 20, wrist: 16, label: '손' }
    ];
    for (const h of handIndices) {
      const tip = lm[h.idx];
      const wrist = lm[h.wrist];
      if ((tip && tip.visibility > 0.35) || (wrist && wrist.visibility > 0.35)) {
        const px = tip ? tip.x * 0.7 + wrist.x * 0.3 : wrist.x;
        const py = tip ? tip.y * 0.7 + wrist.y * 0.3 : wrist.y;
        targetPlayer.effectors.push({ x: px, y: py, kind: 'hand' });
      }
    }
    if (nose && nose.visibility > 0.4) {
      targetPlayer.effectors.push({ x: nose.x, y: nose.y, kind: 'head' });
    }

    // 스쿼트 & 점프 분석용 어깨/골반 높이 계산
    processSquatAndJump(targetPlayer, lm, nowMs);
  }

  updatePoseHUD();
}

function processSquatAndJump(player, lm, nowMs) {
  const lSh = lm[11];
  const rSh = lm[12];
  const lHip = lm[23];
  const rHip = lm[24];

  if (!lSh || !rSh) return;

  const shoulderY = (lSh.y + rSh.y) / 2;
  player.shoulderY = shoulderY;

  if (lHip && rHip && lHip.visibility > 0.3 && rHip.visibility > 0.3) {
    const hipY = (lHip.y + rHip.y) / 2;
    player.hipY = hipY;
    const rawTorso = Math.abs(hipY - shoulderY);
    if (rawTorso > 0.08 && rawTorso < 0.55) {
      player.torsoLen = player.torsoLen * 0.85 + rawTorso * 0.15;
    }
  }

  // 기준 높이(baselineY) 자동 캘리브레이션
  if (player.baselineY === null) {
    player.calibSamples.push(shoulderY);
    if (player.calibSamples.length >= 12) {
      const avg = player.calibSamples.reduce((a, b) => a + b, 0) / player.calibSamples.length;
      player.baselineY = avg;
      player.calibSamples = [];
    }
    player.statusMessage = '📏 키 기준점 측정 중...';
    return;
  }

  // 스쿼트/점프 기준 임계값 (체형 비례)
  const squatDownDelta = Math.max(0.055, player.torsoLen * 0.27);
  const squatReturnDelta = squatDownDelta * 0.45;
  const jumpUpDelta = Math.max(0.048, player.torsoLen * 0.21);
  const jumpLandDelta = jumpUpDelta * 0.45;

  const diffY = shoulderY - player.baselineY; // 양수면 아래로 내려감(스쿼트), 음수면 위로 올라감(점프)

  const allowSquat = state.exerciseType === 'both' || state.exerciseType === 'squat';
  const allowJump = state.exerciseType === 'both' || state.exerciseType === 'jump';

  if (player.poseState === 'NEUTRAL') {
    if (allowSquat && diffY > squatDownDelta) {
      player.poseState = 'SQUAT_DOWN';
      player.statusMessage = '⬇️ 스쿼트 내려감! 일어나세요!';
    } else if (allowJump && -diffY > jumpUpDelta) {
      player.poseState = 'JUMP_AIR';
      player.statusMessage = '⬆️ 점프!!';
    } else {
      // 가만히 서 있을 때 기준점을 아주 천천히 보정 (드리프트 방지)
      if (Math.abs(diffY) < squatDownDelta * 0.35) {
        player.baselineY = player.baselineY * 0.992 + shoulderY * 0.008;
      }
      player.statusMessage = '✅ 자세 인식 중';
    }
  } else if (player.poseState === 'SQUAT_DOWN') {
    if (diffY < squatReturnDelta) {
      player.poseState = 'NEUTRAL';
      registerExerciseRep(player, '스쿼트', nowMs);
    }
  } else if (player.poseState === 'JUMP_AIR') {
    if (-diffY < jumpLandDelta) {
      player.poseState = 'NEUTRAL';
      registerExerciseRep(player, '점프', nowMs);
    }
  }
}

function registerExerciseRep(player, moveName, nowMs) {
  if (state.phase !== 'playing' || state.mode !== 'squat') return;
  if (nowMs < player.penaltyUntil) return;
  if (nowMs - player.lastRepTime < 330) return; // 너무 빠른 중복 카운트 방지

  player.lastRepTime = nowMs;
  player.repCount += 1;
  player.statusMessage = `🔥 ${moveName} ${player.repCount}회 성공!`;
  sfx.repCount(player.repCount);

  const cx = player.team === 'blue' ? canvas.width * 0.25 : canvas.width * 0.75;
  const cy = canvas.height * 0.55;
  spawnParticles(cx, cy, player.team === 'blue' ? '#60a5fa' : '#fb7185', 18);

  // 즉시 통과 모드('instant')일 때는 정답 횟수에 도달하면 바로 승리 판정!
  if (state.submitRule === 'instant' && state.problem) {
    if (player.repCount === state.problem.answer) {
      handleRoundWin(player.team, `${moveName} ${player.repCount}회 정확히 달성!`);
    }
  }
}

function recalibratePoses() {
  ['blue', 'red'].forEach(team => {
    const p = state.players[team];
    p.baselineY = p.shoulderY ?? null;
    p.calibSamples = [];
    p.poseState = 'NEUTRAL';
  });
  showAnnouncement('📏 기준 자세 재설정!', '두 선수 모두 바른 자세로 서 주세요!', 1100);
}

function updatePoseHUD() {
  const b = state.players.blue;
  const r = state.players.red;

  bluePoseStatusEl.textContent = b.detected ? b.statusMessage : '카메라 대기 / 터치 가능';
  bluePoseStatusEl.classList.toggle('detected', b.detected);

  redPoseStatusEl.textContent = r.detected ? r.statusMessage : '카메라 대기 / 터치 가능';
  redPoseStatusEl.classList.toggle('detected', r.detected);
}

// ================= GAME FLOW & ROUNDS =================
function startGame() {
  sfx.init();
  state.score.blue = 0;
  state.score.red = 0;
  state.currentRound = 1;
  updateScoreHUD();
  updateMetaBadges();

  setupModal.classList.add('hidden');
  resultModal.classList.add('hidden');

  startRound();
}

function updateMetaBadges() {
  const modeNames = {
    balloon: '🎈 풍선 터뜨리기',
    squat: '🏋️ 스쿼트/점프 배틀'
  };
  const diffInfo = {
    mild: { text: '🌱 순한맛', cls: 'mild' },
    spicy: { text: '🌶️ 매운맛', cls: 'spicy' },
    mala: { text: '🔥 마라맛', cls: 'mala' },
    nuclear: { text: '☢️ 핵폭탄맛', cls: 'nuclear' }
  };

  currentModeBadge.textContent = modeNames[state.mode];
  const d = diffInfo[state.diff];
  currentDiffBadge.textContent = d.text;
  currentDiffBadge.className = `diff-pill ${d.cls}`;

  equationBoxEl.classList.toggle('nuclear-box', state.diff === 'nuclear');
}

function updateScoreHUD() {
  blueScoreEl.textContent = state.score.blue;
  redScoreEl.textContent = state.score.red;
  roundCounterEl.textContent = `ROUND ${state.currentRound} / ${state.totalRounds}`;
}

function startRound() {
  clearInterval(state.roundTimerId);
  state.problem = generateProblem(state.diff, state.mode);
  state.targets = [];

  // 선수 카운트 초기화
  ['blue', 'red'].forEach(t => {
    state.players[t].repCount = 0;
    state.players[t].poseState = 'NEUTRAL';
    state.players[t].penaltyUntil = 0;
  });

  updateScoreHUD();
  equationHintEl.textContent = state.problem.hint;
  equationMainEl.innerHTML = state.problem.html;

  // 라운드 제한시간 (핵폭탄맛/스쿼트 모드는 여유 부여)
  state.roundTimeLeft = state.mode === 'squat' ? 30 : state.diff === 'nuclear' ? 25 : 20;
  updateTimerUI();

  state.phase = 'ready';
  showAnnouncement(
    `ROUND ${state.currentRound}`,
    state.mode === 'balloon'
      ? '비례식을 암산하고 정답 풍선을 터뜨리세요!'
      : '비례식의 □ 만큼 스쿼트/점프하세요!',
    1200
  );

  setTimeout(() => {
    if (state.phase !== 'ready') return;
    state.phase = 'playing';
    buildRoundTargets();
    state.roundTimerId = setInterval(() => {
      state.roundTimeLeft -= 1;
      updateTimerUI();
      if (state.roundTimeLeft <= 5 && state.roundTimeLeft > 0) {
        sfx.tick();
      }
      if (state.roundTimeLeft <= 0) {
        clearInterval(state.roundTimerId);
        handleRoundTimeout();
      }
    }, 1000);
  }, 1200);
}

function updateTimerUI() {
  timerDisplayEl.textContent = `⏱️ ${state.roundTimeLeft}s`;
  timerDisplayEl.classList.toggle('urgent', state.roundTimeLeft <= 5);
}

function buildRoundTargets() {
  state.targets = [];
  if (!state.problem) return;

  const { answer, wrong } = state.problem;

  if (state.mode === 'balloon') {
    // 청팀(왼쪽)과 홍팀(오른쪽) 각각 좌/우 풍선 배치
    const blueLeftIsAnswer = Math.random() < 0.5;
    const redLeftIsAnswer = Math.random() < 0.5;

    // 청팀 풍선 2개 (x: 0.13, 0.37)
    state.targets.push(
      createBalloon('blue', 'left', 0.135, 0.34, blueLeftIsAnswer ? answer : wrong, blueLeftIsAnswer),
      createBalloon('blue', 'right', 0.365, 0.34, blueLeftIsAnswer ? wrong : answer, !blueLeftIsAnswer)
    );

    // 홍팀 풍선 2개 (x: 0.635, 0.865)
    state.targets.push(
      createBalloon('red', 'left', 0.635, 0.34, redLeftIsAnswer ? answer : wrong, redLeftIsAnswer),
      createBalloon('red', 'right', 0.865, 0.34, redLeftIsAnswer ? wrong : answer, !redLeftIsAnswer)
    );
  } else if (state.mode === 'squat' && state.submitRule === 'bell') {
    // 스쿼트/점프 모드에서 '정답벨 터치 확정' 규칙일 때 각 선수 머리 위에 정답 제출벨 배치
    state.targets.push(
      createSubmitBell('blue', 0.25, 0.22),
      createSubmitBell('red', 0.75, 0.22)
    );
  }
}

function createBalloon(team, side, normX, normY, value, isCorrect) {
  return {
    kind: 'balloon',
    team,
    side,
    baseX: normX,
    baseY: normY,
    x: normX,
    y: normY,
    radius: 0.068, // 화면 너비 대비 비율
    value,
    isCorrect,
    hoverProgress: 0,
    popped: false,
    phaseOffset: Math.random() * Math.PI * 2
  };
}

function createSubmitBell(team, normX, normY) {
  return {
    kind: 'bell',
    team,
    baseX: normX,
    baseY: normY,
    x: normX,
    y: normY,
    radius: 0.058,
    hoverProgress: 0
  };
}

// ================= TARGET COLLISION & GAME JUDGEMENT =================
function updateTargetsAndCheckHits(dt, nowMs) {
  if (state.phase !== 'playing') return;

  const speedMult = state.diff === 'nuclear' ? 3.2 : 2.0;
  const swayAmp = state.diff === 'nuclear' ? 0.018 : 0.008;

  for (const t of state.targets) {
    if (t.popped) continue;

    if (t.kind === 'balloon') {
      t.x = t.baseX + Math.sin(nowMs * 0.002 * speedMult + t.phaseOffset) * swayAmp;
      t.y = t.baseY + Math.cos(nowMs * 0.0025 * speedMult + t.phaseOffset) * 0.014;
    }

    const player = state.players[t.team];
    if (nowMs < player.penaltyUntil) {
      t.hoverProgress = 0;
      continue;
    }

    // 플레이어의 손/머리 좌표가 풍선 반경 안에 들어왔는지 확인
    const hitRadiusPx = Math.min(canvas.width, canvas.height) * (t.radius + 0.03);
    const txPx = t.x * canvas.width;
    const tyPx = t.y * canvas.height;

    let touching = false;
    for (const eff of player.effectors) {
      const exPx = eff.x * canvas.width;
      const eyPx = eff.y * canvas.height;
      const dist = Math.hypot(exPx - txPx, eyPx - tyPx);
      if (dist <= hitRadiusPx) {
        touching = true;
        break;
      }
    }

    if (touching) {
      t.hoverProgress += dt / 0.20; // 0.20초 유지 시 터짐
      if (t.hoverProgress >= 1) {
        t.hoverProgress = 0;
        triggerTargetAction(t, nowMs);
      }
    } else {
      t.hoverProgress = Math.max(0, t.hoverProgress - dt * 3.5);
    }
  }
}

function triggerTargetAction(target, nowMs) {
  if (state.phase !== 'playing') return;
  const player = state.players[target.team];
  if (nowMs < player.penaltyUntil) return;

  const px = target.x * canvas.width;
  const py = target.y * canvas.height;

  if (target.kind === 'balloon') {
    target.popped = true;
    sfx.pop();
    spawnParticles(px, py, target.isCorrect ? '#facc15' : '#94a3b8', 28);

    if (target.isCorrect) {
      handleRoundWin(target.team, `정답 풍선 [${target.value}] 터뜨리기 성공!`);
    } else {
      // 오답 풍선 터뜨림 -> 1.5초 페널티 후 풍선 재생성
      sfx.wrong();
      player.penaltyUntil = nowMs + 1500;
      player.statusMessage = '❌ 오답! 1.5초 대기!';
      setTimeout(() => {
        target.popped = false;
      }, 1500);
    }
  } else if (target.kind === 'bell') {
    // 스쿼트/점프 모드에서 제출벨 터치!
    if (player.repCount === state.problem.answer) {
      spawnParticles(px, py, '#facc15', 35);
      handleRoundWin(target.team, `정답 ${player.repCount}회 달성 후 벨 터치 성공!`);
    } else {
      sfx.wrong();
      const wrongCount = player.repCount;
      player.repCount = 0;
      player.penaltyUntil = nowMs + 1400;
      player.statusMessage = `❌ ${wrongCount}회는 오답! 0회부터 다시!`;
      spawnParticles(px, py, '#ef4444', 20);
    }
  }
}

function handleRoundWin(winnerTeam, reasonText) {
  if (state.phase !== 'playing') return;
  state.phase = 'roundEnd';
  clearInterval(state.roundTimerId);

  state.score[winnerTeam] += 1;
  updateScoreHUD();
  sfx.correct();

  // 정답 숫자를 네모 박스에 채워 보여주기
  equationMainEl.innerHTML = state.problem.html.replace('□', state.problem.answer);
  equationHintEl.textContent = `💡 해설: ${state.problem.explanation}`;

  const teamName = winnerTeam === 'blue' ? '🔵 청팀' : '🔴 홍팀';
  const color = winnerTeam === 'blue' ? '#60a5fa' : '#fb7185';
  spawnParticles(canvas.width * (winnerTeam === 'blue' ? 0.25 : 0.75), canvas.height * 0.4, color, 55);

  showAnnouncement(`${teamName} 득점! 🎉`, `${reasonText}\n(${state.problem.explanation})`, 2600);

  setTimeout(() => {
    advanceNextRound();
  }, 2700);
}

function handleRoundTimeout() {
  if (state.phase !== 'playing') return;
  state.phase = 'roundEnd';
  sfx.wrong();

  equationMainEl.innerHTML = state.problem.html.replace('□', state.problem.answer);
  equationHintEl.textContent = `⏰ 시간 초과! 해설: ${state.problem.explanation}`;

  showAnnouncement('⏰ 시간 초과!', `정답은 [${state.problem.answer}] 이었습니다!`, 2500);

  setTimeout(() => {
    advanceNextRound();
  }, 2600);
}

function advanceNextRound() {
  if (state.currentRound >= state.totalRounds) {
    finishGame();
  } else {
    state.currentRound += 1;
    startRound();
  }
}

function finishGame() {
  state.phase = 'gameOver';
  clearInterval(state.roundTimerId);
  sfx.fanfare();

  const b = state.score.blue;
  const r = state.score.red;
  document.getElementById('finalBlueScore').textContent = b;
  document.getElementById('finalRedScore').textContent = r;

  const winnerTitle = document.getElementById('winnerTitle');
  const winnerSubtitle = document.getElementById('winnerSubtitle');
  const winnerTrophy = document.getElementById('winnerTrophy');

  if (b > r) {
    winnerTrophy.textContent = '🏆🔵';
    winnerTitle.textContent = '청팀 최종 승리!';
    winnerSubtitle.textContent = `${b} : ${r} 로 청팀이 비례식 밸런스 왕에 등극했습니다!`;
  } else if (r > b) {
    winnerTrophy.textContent = '🏆🔴';
    winnerTitle.textContent = '홍팀 최종 승리!';
    winnerSubtitle.textContent = `${r} : ${b} 로 홍팀이 비례식 밸런스 왕에 등극했습니다!`;
  } else {
    winnerTrophy.textContent = '🤝✨';
    winnerTitle.textContent = '무승부! 막상막하의 승부!';
    winnerSubtitle.textContent = `${b} : ${r} 두 팀 모두 환상적인 비례식 실력을 보여주었습니다!`;
  }

  resultModal.classList.remove('hidden');
}

function showAnnouncement(title, sub, durationMs = 1500) {
  announcementTitle.textContent = title;
  announcementSub.textContent = sub;
  centerAnnouncement.classList.remove('hidden');
  setTimeout(() => {
    centerAnnouncement.classList.add('hidden');
  }, durationMs);
}

// ================= RENDERING (CANVAS) =================
const SKELETON_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28]
];

function renderStage(nowMs, dt) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // 1. 웹캠 배경 (거울 모드 좌우 반전)
  if (state.useCamera && video.readyState >= 2) {
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    // 화면 비율 유지 커버 렌더링
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    const scale = Math.max(w / vw, h / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.restore();

    // 가독성을 위한 살짝 어두운 팀 컬러 그라데이션 오버레이
    const gradBlue = ctx.createLinearGradient(0, 0, w * 0.5, 0);
    gradBlue.addColorStop(0, 'rgba(37, 99, 235, 0.24)');
    gradBlue.addColorStop(1, 'rgba(15, 23, 42, 0.12)');
    ctx.fillStyle = gradBlue;
    ctx.fillRect(0, 0, w * 0.5, h);

    const gradRed = ctx.createLinearGradient(w * 0.5, 0, w, 0);
    gradRed.addColorStop(0, 'rgba(15, 23, 42, 0.12)');
    gradRed.addColorStop(1, 'rgba(225, 29, 72, 0.24)');
    ctx.fillStyle = gradRed;
    ctx.fillRect(w * 0.5, 0, w * 0.5, h);
  } else {
    // 카메라 미사용 시 깔끔한 경기장 배경
    const gradBlue = ctx.createLinearGradient(0, 0, w * 0.5, h);
    gradBlue.addColorStop(0, '#0f2547');
    gradBlue.addColorStop(1, '#0b1528');
    ctx.fillStyle = gradBlue;
    ctx.fillRect(0, 0, w * 0.5, h);

    const gradRed = ctx.createLinearGradient(w * 0.5, 0, w, h);
    gradRed.addColorStop(0, '#0b1528');
    gradRed.addColorStop(1, '#3b1026');
    ctx.fillStyle = gradRed;
    ctx.fillRect(w * 0.5, 0, w * 0.5, h);
  }

  // 2. 각 팀 관절 스켈레톤 및 손 커서 렌더링
  drawPlayerOverlay(state.players.blue, '#60a5fa', nowMs);
  drawPlayerOverlay(state.players.red, '#fb7185', nowMs);

  // 3. 스쿼트/점프 모드 전용: 실시간 자세 기준선 + 횟수 대형 카운터 표시
  if (state.mode === 'squat') {
    drawSquatHUD(state.players.blue, 0, w * 0.5, h, '#3b82f6');
    drawSquatHUD(state.players.red, w * 0.5, w * 0.5, h, '#f43f5e');
  }

  // 4. 풍선 / 제출벨 렌더링
  for (const t of state.targets) {
    if (t.popped) continue;
    if (t.kind === 'balloon') {
      drawBalloon(t, w, h);
    } else if (t.kind === 'bell') {
      drawBell(t, w, h, nowMs);
    }
  }

  // 5. 파티클 효과 렌더링
  updateAndDrawParticles(dt);
}

function drawPlayerOverlay(player, color, nowMs) {
  const w = canvas.width;
  const h = canvas.height;

  // 페널티 상태 표시
  if (nowMs < player.penaltyUntil) {
    const zoneX = player.team === 'blue' ? 0 : w * 0.5;
    ctx.save();
    ctx.fillStyle = 'rgba(239, 68, 68, 0.26)';
    ctx.fillRect(zoneX, 0, w * 0.5, h);
    ctx.font = 'bold 28px Jua, sans-serif';
    ctx.fillStyle = '#fecaca';
    ctx.textAlign = 'center';
    ctx.fillText('⏳ 오답 페널티 대기 중!', zoneX + w * 0.25, h * 0.85);
    ctx.restore();
  }

  if (!player.detected || !player.landmarks) return;

  const lm = player.landmarks;

  if (state.showSkeleton) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (const [i, j] of SKELETON_CONNECTIONS) {
      const a = lm[i];
      const b = lm[j];
      if (a && b && a.visibility > 0.3 && b.visibility > 0.3) {
        ctx.beginPath();
        ctx.moveTo(a.x * w, a.y * h);
        ctx.lineTo(b.x * w, b.y * h);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // 손/머리 타겟 포인트 표시
  for (const eff of player.effectors) {
    const ex = eff.x * w;
    const ey = eff.y * h;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ex, ey, eff.kind === 'hand' ? 22 : 16, 0, Math.PI * 2);
    ctx.fillStyle = eff.kind === 'hand' ? 'rgba(250, 204, 21, 0.45)' : 'rgba(255, 255, 255, 0.25)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#facc15';
    ctx.stroke();

    if (eff.kind === 'hand') {
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✋', ex, ey);
    }
    ctx.restore();
  }
}

function drawSquatHUD(player, offsetX, zoneW, h, teamColor) {
  const centerX = offsetX + zoneW * 0.5;

  // 1) 어깨 기준선 및 스쿼트/점프 가이드 라인 표시
  if (player.detected && player.baselineY !== null) {
    const basePy = player.baselineY * h;
    const squatPy = (player.baselineY + Math.max(0.055, player.torsoLen * 0.27)) * h;
    const jumpPy = (player.baselineY - Math.max(0.048, player.torsoLen * 0.21)) * h;

    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;

    // 스쿼트 인정선
    if (state.exerciseType !== 'jump') {
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.85)';
      ctx.beginPath();
      ctx.moveTo(offsetX + 30, squatPy);
      ctx.lineTo(offsetX + zoneW - 30, squatPy);
      ctx.stroke();
      ctx.fillStyle = '#86efac';
      ctx.font = 'bold 14px Pretendard, sans-serif';
      ctx.fillText('⬇️ 스쿼트 인정선 (어깨를 이 선 아래로!)', offsetX + 36, squatPy + 18);
    }

    // 점프 인정선
    if (state.exerciseType !== 'squat') {
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.85)';
      ctx.beginPath();
      ctx.moveTo(offsetX + 30, jumpPy);
      ctx.lineTo(offsetX + zoneW - 30, jumpPy);
      ctx.stroke();
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 14px Pretendard, sans-serif';
      ctx.fillText('⬆️ 점프 인정선 (어깨를 이 선 위로!)', offsetX + 36, jumpPy - 8);
    }

    // 현재 어깨 높이 마커
    if (player.shoulderY !== null) {
      const curPy = player.shoulderY * h;
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(centerX, curPy, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 2) 하단 대형 카운터 배지
  const cardW = 240;
  const cardH = 110;
  const cardX = centerX - cardW / 2;
  const cardY = h - cardH - 22;

  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
  ctx.strokeStyle = teamColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 20);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'bold 15px Pretendard, sans-serif';
  ctx.fillText('현재 스쿼트 / 점프 횟수', centerX, cardY + 28);

  ctx.fillStyle = '#facc15';
  ctx.font = '48px Jua, sans-serif';
  ctx.fillText(`${player.repCount} 회`, centerX, cardY + 84);
  ctx.restore();
}

function drawBalloon(b, w, h) {
  const cx = b.x * w;
  const cy = b.y * h;
  const r = Math.min(w, h) * b.radius;

  ctx.save();

  // 풍선 끈
  ctx.beginPath();
  ctx.moveTo(cx, cy + r);
  ctx.quadraticCurveTo(cx - 8, cy + r + 20, cx + 4, cy + r + 38);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // 풍선 본체 그라데이션
  const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  if (b.team === 'blue') {
    grad.addColorStop(0, '#93c5fd');
    grad.addColorStop(0.55, '#2563eb');
    grad.addColorStop(1, '#1e3a8a');
  } else {
    grad.addColorStop(0, '#fda4af');
    grad.addColorStop(0.55, '#e11d48');
    grad.addColorStop(1, '#881337');
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // 터치 게이지 링
  if (b.hoverProgress > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * b.hoverProgress);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 6;
    ctx.stroke();
  }

  // 풍선 안의 숫자
  ctx.font = `${Math.round(r * 0.92)}px Jua, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 6;
  ctx.fillText(String(b.value), cx, cy + 2);

  ctx.restore();
}

function drawBell(bell, w, h, nowMs) {
  const cx = bell.x * w;
  const cy = bell.y * h;
  const r = Math.min(w, h) * bell.radius;
  const pulse = 1 + Math.sin(nowMs * 0.006) * 0.04;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(250, 204, 21, 0.92)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  if (bell.hoverProgress > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * bell.hoverProgress);
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 6;
    ctx.stroke();
  }

  ctx.font = `${Math.round(r * 0.72)}px Jua, sans-serif`;
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🔔 정답벨', cx, cy - 6);
  ctx.font = `bold ${Math.round(r * 0.34)}px Pretendard, sans-serif`;
  ctx.fillText('손을 뻗어 제출!', cx, cy + r * 0.48);
  ctx.restore();
}

// ================= PARTICLES =================
function spawnParticles(x, y, color, count = 24) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 90 + Math.random() * 260;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 60,
      radius: 4 + Math.random() * 6,
      color,
      life: 1.0
    });
  }
}

function updateAndDrawParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 420 * dt; // 중력
    p.life -= dt * 1.6;
    if (p.life <= 0) {
      state.particles.splice(i, 1);
      continue;
    }
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ================= MAIN ANIMATION LOOP =================
let prevTime = performance.now();

function gameLoop(nowMs) {
  const dt = Math.min(0.1, (nowMs - prevTime) / 1000);
  prevTime = nowMs;

  detectPoses(nowMs);
  updateTargetsAndCheckHits(dt, nowMs);
  renderStage(nowMs, dt);

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);

// ================= UI & KEYBOARD / TOUCH CONTROLS =================
// 1. 모드 선택 카드
document.querySelectorAll('#modeOptions .opt-card').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#modeOptions .opt-card').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.mode = btn.dataset.mode;
  });
});

// 2. 난이도(맛) 선택 카드
document.querySelectorAll('#diffOptions .spice-card').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#diffOptions .spice-card').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.diff = btn.dataset.diff;
  });
});

// 3. 세부 설정 셀렉트
document.getElementById('exerciseTypeSelect').addEventListener('change', e => {
  state.exerciseType = e.target.value;
});
document.getElementById('submitRuleSelect').addEventListener('change', e => {
  state.submitRule = e.target.value;
});
document.getElementById('totalRoundsSelect').addEventListener('change', e => {
  state.totalRounds = Number(e.target.value);
});

// 4. 시작 버튼들
document.getElementById('startGameBtn').addEventListener('click', async () => {
  await startCamera();
  startGame();
});

document.getElementById('startDemoBtn').addEventListener('click', () => {
  state.useCamera = false;
  startGame();
});

document.getElementById('playAgainBtn').addEventListener('click', () => {
  startGame();
});

document.getElementById('openSettingsBtn').addEventListener('click', () => {
  resultModal.classList.add('hidden');
  setupModal.classList.remove('hidden');
});

// 5. 하단 컨트롤 바
document.getElementById('btnOpenSetup').addEventListener('click', () => {
  clearInterval(state.roundTimerId);
  state.phase = 'setup';
  setupModal.classList.remove('hidden');
});

document.getElementById('btnCalibrate').addEventListener('click', () => {
  recalibratePoses();
});

document.getElementById('btnSkipQuestion').addEventListener('click', () => {
  if (state.phase === 'playing' || state.phase === 'ready') {
    startRound();
  }
});

document.getElementById('btnToggleSkeleton').addEventListener('click', e => {
  state.showSkeleton = !state.showSkeleton;
  e.target.textContent = `🦴 관절선 표시 ${state.showSkeleton ? 'ON' : 'OFF'}`;
});

document.getElementById('btnToggleSound').addEventListener('click', e => {
  sfx.enabled = !sfx.enabled;
  e.target.textContent = `${sfx.enabled ? '🔊 효과음 ON' : '🔇 효과음 OFF'}`;
});

// 6. 전자칠판 직접 터치 / 마우스 클릭 지원
canvas.addEventListener('pointerdown', e => {
  if (state.phase !== 'playing') return;
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) / rect.width;
  const my = (e.clientY - rect.top) / rect.height;
  const nowMs = performance.now();

  // 풍선 또는 정답벨 클릭 확인
  for (const t of state.targets) {
    if (t.popped) continue;
    const dist = Math.hypot((mx - t.x) * canvas.width, (my - t.y) * canvas.height);
    const rPx = Math.min(canvas.width, canvas.height) * (t.radius + 0.02);
    if (dist <= rPx) {
      triggerTargetAction(t, nowMs);
      return;
    }
  }

  // 스쿼트 모드일 때 각 팀 구역 빈 곳을 클릭하면 스쿼트 1회 카운트 테스트 가능
  if (state.mode === 'squat') {
    const team = mx < 0.5 ? 'blue' : 'red';
    registerExerciseRep(state.players[team], '터치 스쿼트', nowMs);
  }
});

// 7. 키보드 단축키 백업 지원
window.addEventListener('keydown', e => {
  if (state.phase !== 'playing') return;
  const key = e.key.toUpperCase();
  const nowMs = performance.now();

  if (state.mode === 'balloon') {
    const map = {
      Q: { team: 'blue', side: 'left' },
      W: { team: 'blue', side: 'right' },
      O: { team: 'red', side: 'left' },
      P: { team: 'red', side: 'right' }
    };
    if (map[key]) {
      const target = state.targets.find(
        t => t.kind === 'balloon' && !t.popped && t.team === map[key].team && t.side === map[key].side
      );
      if (target) triggerTargetAction(target, nowMs);
    }
  } else if (state.mode === 'squat') {
    if (key === 'S') {
      registerExerciseRep(state.players.blue, '스쿼트', nowMs);
    } else if (key === 'K') {
      registerExerciseRep(state.players.red, '스쿼트', nowMs);
    } else if (key === 'E') {
      const bell = state.targets.find(t => t.kind === 'bell' && t.team === 'blue');
      if (bell) triggerTargetAction(bell, nowMs);
    } else if (key === 'I') {
      const bell = state.targets.find(t => t.kind === 'bell' && t.team === 'red');
      if (bell) triggerTargetAction(bell, nowMs);
    }
  }
});
