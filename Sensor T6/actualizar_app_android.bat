@echo off
title Sincronizar App con Android
echo ========================================================
echo    PapaSense T-6: Sincronizar Archivos a Android
echo ========================================================
echo.
echo Copiando archivos web mas recientes a la carpeta de Android...

set DEST=%~dp0android\app\src\main\assets
if not exist "%DEST%" mkdir "%DEST%"

copy /y "%~dp0index.html" "%DEST%\" >nul
copy /y "%~dp0app.js" "%DEST%\" >nul
copy /y "%~dp0styles.css" "%DEST%\" >nul
copy /y "%~dp0manifest.json" "%DEST%\" >nul
if exist "%~dp0icons" xcopy /y /e /i "%~dp0icons" "%DEST%\icons" >nul

echo [OK] Archivos sincronizados en: %DEST%
echo Ya puedes compilar el APK en Android Studio o con Gradle.
echo.
pause
