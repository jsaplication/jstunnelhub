@echo off
setlocal enabledelayedexpansion
title Gerenciador Cloudflare - Estrutura por Pastas Isoladas
color 0A

set "BASE_DIR=%~dp0"
set "CLOUDFLARED=%BASE_DIR%cloudflared.exe"
set "TUNNELS_DIR=%BASE_DIR%tunnels"
set "USER_CLOUDFLARED=%USERPROFILE%\.cloudflared"
set "TEMP_LOG=%BASE_DIR%temp_out.txt"

if not exist "%TUNNELS_DIR%" mkdir "%TUNNELS_DIR%"

if not exist "%CLOUDFLARED%" (
    echo [ERRO] cloudflared.exe nao encontrado em:
    echo %BASE_DIR%
    pause
    exit /b
)

:MENU
cls
echo ===================================================
echo   GERENCIADOR DE TUNNEIS CLOUDFLARE
echo   Desenvolvido por JSaplication   [https://jsaplication.com.br]
echo   Codigo fonte Cloudflare tunnel  [https://github.com/cloudflare/cloudflared]
echo   Codigo fonte JStunnel           [https://jsaplication.github.com/jstunnel]
echo ===================================================
echo.
echo [1] Autenticar Conta (Login)
echo [2] Criar NOVO Tunel Isolado
echo [3] Iniciar Tunel
echo [4] Listar Tunneis da Conta
echo [5] Deletar Tunel
echo [6] Sair
echo.
echo ===================================================
set /p OPTION="Escolha uma opcao [1-6]: "

if "%OPTION%"=="1" goto LOGIN
if "%OPTION%"=="2" goto CREATE_TUNNEL
if "%OPTION%"=="3" goto START_TUNNEL
if "%OPTION%"=="4" goto LIST_TUNNELS
if "%OPTION%"=="5" goto DELETE_TUNNEL
if "%OPTION%"=="6" exit /b
goto MENU

:LOGIN
cls
echo ===================================================
echo AUTENTICACAO CLOUDFLARE
echo ===================================================
echo.
echo Abrindo navegador para autorizar a conta...
"%CLOUDFLARED%" tunnel login
echo.
echo Autenticacao concluida!
pause
goto MENU

:CREATE_TUNNEL
cls
echo ===================================================
echo CRIAR NOVO TUNEL ISOLADO
echo ===================================================
echo.
set /p TUNNEL_NAME="Digite o NOME do projeto (ex: pc, api, landing): "

if "%TUNNEL_NAME%"=="" goto MENU

:: Pasta dedicada para o projeto: tunnels\<TUNNEL_NAME>\
set "PROJECT_DIR=%TUNNELS_DIR%\%TUNNEL_NAME%"
if not exist "%PROJECT_DIR%" mkdir "%PROJECT_DIR%"

echo.
echo Criando tunel "%TUNNEL_NAME%" na Cloudflare...
"%CLOUDFLARED%" tunnel create %TUNNEL_NAME% > "%TEMP_LOG%" 2>&1
type "%TEMP_LOG%"

set "TUNNEL_ID="

:: Captura o UUID de 36 caracteres gerado no log
for /f "tokens=*" %%L in ('type "%TEMP_LOG%"') do (
    for %%A in (%%L) do (
        echo %%A | findstr /R "^[0-9a-fA-F][0-9a-fA-F]*-[0-9a-fA-F]*-[0-9a-fA-F]*-[0-9a-fA-F]*-[0-9a-fA-F]*" >nul
        if not errorlevel 1 (
            set "TUNNEL_ID=%%A"
        )
    )
)

if exist "%TEMP_LOG%" del /f /q "%TEMP_LOG%"

if "%TUNNEL_ID%"=="" (
    echo.
    echo [ERRO] Nao foi possivel capturar o UUID do tunel.
    echo Verifique se o nome "%TUNNEL_NAME%" ja existe na sua conta Cloudflare.
    pause
    goto MENU
)

echo.
echo UUID Gerado: %TUNNEL_ID%

:: Copia do C:\Users\Admin\.cloudflared para a PASTA DEDICADA DO PROJETO
set "SRC_JSON=%USER_CLOUDFLARED%\%TUNNEL_ID%.json"
set "DEST_JSON=%PROJECT_DIR%\%TUNNEL_ID%.json"

echo.
echo Copiando arquivo de credenciais:
echo De:   %SRC_JSON%
echo Para: %DEST_JSON%

if exist "%SRC_JSON%" (
    copy /y "%SRC_JSON%" "%DEST_JSON%" >nul
    echo [OK] Arquivo JSON movido para a pasta do projeto!
) else (
    for %%F in ("%USER_CLOUDFLARED%\*%TUNNEL_ID%*.json") do (
        copy /y "%%F" "%DEST_JSON%" >nul
        echo [OK] Copiado %%F para %DEST_JSON%
    )
)

set /p LOCAL_PORT="Digite a porta local do seu servidor (ex: 3000, 8080): "
set /p LOCAL_PROTO="Digite o protocolo [http/https] (padrao: http): "
if "%LOCAL_PROTO%"=="" set LOCAL_PROTO=http

set "CONFIG_FILE=%PROJECT_DIR%\config.yml"
set "RUN_BAT=%PROJECT_DIR%\iniciar_%TUNNEL_NAME%.bat"

:: 1. Cria o arquivo config.yml dentro da pasta do projeto
echo tunnel: %TUNNEL_ID%> "%CONFIG_FILE%"
echo credentials-file: %DEST_JSON%>> "%CONFIG_FILE%"
echo url: %LOCAL_PROTO%://localhost:%LOCAL_PORT%>> "%CONFIG_FILE%"

:: 2. Cria o arquivo .bat de 1 clique dentro da pasta do projeto
echo @echo off> "%RUN_BAT%"
echo title Iniciando Tunel - %TUNNEL_NAME%>> "%RUN_BAT%"
echo color 0B>> "%RUN_BAT%"
echo echo ===================================================>> "%RUN_BAT%"
echo echo   INICIANDO TUNEL: %TUNNEL_NAME%>> "%RUN_BAT%"
echo echo   UUID: %TUNNEL_ID%>> "%RUN_BAT%"
echo echo   PORTA LOCAL: %LOCAL_PORT%>> "%RUN_BAT%"
echo echo ===================================================>> "%RUN_BAT%"
echo echo.>> "%RUN_BAT%"
echo "%CLOUDFLARED%" tunnel --config "%CONFIG_FILE%" run>> "%RUN_BAT%"
echo pause>> "%RUN_BAT%"

echo.
echo ===================================================
echo PROJETO CONFIGURADO COM SUCESSO!
echo.
echo Estrutura criada em:
echo %PROJECT_DIR%\
echo   ├── %TUNNEL_ID%.json  (Chave)
echo   ├── config.yml                      (Configuracao)
echo   └── iniciar_%TUNNEL_NAME%.bat       (Executavel de 1 clique)
echo.
echo CNAME PARA O PAINEL CLOUDFLARE:
echo %TUNNEL_ID%.cfargotunnel.com
echo ===================================================
echo.
pause
goto MENU

:START_TUNNEL
cls
echo ===================================================
echo INICIAR PROJETO
echo ===================================================
echo.
set /p TUNNEL_NAME="Digite o NOME do projeto para rodar (ex: api.site.com ou site.com): "
set "PROJECT_DIR=%TUNNELS_DIR%\%TUNNEL_NAME%"
set "CONFIG_FILE=%PROJECT_DIR%\config.yml"
set "RUN_BAT=%PROJECT_DIR%\iniciar_%TUNNEL_NAME%.bat"

if exist "%RUN_BAT%" (
    call "%RUN_BAT%"
    goto MENU
)

if not exist "%CONFIG_FILE%" (
    echo.
    echo [ERRO] Projeto "%TUNNEL_NAME%" nao encontrado em:
    echo %PROJECT_DIR%
    pause
    goto MENU
)

cls
echo Executando %TUNNEL_NAME%...
"%CLOUDFLARED%" tunnel --config "%CONFIG_FILE%" run
pause
goto MENU

:LIST_TUNNELS
cls
echo ===================================================
echo LISTA DE TUNNEIS NA CONTA
echo ===================================================
echo.
"%CLOUDFLARED%" tunnel list
echo.
pause
goto MENU

:DELETE_TUNNEL
cls
echo ===================================================
echo DELETAR TUNEL DA CONTA
echo ===================================================
echo.
set /p TUNNEL_NAME="Digite o NOME do projeto para excluir: "

if "%TUNNEL_NAME%"=="" goto MENU

echo.
echo Deletando na Cloudflare...
"%CLOUDFLARED%" tunnel cleanup %TUNNEL_NAME% >nul 2>&1
"%CLOUDFLARED%" tunnel delete -f %TUNNEL_NAME%

set "PROJECT_DIR=%TUNNELS_DIR%\%TUNNEL_NAME%"
if exist "%PROJECT_DIR%" (
    echo Apagando pasta local do projeto...
    rmdir /s /q "%PROJECT_DIR%"
)

echo.
echo Operacao finalizada.
pause
goto MENU