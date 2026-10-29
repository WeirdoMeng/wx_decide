Component({
  data: {
    selected: 0, hidden: false,
    tabs: [
      { path: '/pages/index/index', text: '转盘', icon: '/assets/original/donut_large_outlined.png', activeIcon: '/assets/original/donut_large_rounded.png' },
      { path: '/pages/party/index', text: '聚会', icon: '/assets/original/celebration_outlined.png', activeIcon: '/assets/original/celebration_rounded.png' },
      { path: '/pages/mine/index', text: '我的', icon: '/assets/original/person_outline.png', activeIcon: '/assets/original/person_rounded.png' }
    ]
  },
  methods: {
    switchTab(event) {
      const index = Number(event.currentTarget.dataset.index);
      if (index === this.data.selected || !this.data.tabs[index]) return;
      const pages = getCurrentPages();
      const current = pages[pages.length - 1];
      // 与 Flutter 首页保持一致：抽取动画结束前不能切换底部 Tab。
      if (current && current.route === 'pages/index/index' && current.data.spinning) {
        wx.showToast({ title: '转盘转动中，请稍候', icon: 'none' });
        return;
      }
      wx.switchTab({ url: this.data.tabs[index].path });
    }
  }
});
