@echo off
chcp 65001 >nul
cd /d %~dp0..
echo ================================================
echo  歌词调试模式启动（终端会输出 [LRC-DBG] 日志）
echo  复现步骤：播放歌曲 -^> 点上一首 -^> 回到本窗口
echo  把所有 [LRC-DBG] 开头的行复制发给助手
echo  关闭播放器窗口后按任意键退出
echo ================================================
set ELECTRON_RUN_AS_NODE=
npx electron . --enable-logging
pause
