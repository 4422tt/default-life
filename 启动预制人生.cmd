@echo off
chcp 65001 >nul
title 预制人生 - 本地服务
cd /d "%~dp0"

set "BUNDLED_NODE=C:\Users\10691\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "NODE_BIN=%BUNDLED_NODE%"

if not exist "%NODE_BIN%" (
  where node >nul 2>&1
  if errorlevel 1 (
    echo 无法找到 Node.js。请先安装 Node.js，或在 Codex 中重新运行项目。
    pause
    exit /b 1
  )
  set "NODE_BIN=node"
)

if not exist "node_modules\next\dist\bin\next" (
  echo 项目依赖尚未安装，请先在此目录运行 pnpm install。
  pause
  exit /b 1
)

if not exist "out\index.html" (
  echo 项目尚未构建，正在执行首次构建...
  "%NODE_BIN%" "node_modules\next\dist\bin\next" build
  if errorlevel 1 (
    echo 项目构建失败，请保留此窗口并在 Codex 中检查。
    pause
    exit /b 1
  )
)

echo 正在启动预制人生...
echo 浏览器地址：http://127.0.0.1:3000
echo 保持此窗口开启。停止服务请按 Ctrl+C。
"%NODE_BIN%" "serve-static.cjs" --open

echo 服务已经停止。
pause
