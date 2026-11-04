// 초등 6학년 비례식 수준별(순한맛 / 매운맛 / 마라맛 / 핵폭탄맛) 문제 생성기

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

function fracHTML(num, den) {
  return `<span class="frac"><span class="frac-num">${num}</span><span class="frac-den">${den}</span></span>`;
}

/**
 * 4개의 항 중 unknownIdx 위치의 항을 □ 로 바꾼 HTML 식을 반환합니다.
 */
function formatProportionHTML(terms, unknownIdx) {
  const rendered = terms.map((t, i) =>
    i === unknownIdx ? `<span class="unknown-box">□</span>` : t
  );
  return `
    <span class="eq-term">${rendered[0]} : ${rendered[1]}</span>
    <span class="eq-op">=</span>
    <span class="eq-term">${rendered[2]} : ${rendered[3]}</span>
  `;
}

/**
 * 오답(함정 보기) 생성기
 * 핵폭탄맛에서는 정답과 ±1 차이 또는 역비례 함정 오답을 우선 배치합니다.
 */
function makeDistractor(answer, diff, customTrap = null) {
  if (customTrap && customTrap !== answer && customTrap > 0) {
    if (diff === 'nuclear' || Math.random() < 0.65) {
      return customTrap;
    }
  }

  const candidates = new Set();
  if (diff === 'mild') {
    [answer + 2, answer - 2, answer + 3, answer + 4, Math.max(1, answer - 1)].forEach(v => {
      if (v > 0 && v !== answer) candidates.add(v);
    });
  } else if (diff === 'spicy') {
    [answer + 1, answer - 1, answer + 2, answer - 2, answer + 3].forEach(v => {
      if (v > 0 && v !== answer) candidates.add(v);
    });
  } else if (diff === 'mala') {
    [answer + 1, answer - 1, answer + 2, Math.max(1, answer - 2)].forEach(v => {
      if (v > 0 && v !== answer) candidates.add(v);
    });
  } else {
    // 핵폭탄맛: 아주 교묘한 ±1 또는 10의 자리/배수 착각 오답
    [answer + 1, answer - 1].forEach(v => {
      if (v > 0 && v !== answer) candidates.add(v);
    });
  }

  const list = Array.from(candidates);
  return list.length > 0 ? choice(list) : answer + 1;
}

/**
 * 스쿼트/점프 모드 전용 문제 생성 (정답이 반드시 2 ~ 9 사이 자연수!)
 * 하지만 식 자체는 난이도(순한맛~핵폭탄맛)에 맞게 매워집니다.
 */
