# 台球源码来源与范围

原项目：`/Users/apple/Desktop/WebSpace/mobile-3d-billiards`，迁移时只读，未修改。

- `src/game/physics.ts` 基于原固定步长求解器；增加黑8球组、开球摆球、全台自由球、黑8复位及库边事件球 ID。原斯诺克碰撞、旋转、D 区和袋口几何保留。
- `src/game/snookerRules.ts`、`cueStroke.ts`、`aimControl.ts` 保留原规则/球杆/瞄准算法；不增加赛事规则。
- `src/game/ai.ts` 基于原几何进攻/安全球及三档难度；增加全色、花色、黑8、开放球台目标匹配。
- `src/game/eightBallRules.ts` 为新增的本地休闲黑8规则：开球至少进球或四颗目标球碰库；开球黑8复位；开球不分组，之后首次合法进球分组；犯规给对方全台自由球；提前黑8、黑8伴随犯规判负；不实施指袋/裁判判罚争议流程。
- `src/core.ts` 为小程序共用比赛控制器；人工与 AI 共用球杆动画、物理击球和唯一规则裁决；无会员、支付、鉴权或网络桥接。
- `src/renderer.ts` 使用原项目已经依赖的 Babylon.js（原依赖范围 `^8.25.0`，本机已安装/本次打包 `8.56.2`），直接承载于微信本地 WebGL Canvas。Babylon 许可证见 `vendor/BABYLON-LICENSE.md`。
- 原球房13个可见 mesh 已无损提取为本地二进制，保留原顶点、法线、UV、索引和变换；只排除原网页明确禁用的 MainLight/RoofLights。12张原材质以JPEG82压缩；桌框木纹/法线、球房和物件最大512px，其余保持最大256px。长背景音乐未复制。原模型与纹理来源hash及每个生成纹理hash记录在 assets/club/scene.js，导入脚本为 tools/import-billiards-assets.py。
- `assets/*.wav` 为此次根据衰减正弦/噪声生成的短击球音效，声音受全局设置与页面生命周期约束。

`core.js` 和 `renderer.js` 是 `build.cjs` 根据 `src` 生成并跟踪的实际运行文件，不应单独手工修改。浏览器 WebGL 运行和本地测试不等同于微信真机预览验收。

已核对微信官方 Canvas 文档：<https://developers.weixin.qq.com/miniprogram/dev/component/canvas.html>。页面使用 `type="webgl"`、节点查询、Canvas requestAnimationFrame/cancelAnimationFrame 及页面 touch 事件；没有远程 web-view。官方文档提示 WebGL 应使用真机预览验证，不能用真机调试替代。

原生验收发现部分微信模拟器会把 WebGL Canvas 始终放在普通/cover-view HUD 前面。最终运行默认使用 `wx.createOffscreenCanvas({type:"2d"})` 绘制中文 HUD，上传 RawTexture 并由 Babylon Layer 在同一个 WebGL 帧绘制；同一 Canvas 的触摸按命中区域转发按钮与横条，避免依赖原生组件叠层。未使用的WXML cover-view备用模板已移除，触摸仅由Canvas分发。离屏 2D API 依据微信官方文档：https://developers.weixin.qq.com/miniprogram/dev/api/canvas/wx.createOffscreenCanvas.html 。

2026-10-28 真机初始化修正：Babylon 的 existing-context 构造路径读取 `gl.canvas` 并调用其 DOM 事件方法；小程序真机宿主对象不应被假定具有完整 DOM 接口或允许扩展。本地 `src/platform.ts` 用独立 facade 提供 Canvas 接口并将 GL 方法绑定回原对象，不向宿主 Canvas/GL 写属性；所请求类型固定为 WebGL 1。没有实际手机错误栈时，只能认定修正了该明确的浏览器假设，不能认定已经解释所有真机失败。

初始化分阶段诊断记录在本机 `little-decision:billiards:lastDiagnostic:v2`，失败原生弹窗显示阶段及原始错误，支持主动复制完整诊断及重试/返回。内容仅包括设备/微信 SDK、初始化阶段、GPU 标准信息与错误栈，不收集账号或 Token。离屏 2D 创建和 1 像素 getImageData 探针独立记录，首帧再记录 HUD 读回/上传和场景渲染，便于区分能力失败位置。构造中途失败会释放部分 Scene/Engine，避免重试累积资源。

HUD 已按原项目 `index.html`、`src/style.css:133-165, 214-330` 与 `src/main.ts:1151-1174` 回调调整为：顶部原重新开局/视角/声音/暂停，居中目标比分，右侧竖向力度条，左下圆形击球点，底部居中击球和右下对局设置。恢复原 42% 默认力度与 8% 下限；保留圆形击球点 X→左右塞、Y 反向→高低杆并做单位圆裁剪。恢复原镜头/灯光与 .881 桌面高度、六段球杆、球清漆壳/高光/接触阴影、三条Tube瞄准线和落点圈；视角为原自由环绕模式，瞄准仅接收球杆后端拖动，自由球先拖动预览、松手确认。小程序胶囊区域需要紧凑适配，压缩材质与Canvas字体仍需手机视觉验收。

本地场景资源通过 CanvasImage 解码、离屏2D读回后上传 RawTexture，未使用SceneLoader、DOM或远程页面。解码任务有超时、错误阶段与取消；离页/重试取消待完成图片回调，过期结果不创建Renderer。初始化失败清空已释放对象，尺寸查询仅作用于发起时同一Renderer，避免旧查询改写新球桌。

对局模式/难度/彩球设置面板已按原 index.html settings-layer 与 style.css settings-sheet 绘入HUD，遮罩及面板空白区域吞掉触摸，选项应用后关闭，暂停/后台/重试均清理。原网页未设置帮助手册入口；运行HUD不新增该入口。重新开局按原网页直接重置比赛、42%力度与默认镜头，无额外原生确认。

场景manifest由导入脚本生成CommonJS `scene.js`，没有运行时JSON require。微信3.17.5模块加载器只解析JS定义，给非.js后缀追加.js；Node可直接require JSON会掩盖该平台差异。对应回归使用微信式JS-only loader验证scene-assets的顶层初始化，避免Page注册前失败而无法显示诊断。

2026-10-29 追加兼容：原模型运行时展开为无索引三角形；保留原形状，材质超过2.5秒未就绪时仅替换同一个mesh的材质。使用实际DPR及GPU尺寸限制，黑8球面数字纹理512×256。资源读取兼容跨JS上下文ArrayBuffer。两种场景微信模拟器已观察完整桌框与球袋，手机仍待新预览复核。

2026-10-29 手机日志确认材质GLSL扩展声明排在precision/uniform之后，严格编译器拒绝，基础回退也同样失败。platform.ts在原生shaderSource提交前整理扩展声明顺序，保留原shader计算及纹理；旧实际shader18份中5份违规，修复后两模式38份检查0违规。core/renderer由构建脚本重生成，不修改Babylon依赖。手机新包仍待复核。
