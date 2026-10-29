// Shared WeChat chrome geometry. Keep capsule coordinates in logical px.
function metrics() {
  const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
  const width = info.windowWidth || 375, height = info.screenHeight || info.windowHeight || 812;
  const safeTop = info.statusBarHeight ?? (info.safeArea && info.safeArea.top) ?? 20;
  const safeBottom = info.safeArea ? Math.max(0, height - info.safeArea.bottom) : 0;
  let capsule;
  try { capsule = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect(); } catch (_) {}
  const valid = capsule && capsule.width > 0 && capsule.height > 0 && capsule.left > width / 2 && capsule.top >= safeTop && capsule.bottom < safeTop + 100;
  const navHeight = valid ? Math.max(44, capsule.height + (capsule.top - safeTop) * 2) : 44;
  const capsuleLeft = valid ? capsule.left : width - 96;
  return { safeTop, safeBottom, navHeight, headerHeight:safeTop + navHeight, helpHeight:44,
    titleRight:Math.max(104,width-capsuleLeft+12), heightScale:height/812,
    scale:width/375, windowHeight:info.windowHeight||height };
}
module.exports={metrics};