function generateSquatProblem(diff) {
  // 목표 정답(스쿼트/점프 횟수): 2 ~ 9
  const answer = randInt(2, 9);

  if (diff === 'mild') {
    // 기본 자연수 배수 비례식 (정답 2~9)
    // 예: 1 : 2 = 3 : □ (답 6) 또는 2 : 3 = □ : 9 (답 6)
    const scale = randInt(2, 4);
    let a = randInt(1, 5);
    let b = randInt(1, 5);
    while (a === b) b = randInt(1, 5);

    // unknown 위치를 골라 그 항의 값이 2~9가 되도록 구성
    const pos = choice([0, 1, 2, 3]);
    let nums;
    if (pos === 0) {
      // □ : b = (□*scale) : (b*scale)
      nums = [answer, b, answer * scale, b * scale];
    } else if (pos === 1) {
      nums = [a, answer, a * scale, answer * scale];
    } else if (pos === 2) {
      // a : b = □ : X -> □가 scale의 배수여야 자연수비가 깔끔.
      // 대신 큰 비에서 약분하는 형태: (answer*scale) : (b*scale) = □ : b
      nums = [answer * scale, b * scale, answer, b];
    } else {
      nums = [a * scale, answer * scale, a, answer];
    }

    const g = gcd(nums[0], nums[1]);
    return {
      html: formatProportionHTML(nums.map(String), pos),
      answer,
      wrong: makeDistractor(answer, diff),
      hint: `🌱 [순한맛] 비의 성질을 이용해 □ 안의 횟수만큼 몸을 움직이세요!`,
      explanation: `${nums[0]} : ${nums[1]} = ${nums[2]} : ${nums[3]} → 정답은 ${answer}회!`
    };
  }

  if (diff === 'spicy') {
    // 매운맛 (스쿼트 모드): 약분 후 배수해야 풀리는 자연수 비례식 (답은 2~9)
    // 기본 기약비 p : q 에서 한쪽은 ×m, 다른 쪽은 ×n (단 구하는 항이 2~9)
    const coprimes = [
      [1, 2], [1, 3], [2, 3], [3, 4], [2, 5], [3, 5], [4, 5], [3, 7]
    ];
    // answer(2~9)를 만들 수 있는 조합 탐색
    const valid = [];
    for (const [p, q] of coprimes) {
      for (let m = 2; m <= 6; m++) {
        for (let n = 1; n <= 4; n++) {
          if (m === n) continue;
          const terms = [p * m, q * m, p * n, q * n];
          terms.forEach((val, idx) => {
            if (val >= 2 && val <= 9) {
              valid.push({ p, q, terms, idx });
            }
          });
        }
      }
    }
    const picked = choice(valid);
    const { p, q, terms, idx } = picked;
    const ans = terms[idx];
    return {
      html: formatProportionHTML(terms.map(String), idx),
      answer: ans,
      wrong: makeDistractor(ans, diff),
      hint: `🌶️ [매운맛] 기약비(${p}:${q})로 먼저 약분하면 암산이 빨라집니다!`,
      explanation: `기약비 ${p}:${q}를 적용하면 ${terms[0]}:${terms[1]} = ${terms[2]}:${terms[3]} → 정답 ${ans}회!`
    };
  }

  if (diff === 'mala') {
    // 마라맛 (스쿼트 모드): 소수 또는 분수 비례식인데 정답은 2~9!
    const malaPool = [
      { terms: ['0.2', '0.3', '4', '6'], ansIdx: 3, exp: '0.2 : 0.3 = 2 : 3 = 4 : 6' },
      { terms: ['0.3', '0.5', '6', '10'], ansIdx: 2, exp: '0.3 : 0.5 = 3 : 5 = 6 : 10' },
      { terms: ['0.4', '0.6', '6', '9'], ansIdx: 2, exp: '0.4 : 0.6 = 2 : 3 = 6 : 9' },
      { terms: ['0.4', '0.6', '6', '9'], ansIdx: 3, exp: '0.4 : 0.6 = 2 : 3 = 6 : 9' },
      { terms: ['1.2', '0.8', '9', '6'], ansIdx: 3, exp: '1.2 : 0.8 = 3 : 2 = 9 : 6' },
      { terms: ['1.5', '0.5', '9', '3'], ansIdx: 3, exp: '1.5 : 0.5 = 3 : 1 = 9 : 3' },
      { terms: [fracHTML(1, 2), fracHTML(1, 3), '6', '4'], ansIdx: 3, exp: '1/2 : 1/3 = 3 : 2 = 6 : 4' },
      { terms: [fracHTML(1, 3), fracHTML(1, 4), '8', '6'], ansIdx: 3, exp: '1/3 : 1/4 = 4 : 3 = 8 : 6' },
      { terms: [fracHTML(2, 5), fracHTML(3, 5), '4', '6'], ansIdx: 2, exp: '2/5 : 3/5 = 2 : 3 = 4 : 6' },
      { terms: [fracHTML(3, 4), fracHTML(1, 2), '9', '6'], ansIdx: 3, exp: '3/4 : 1/2 = 3 : 2 = 9 : 6' },
      { terms: ['0.25', '0.5', '4', '8'], ansIdx: 3, exp: '0.25 : 0.5 = 1 : 2 = 4 : 8' },
      { terms: ['0.6', '0.9', '4', '6'], ansIdx: 2, exp: '0.6 : 0.9 = 2 : 3 = 4 : 6' }
    ];
    const item = choice(malaPool);
    const ans = Number(item.terms[item.ansIdx]);
    return {
      html: formatProportionHTML(item.terms, item.ansIdx),
      answer: ans,
      wrong: makeDistractor(ans, diff),
      hint: `🔥 [마라맛] 소수·분수의 비를 가장 간단한 자연수의 비로 바꿔보세요!`,
      explanation: `${item.exp} → 정답은 ${ans}회!`
    };
  }

  // ☢️ 핵폭탄맛 (스쿼트 모드): 분수+소수 혼합 또는 고난도 약분 비례식 (답은 2~9!)
  const nuclearSquatPool = [
    { terms: ['0.4', fracHTML(1, 5), '6', '3'], ansIdx: 3, exp: '0.4 : 1/5 = 0.4 : 0.2 = 2 : 1 = 6 : 3' },
    { terms: ['0.6', fracHTML(2, 5), '9', '6'], ansIdx: 3, exp: '0.6 : 2/5 = 0.6 : 0.4 = 3 : 2 = 9 : 6' },
    { terms: [fracHTML(3, 4), '0.5', '9', '6'], ansIdx: 3, exp: '3/4 : 0.5 = 0.75 : 0.5 = 3 : 2 = 9 : 6' },
    { terms: [fracHTML(2, 3), '0.5', '8', '6'], ansIdx: 3, exp: '2/3 : 1/2 = 4 : 3 = 8 : 6' },
    { terms: ['0.75', fracHTML(1, 2), '6', '4'], ansIdx: 2, exp: '0.75 : 0.5 = 3 : 2 = 6 : 4' },
    { terms: ['14', '21', '6', '9'], ansIdx: 3, exp: '14 : 21 = 2 : 3 = 6 : 9' },
    { terms: ['16', '24', '6', '9'], ansIdx: 2, exp: '16 : 24 = 2 : 3 = 6 : 9' },
    { terms: ['18', '27', '4', '6'], ansIdx: 3, exp: '18 : 27 = 2 : 3 = 4 : 6' },
    { terms: ['28', '35', '4', '5'], ansIdx: 3, exp: '28 : 35 = 4 : 5' },
    { terms: [fracHTML(3, 5), '0.4', '9', '6'], ansIdx: 2, exp: '3/5 : 0.4 = 0.6 : 0.4 = 3 : 2 = 9 : 6' },
    { terms: ['1.25', '0.75', '5', '3'], ansIdx: 2, exp: '1.25 : 0.75 = 5 : 3' },
    { terms: [fracHTML(5, 6), fracHTML(1, 2), '5', '3'], ansIdx: 3, exp: '5/6 : 1/2 = 5 : 3' }
  ];
  const item = choice(nuclearSquatPool);
  const ans = Number(item.terms[item.ansIdx]);
  return {
    html: formatProportionHTML(item.terms, item.ansIdx),
    answer: ans,
    wrong: makeDistractor(ans, diff),
    hint: `☢️ [핵폭탄맛] 분수와 소수를 통일한 뒤 비의 성질을 쓰세요!`,
    explanation: `${item.exp} → 정답은 ${ans}회!`
  };
}

