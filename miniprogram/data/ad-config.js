// 用户提供的流量主广告位。这里只维护配置，不进行网络请求。
module.exports = {
  enabled: true,
  interstitial: [
    'adunit-782695f0dcb7417d', 'adunit-c0ef7200f9aad774',
    'adunit-0eded7edd86116bb', 'adunit-2ae106f06c1bae87',
    'adunit-5a562c8c14f9720d', 'adunit-d99035a580e463f3',
    'adunit-43af41bde7853f34', 'adunit-eda9f917bda91d17'
  ],
  banner: [
    'adunit-50890e81877e0dda', 'adunit-e3ce82c0529406e2',
    'adunit-2b5cbddf64741b88', 'adunit-16a12924576ce508',
    'adunit-54bba8c0a738ad49', 'adunit-311039e97bf1f2cf',
    'adunit-243908a46e3c76ae'
  ],
  rewarded: [
    'adunit-cd19440a23878483', 'adunit-4d5dddedc247cb4c',
    'adunit-093dc28059e3ec7a', 'adunit-b6625afcee08d278',
    'adunit-0bdc81084d977774'
  ],
  triggers: {
    save: { minActions: 1, probability: 0.50 },
    truth: { minActions: 3, probability: 0.20 },
    wheel: { minActions: 3, probability: 0.20 },
    coin: { minActions: 3, probability: 0.20 },
    passBalloon: { minActions: 3, probability: 0.20 },
    numberBomb: { minActions: 3, probability: 0.20 },
    sharkTeeth: { minActions: 3, probability: 0.20 },
    diceShake: { minActions: 3, probability: 0.20 },
    diceClose: { minActions: 3, probability: 0.20 },
    diceCount: { minActions: 3, probability: 0.20 },
    diceOpen: { minActions: 3, probability: 0.20 },
    billiards: { minActions: 3, probability: 0.20 }
  },
  // 普通视频暂不启用；它不属于观看后发奖励的激励视频。
  video: [],
  policy: { minActions: 3, pityActions: 25, loadTimeout: 4000 }
};
