@echo off
title PapaSense T-6 — Servidor Local
echo.
echo =====================================================
echo    PapaSense T-6 - Lanzador de Aplicacion
echo    Bluetooth HC-05 / Cable USB -- Web Serial API
echo =====================================================
echo.
echo Iniciando servidor local en http://localhost:8080 ...
echo (Cierre esta ventana para detener el servidor)
echo.

:: Lanzar el servidor PowerShell integrado (no requiere Python ni Node)
PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor_local.ps1"

pause