/**
 * 풍선 터뜨리기 모드 문제 생성 (순한맛 / 매운맛 / 마라맛 / 핵폭탄맛)
 */
function generateProblem(diff = 'mild', mode = 'balloon') {
  if (mode === 'squat') {
    return generateSquatProblem(diff);
  }

  // 1. 🌱 순한맛: 구구단 범위의 직관적인 자연수 비례식
  if (diff === 'mild') {
    const a = randInt(1, 6);
    let b = randInt(2, 7);
    if (a === b) b++;
    const k = randInt(2, 5);
    const terms = [a, b, a * k, b * k];
    const pos = choice([0, 1, 2, 3]);
    const answer = terms[pos];
    // 함정: 곱셈 대신 덧셈으로 착각한 값 또는 k±1 배한 값
    const trap = pos >= 2 ? (pos === 2 ? a * (k + 1) : b * (k - 1 || 2)) : answer + 2;

    return {
      html: formatProportionHTML(terms.map(String), pos),
      answer,
      wrong: makeDistractor(answer, diff, trap),
      hint: `🌱 [순한맛] 전항과 후항에 같은 수를 곱하거나 나누어 보세요!`,
      explanation: `${terms[0]} : ${terms[1]} 에 ${k}배를 하면 ${terms[2]} : ${terms[3]}! (정답: ${answer})`
    };
  }

  // 2. 🌶️ 매운맛: 약분 후 배수 관계 (예: 6 : 9 = □ : 21, 8 : 12 = 14 : □)
  if (diff === 'spicy') {
    const basePairs = [
      [2, 3], [3, 4], [2, 5], [3, 5], [4, 5], [3, 7], [4, 7], [5, 6], [5, 8]
    ];
    const [p, q] = choice(basePairs);
    const m = randInt(2, 6);
    let n = randInt(3, 8);
    if (m === n) n++;

    const terms = [p * m, q * m, p * n, q * n];
    const pos = choice([0, 1, 2, 3]);
    const answer = terms[pos];
    // 역비례 착각 함정 또는 ±2 오답
    const trap = pos === 3 ? p * n : pos === 2 ? q * n : answer + 2;

    return {
      html: formatProportionHTML(terms.map(String), pos),
      answer,
      wrong: makeDistractor(answer, diff, trap),
      hint: `🌶️ [매운맛] 외항의 곱 = 내항의 곱, 또는 기약비(${p}:${q})로 약분해 보세요!`,
      explanation: `기약비는 ${p} : ${q} 이므로 ${terms[0]} : ${terms[1]} = ${terms[2]} : ${terms[3]} (정답: ${answer})`
    };
  }

  // 3. 🔥 마라맛: 초6 심화 — 소수 비례식 & 분수 비례식
  if (diff === 'mala') {
    const type = choice(['decimal', 'fraction']);

    if (type === 'decimal') {
      const pairs = [
        [2, 3], [3, 4], [3, 5], [2, 5], [4, 5], [3, 7], [5, 6]
      ];
      const [p, q] = choice(pairs);
      const mult = choice([1, 2, 3, 5]); // 0.2:0.3 또는 0.6:0.9 또는 1.5:2.5
      const d1 = ((p * mult) / 10).toFixed(1).replace(/\.0$/, '');
      const d2 = ((q * mult) / 10).toFixed(1).replace(/\.0$/, '');
      const k = randInt(3, 8);
      const c = p * k;
      const d = q * k;

      const swapSides = Math.random() < 0.5;
      const terms = swapSides ? [String(c), String(d), d1, d2] : [d1, d2, String(c), String(d)];
      const pos = swapSides ? choice([0, 1]) : choice([2, 3]);
      const answer = Number(terms[pos]);
      // 전항/후항 반대로 계산한 함정
      const trap = pos === 2 || pos === 0 ? q * k : p * k;

      return {
        html: formatProportionHTML(terms, pos),
        answer,
        wrong: makeDistractor(answer, diff, trap),
        hint: `🔥 [마라맛] 소수의 비에 10을 곱해 간단한 자연수의 비로 바꾸세요!`,
        explanation: `${d1} : ${d2} = ${p} : ${q} 이므로 ${c} : ${d} (정답: ${answer})`
      };
    } else {
      // 분수의 비: (1/a) : (1/b) = b : a 의 함정을 노리는 문제!
      const denoms = [
        [2, 3], [2, 5], [3, 4], [3, 5], [4, 5], [2, 7]
      ];
      const [a, b] = choice(denoms);
      // (1/a) : (1/b) = b : a ! 학생들은 흔히 a : b 로 착각함!
      const k = randInt(2, 7);
      const right1 = b * k;
      const right2 = a * k;
      const terms = [fracHTML(1, a), fracHTML(1, b), String(right1), String(right2)];
      const pos = choice([2, 3]);
      const answer = Number(terms[pos]);
      // 가장 많이 틀리는 함정: 1/a : 1/b 를 a : b 로 착각했을 때 나오는 값!
      const classicTrap = pos === 2 ? a * k : b * k;

      return {
        html: formatProportionHTML(terms, pos),
        answer,
        wrong: makeDistractor(answer, diff, classicTrap),
        hint: `🔥 [마라맛] 분모의 최소공배수(${a * b})를 곱하면 순서가 어떻게 될지 조심하세요!`,
        explanation: `1/${a} : 1/${b} 의 양항에 ${a * b}를 곱하면 ${b} : ${a} = ${right1} : ${right2} (정답: ${answer}, 함정: ${classicTrap})`
      };
    }
  }

  // 4. ☢️ 핵폭탄맛: 분수·소수 혼합 비례식 + 큰 수 비례식 + 극악 함정 보기(±1 또는 역비례 함정)
  const nuclearTemplates = [
    () => {
      // 유형 A: 소수 : 기약분수 혼합 (예: 0.4 : 1/5 = 18 : □, 0.75 : 1/2 = □ : 16)
      const mixList = [
        { leftA: '0.4', leftB: fracHTML(1, 5), p: 2, q: 1, desc: '0.4 : 1/5 = 0.4 : 0.2 = 2 : 1' },
        { leftA: '0.6', leftB: fracHTML(2, 5), p: 3, q: 2, desc: '0.6 : 2/5 = 0.6 : 0.4 = 3 : 2' },
        { leftA: '0.75', leftB: fracHTML(1, 2), p: 3, q: 2, desc: '0.75 : 1/2 = 0.75 : 0.5 = 3 : 2' },
        { leftA: fracHTML(3, 4), leftB: '0.5', p: 3, q: 2, desc: '3/4 : 0.5 = 0.75 : 0.5 = 3 : 2' },
        { leftA: fracHTML(2, 3), leftB: '0.5', p: 4, q: 3, desc: '2/3 : 0.5 = 2/3 : 1/2 = 4 : 3' },
        { leftA: '0.8', leftB: fracHTML(3, 5), p: 4, q: 3, desc: '0.8 : 3/5 = 0.8 : 0.6 = 4 : 3' },
        { leftA: '1.2', leftB: fracHTML(3, 4), p: 8, q: 5, desc: '1.2 : 3/4 = 1.2 : 0.75 = 8 : 5' },
        { leftA: fracHTML(3, 8), leftB: '0.25', p: 3, q: 2, desc: '3/8 : 0.25 = 3/8 : 2/8 = 3 : 2' },
        { leftA: '0.5', leftB: fracHTML(2, 5), p: 5, q: 4, desc: '0.5 : 2/5 = 0.5 : 0.4 = 5 : 4' }
      ];
      const item = choice(mixList);
      const k = randInt(4, 11);
      const r1 = item.p * k;
      const r2 = item.q * k;
      const terms = [item.leftA, item.leftB, String(r1), String(r2)];
      const pos = choice([2, 3]);
      const answer = Number(terms[pos]);
      // 핵폭탄 함정: ±1 또는 역비 착각
      const trap = Math.random() < 0.5
        ? (pos === 2 ? item.q * k : item.p * k)
        : (answer + choice([-1, 1]));

      return {
        html: formatProportionHTML(terms, pos),
        answer,
        wrong: makeDistractor(answer, 'nuclear', trap),
        hint: `☢️ [핵폭탄맛] 소수와 분수를 한 가지로 통일해 자연수의 비로 바꾸세요!`,
        explanation: `${item.desc} 이므로 ${r1} : ${r2} → 정답은 ${answer}!`
      };
    },
    () => {
      // 유형 B: 큰 두 자리 수 비례식 (비의 성질 & 최대공약수 약분 필수)
      // 예: 14 : 21 = 16 : □ (답 24), 15 : 25 = □ : 35 (답 21), 18 : 24 = 27 : □ (답 36)
      const pairs = [
        [2, 3], [3, 4], [3, 5], [4, 5], [3, 7], [4, 7], [5, 7], [5, 8], [7, 9]
      ];
      const [p, q] = choice(pairs);
      const m = randInt(6, 12);
      let n = randInt(7, 13);
      while (n === m) n = randInt(7, 13);

      const terms = [p * m, q * m, p * n, q * n];
      const pos = choice([0, 1, 2, 3]);
      const answer = terms[pos];
      // ±1 또는 ±p 차이 나는 헷갈리는 오답
      const trap = answer + choice([-1, 1, -2, 2]);

      return {
        html: formatProportionHTML(terms.map(String), pos),
        answer,
        wrong: makeDistractor(answer, 'nuclear', trap),
        hint: `☢️ [핵폭탄맛] 큰 수에 속지 마세요! 먼저 기약비(${p}:${q})로 약분하면 보입니다!`,
        explanation: `${terms[0]}:${terms[1]}을 약분하면 ${p}:${q} → ${terms[2]}:${terms[3]} (정답: ${answer})`
      };
    }
  ];

  return choice(nuclearTemplates)();
}

window.generateProblem = generateProblem;

