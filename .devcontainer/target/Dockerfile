# Целевое окружение: настоящий OpenWrt rootfs с procd и init.d.
# Заглушки procd здесь намеренно нет: AC-21 требует, чтобы цикл Apply
# (sing-box check → запись → restart → healthcheck) отрабатывал так же, как на роутере.

ARG SINGBOX_VERSION=1.13.18-extended-2.6.5
ARG SINGBOX_ARCH=arm64
ARG OPENWRT_TAG=aarch64_generic-24.10.8
# OpenWrt публикует манифест с нестандартной архитектурой (`linux/aarch64_generic`,
# `linux/x86-64`), которую Docker не сопоставляет с платформой хоста автоматически.
# Поэтому платформа задаётся явно и должна совпадать с тегом и с SINGBOX_ARCH.
# Все глобальные ARG объявлены до первой FROM: объявленные ниже BuildKit относит
# к стадии, и на уровне следующего FROM они разворачиваются в пустую строку.
ARG OPENWRT_PLATFORM=linux/aarch64_generic

# Бинарь качаем отдельной стадией: в rootfs OpenWrt нет ни curl, ни install,
# а тянуть их через opkg — лишняя точка отказа (версии репозиториев, сеть, TLS).
# $BUILDPLATFORM — платформа самой машины сборки: сервис объявляет
# platform: linux/aarch64_generic, и без этого BuildKit искал бы под неё же и alpine.
FROM --platform=$BUILDPLATFORM alpine:3 AS fetch
ARG SINGBOX_VERSION
ARG SINGBOX_ARCH
RUN set -eu; \
    apk add --no-cache curl tar; \
    name="sing-box-${SINGBOX_VERSION}-linux-${SINGBOX_ARCH}-musl"; \
    curl -fsSL -o /tmp/sing-box.tar.gz \
      "https://github.com/shtorm-7/sing-box-extended/releases/download/v${SINGBOX_VERSION}/${name}.tar.gz"; \
    tar -xzf /tmp/sing-box.tar.gz -C /tmp; \
    mkdir -p /out; \
    cp "/tmp/${name}/sing-box" /out/sing-box; \
    chmod 0755 /out/sing-box

FROM --platform=${OPENWRT_PLATFORM} openwrt/rootfs:${OPENWRT_TAG}

COPY --from=fetch /out/sing-box /usr/bin/sing-box
COPY files/ /

# netifd забирает eth0 в br-lan и присваивает 192.168.1.1, теряя адрес, выданный
# Docker, — после этого проброс портов в контейнер не работает. Сетевая подсистема
# роутера стенду не нужна: AC-21 проверяет цикл Apply через procd, а не маршрутизацию.
# Отключаем именно её, procd/ubus/logd/rpcd остаются настоящими.
# `/etc/init.d/<svc> disable` на этапе сборки не срабатывает: procd и ubus ещё
# не запущены. Снимаем симлинки автозапуска напрямую.
RUN rm -f /etc/rc.d/S*dnsmasq /etc/rc.d/S*firewall /etc/rc.d/S*odhcpd /etc/rc.d/S*uhttpd \
 && rm -f /etc/rc.d/S*network /etc/rc.d/K*network \
 && ln -sf ../init.d/sing-box /etc/rc.d/S99sing-box \
 && ln -sf ../init.d/metaboxd /etc/rc.d/S98metaboxd \
 && mkdir -p /var/lock /var/run \
 && chmod +x /etc/init.d/sing-box /etc/init.d/metaboxd /usr/bin/apply-cycle-check \
 && /usr/bin/sing-box version

# metaboxd приезжает смонтированным томом из dist/ — собирается в dev-контейнере,
# обе стороны linux/<та же арка>, кросс-компиляция не нужна.
VOLUME /opt/metabox

EXPOSE 8080 9090

# procd запускается напрямую, а не через /sbin/init: цепочка preinit
# (/lib/preinit/10_indicate_preinit) гасит сетевые устройства, и контейнер теряет
# адрес, выданный Docker. Нам нужен именно procd как PID 1 — он и поднимает init.d.
CMD ["/sbin/procd"]
