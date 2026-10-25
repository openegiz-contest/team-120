# Grafana QUARRY

[Открыть дашборд](https://openegiz.ecoout.com.kz/grafana/d/quarry-control). Для чтения аккаунт не нужен; анонимная роль — только Viewer. Запись и администрирование требуют входа.

Источник данных — независимый серверный запуск нашего `dispatch-core.mjs`: четыре сценария по четыре самосвала, тот же дорожный граф, план 500 т и смена 300 с. После окончания 15 с показывается итог, затем начинается новый цикл. Это не данные текущей вкладки игрока и не телеметрия предприятия. MQTT/Ditto к этому тракту пока не подключены.

`metrics-core.mjs` → `exporter.mjs` → Prometheus → Grafana OSS. Метрики закрыты случайным Bearer-токеном, который генерируется на VPS. Экспортёр, Prometheus и Grafana слушают только loopback; Nginx открывает по HTTPS только Grafana. История Prometheus хранится 7 дней. Секреты находятся в `/etc/openegiz-monitoring/`, отсутствуют в Git и не встроены в браузер.

Версии установщика: Grafana OSS 13.2.4, Prometheus 3.13.5 LTS, Node.js 22.23.4. Официальные источники: [Grafana](https://grafana.com/grafana/download/13.2.4?edition=oss), [Prometheus](https://prometheus.io/download/), [Node.js](https://nodejs.org/dist/v22.23.4/SHASUMS256.txt). Установщик сверяет SHA256 всех трёх архивов. Бинарники в репозитории не хранятся.

## Проверка локальной модели

Из корня репозитория:

```bash
cd team/quarry
node --test tests/monitoring.test.mjs
export QUARRY_METRICS_TOKEN="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
node monitoring/exporter.mjs
```

В другом терминале с той же переменной: `curl -H "Authorization: Bearer $QUARRY_METRICS_TOKEN" http://127.0.0.1:9187/metrics`. Без токена ожидается 401. Никаких параметров существующего игрового движка изменять не нужно.

## Развёртывание на существующем VPS

Предполагаются Ubuntu 24.04, Nginx с уже настроенным HTTPS для `openegiz.ecoout.com.kz` и действующий `/srv/openegiz/current`. Установщик добавляет только отдельные службы и location `/grafana/`; остальные vhost не изменяет. Перед изменением vhost создаётся резервная копия, Nginx перезагружается только после `nginx -t`.

Скопируйте эту директорию на сервер. От имени обычного пользователя подготовьте загрузки:

```bash
mkdir -p ~/quarry-monitor-downloads
cd ~/quarry-monitor-downloads
curl -fL https://dl.grafana.com/grafana/release/13.2.4/grafana_13.2.4_38252365904_linux_amd64.deb -o grafana.deb
curl -fL https://github.com/prometheus/prometheus/releases/download/v3.13.5/prometheus-3.13.5.linux-amd64.tar.gz -o prometheus.tgz
curl -fL https://nodejs.org/dist/v22.23.4/node-v22.23.4-linux-x64.tar.xz -o node.tar.xz
sudo bash /path/to/monitoring/install-vps.sh "$PWD"
```

Статус: `systemctl status quarry-exporter quarry-prometheus quarry-grafana`. Конфигурации Grafana и Prometheus находятся в этой директории и устанавливаются в `/etc/openegiz-monitoring/`. Для импорта в другой Grafana скопируйте `dashboard.json` и создайте Prometheus datasource с UID `quarry-prometheus`; внешний источник должен быть доступен из той Grafana. Cloud-аккаунт не создаётся и не используется.

Сгенерированный пароль администратора хранится только в root-файле `/etc/openegiz-monitoring/grafana.env`. Он нужен для редактирования, не для публичного просмотра. Остановка мониторинга: `sudo systemctl stop quarry-grafana quarry-prometheus quarry-exporter`; веб-игра продолжает работать.
