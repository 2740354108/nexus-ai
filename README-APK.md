# NEXUS AI · 安卓 APK 自动构建说明

应用名：**NEXUS AI** ｜ 图标：复用网站 favicon ｜ 内容：与网站移动端应用（`/app`）一致

## 方案一：云端自动构建（推荐，不需要你的电脑）

把代码推到 GitHub 后，Actions 会自动编译出 APK，你下载安装即可。

1. 把本仓库（需包含 `frontend/` 及 `frontend/android/` 目录）推送到 GitHub：
   ```bash
   git init            # 若还不是 git 仓库
   git add .
   git commit -m "NEXUS AI android"
   gh repo create nexus-ai --public   # 或在 GitHub 网页手动建仓库
   git push -u origin main
   ```
2. 进入仓库 **Settings → Actions → General**，确认允许运行 workflows。
3. 推送 `main` 分支后，仓库 **Actions** 页会自动开始构建；约 3–5 分钟完成后，
   在构建任务的 **Artifacts** 里下载 `NEXUS-AI-APK`（即 `NEXUS-AI-debug.apk`）。
4. 手机开启「允许安装未知来源应用」，点开 apk 即可安装测试。

> CI 已配置：`ubuntu-latest` + Node 20 + Android SDK 36 + Capacitor sync + `assembleDebug`。
> 当前出的是 **debug 包**，能直接安装试用，但不能上架商店。

## 方案二：本地构建（可选，需要你的电脑）

需要安装 **Android Studio / Android SDK** 与 JDK 17+：
```bash
cd frontend
pnpm install
pnpm build
npx cap sync android
cd android
./gradlew assembleDebug      # 产物在 android/app/build/outputs/apk/debug/
```

## 上架应用商店前必做

1. **换正式域名**：编辑 `frontend/capacitor.config.ts` 的 `server.url`，
   把沙盒临时地址改成你的正式部署地址（沙盒地址会随沙盒关闭而失效）。
2. **配置签名**：当前是 debug 签名。上架需准备 release keystore，
   在 GitHub Secrets 存入后改用 `./gradlew assembleRelease`（可参考官方文档）。
3. **自适应图标**（可选）：当前用的是 legacy PNG 图标，能正常显示；
   Google Play 推荐补充 adaptive icon，不影响功能性上架。

## 文件位置

- `frontend/capacitor.config.ts` — 应用名、包名、入口地址
- `frontend/android/` — 原生安卓工程（已生成，含网站图标）
- `.github/workflows/build-apk.yml` — 自动构建流水线
