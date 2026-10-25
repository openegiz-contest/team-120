#!/usr/bin/env bash
set -euo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run with sudo'; exit 1; }
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
downloads=${1:-/home/evn/quarry-monitor-downloads}
app=/srv/openegiz/monitoring
config=/etc/openegiz-monitoring
vhost=/etc/nginx/sites-available/openegiz.ecoout.com.kz
printf '%s  %s\n' f32ba4e166e35a376f39cbeb8dd47c57f7bf608b09339cb41adf6d39082af3c5 "$downloads/grafana.deb" | sha256sum -c -
printf '%s  %s\n' 0388822ace519c5a3a8ef556a541ce1b536e21d872f82deded465bd27a5a0699 "$downloads/prometheus.tgz" | sha256sum -c -
printf '%s  %s\n' 1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce "$downloads/node.tar.xz" | sha256sum -c -
id quarry-monitor >/dev/null 2>&1 || useradd --system --home /var/lib/quarry-monitor --shell /usr/sbin/nologin quarry-monitor
install -d /opt/quarry-grafana /opt/quarry-prometheus /opt/quarry-node "$app/monitoring" "$config/provisioning/datasources" "$config/provisioning/dashboards" "$config/dashboards"
dpkg-deb -x "$downloads/grafana.deb" /opt/quarry-grafana
tar -xzf "$downloads/prometheus.tgz" --strip-components=1 -C /opt/quarry-prometheus
tar -xJf "$downloads/node.tar.xz" --strip-components=1 -C /opt/quarry-node
for file in metrics-core.mjs exporter.mjs; do install -m 644 "$source_dir/$file" "$app/monitoring/$file"; done
ln -sfn /srv/openegiz/current "$app/dist"
install -m 644 "$source_dir/prometheus.yml" "$config/prometheus.yml"
install -m 644 "$source_dir/grafana.ini" "$config/grafana.ini"
install -m 644 "$source_dir/datasource.yml" "$config/provisioning/datasources/quarry.yml"
install -m 644 "$source_dir/dashboards.yml" "$config/provisioning/dashboards/quarry.yml"
install -m 644 "$source_dir/dashboard.json" "$config/dashboards/quarry.json"
install -d -o quarry-monitor -g quarry-monitor /var/lib/quarry-monitor/grafana /var/lib/quarry-monitor/prometheus
python3 - <<'PY'
from pathlib import Path
import secrets,os,grp
root=Path('/etc/openegiz-monitoring')
def create(name,text):
    path=root/name
    if not path.exists():
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w') as stream:stream.write(text)
token=root/'metrics.token'
create('metrics.token',secrets.token_hex(32))
os.chown(token,0,grp.getgrnam('quarry-monitor').gr_gid);os.chmod(token,0o640)
create('exporter.env','QUARRY_METRICS_TOKEN='+token.read_text().strip()+'\n')
create('grafana.env','GF_SECURITY_ADMIN_PASSWORD='+secrets.token_hex(32)+'\nGF_SECURITY_SECRET_KEY='+secrets.token_hex(32)+'\n')
PY
cat > /etc/systemd/system/quarry-exporter.service <<'UNIT'
[Unit]
Description=QUARRY independent control-run telemetry
After=network.target
[Service]
User=quarry-monitor
Group=quarry-monitor
EnvironmentFile=/etc/openegiz-monitoring/exporter.env
ExecStart=/opt/quarry-node/bin/node /srv/openegiz/monitoring/monitoring/exporter.mjs
Restart=on-failure
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/quarry-prometheus.service <<'UNIT'
[Unit]
Description=QUARRY Prometheus history
After=network.target quarry-exporter.service
[Service]
User=quarry-monitor
Group=quarry-monitor
ExecStart=/opt/quarry-prometheus/prometheus --config.file=/etc/openegiz-monitoring/prometheus.yml --storage.tsdb.path=/var/lib/quarry-monitor/prometheus --storage.tsdb.retention.time=7d --web.listen-address=127.0.0.1:9091
Restart=on-failure
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/lib/quarry-monitor/prometheus
ProtectHome=true
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/quarry-grafana.service <<'UNIT'
[Unit]
Description=QUARRY Grafana OSS
After=network.target quarry-prometheus.service
[Service]
User=quarry-monitor
Group=quarry-monitor
EnvironmentFile=/etc/openegiz-monitoring/grafana.env
Environment=GF_PATHS_DATA=/var/lib/quarry-monitor/grafana
Environment=GF_PATHS_PROVISIONING=/etc/openegiz-monitoring/provisioning
Environment=GF_PATHS_BUNDLED_PLUGINS=/opt/quarry-grafana/usr/share/grafana/data/plugins-bundled
Environment=GF_LOG_MODE=console
ExecStart=/opt/quarry-grafana/usr/share/grafana/bin/grafana server --homepath=/opt/quarry-grafana/usr/share/grafana --config=/etc/openegiz-monitoring/grafana.ini
Restart=on-failure
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/lib/quarry-monitor/grafana
ProtectHome=true
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable quarry-exporter quarry-prometheus quarry-grafana
systemctl restart quarry-exporter quarry-prometheus quarry-grafana
for attempt in $(seq 1 30); do curl -fsS http://127.0.0.1:3301/grafana/api/health >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:3301/grafana/api/health
curl -fsS http://127.0.0.1:9091/-/ready
cat > /etc/nginx/snippets/openegiz-grafana.conf <<'NGINX'
location = /grafana { return 302 /grafana/; }
location /grafana/ {
    proxy_pass http://127.0.0.1:3301;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
NGINX
backup="$vhost.before-monitoring-$(date -u +%Y%m%dT%H%M%SZ)"
cp -p "$vhost" "$backup"
if ! grep -q 'include /etc/nginx/snippets/openegiz-grafana.conf;' "$vhost"; then
    sed -i '\|root /srv/openegiz/current;|i\    include /etc/nginx/snippets/openegiz-grafana.conf;' "$vhost"
fi
if ! nginx -t; then cp -p "$backup" "$vhost"; exit 1; fi
systemctl reload nginx
echo 'Grafana: https://openegiz.ecoout.com.kz/grafana/d/quarry-control'
