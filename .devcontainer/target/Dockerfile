# Настоящий procd, а не заглушка: цикл Apply должен отрабатывать как на роутере.

# База приходит снаружи: у владельца — образ из прошивки устройства (`make
# stand-base`), в CI прошивки нет, и берётся публичный rootfs OpenWrt той же
# ветки с apk.
ARG BASE_IMAGE=openwrt/rootfs:aarch64_generic-25.12.4
ARG SINGBOX_VERSION=1.14.1-extended-2.7.2
# Собранный бинарь демона: арка задаётся снаружи, потому что образ целевого
# окружения бывает и aarch64, и x86_64.
ARG DAEMON_BINARY=dist/metaboxd-linux-arm64

FROM ${BASE_IMAGE} AS base

# Пакет качается под арку, которую объявляет сама база: у образа из прошивки это
# aarch64_cortex-a53, у публичного rootfs — aarch64_generic. Отдельная стадия:
# в rootfs OpenWrt нет ни curl, ни доверенных корней для GitHub.
# $BUILDPLATFORM: иначе BuildKit искал бы alpine под платформой OpenWrt.
FROM --platform=$BUILDPLATFORM alpine:3.23 AS fetch
ARG SINGBOX_VERSION
COPY --from=base /etc/apk/arch /tmp/arch
RUN set -eu; \
    apk add --no-cache curl; \
    arch="$(cat /tmp/arch)"; \
    curl -fsSL -o /sing-box.apk \
      "https://github.com/shtorm-7/sing-box-extended/releases/download/v${SINGBOX_VERSION}/sing-box-extended_${SINGBOX_VERSION}_openwrt_${arch}.apk"

# Панель собирается тем же пакетом, что уезжает на роутер (ADR-0011): стенд
# проверяет поставку, а не разложенные по местам файлы. Версия числовая —
# строку вроде `dev` apk как версию не принимает.
FROM --platform=$BUILDPLATFORM alpine:3.23 AS package
ARG PKG_VERSION=0.0.0-r0
ARG DAEMON_BINARY
COPY --from=base /etc/apk/arch /tmp/arch
COPY apps/metaboxd/package /src/package
COPY ${DAEMON_BINARY} /src/metaboxd
RUN set -eu; \
    mkdir -p /pkgroot/usr/bin /pkgroot/etc /out; \
    cp -R /src/package/etc/. /pkgroot/etc/; \
    install -m 0755 /src/metaboxd /pkgroot/usr/bin/metaboxd; \
    chmod 0755 /pkgroot/etc/init.d/metaboxd; \
    chown -R root:root /pkgroot; \
    apk mkpkg \
      --info name:metaboxd \
      --info "version:${PKG_VERSION}" \
      --info "arch:$(cat /tmp/arch)" \
      --info description:"Панель настройки sing-box" \
      --files /pkgroot \
      --output /out/metaboxd.apk

# Та же стадия, выгруженная наружу: пакет для устройства и пакет в стенде
# собираются одним кодом, разойтись им негде (`make package`).
FROM scratch AS package-out
COPY --from=package /out/metaboxd.apk /

FROM base

COPY --from=fetch /sing-box.apk /tmp/sing-box.apk
COPY --from=package /out/metaboxd.apk /tmp/metaboxd.apk
COPY .devcontainer/target/files/ /

# Обе службы ставятся пакетами: вместе с ними приезжают их собственные
# init-скрипты, и запускаются службы в стенде так же, как на роутере. Пакеты не
# подписаны. Настройки панели положены до установки: файл в /etc apk не затирает,
# пакетное значение кладётся рядом как .apk-new — на этом держится стендовый
# адрес, поэтому после установки он проверяется.
#
# Снимаются с автозапуска службы, которым в контейнере не на чем работать, и
# fw4: правила он ставит, но с ним панель перестаёт отвечать на проброшенный
# порт, а причина не найдена. Внешнюю сеть вместо него изолирует Docker.
# `init.d disable` на сборке не срабатывает — procd и ubus ещё не подняты, —
# поэтому снимаются симлинки.
#
# /var в rootfs — симлинк на пустой /tmp: без /var/lock и /var/run ubusd не
# создаст сокет, и procd поднимется, не запустив ни одного сервиса.
#
# Рабочий каталог службы sing-box — каталог конфига: относительный path узла
# local (rule-sets/<имя>.json) резолвится от каталога -D, и с пакетным
# /usr/share/sing-box служба не находит файлы списков, которые пишет Apply.
RUN set -eu; \
    apk add --allow-untrusted /tmp/sing-box.apk /tmp/metaboxd.apk; \
    rm -f /tmp/sing-box.apk /tmp/metaboxd.apk; \
    grep -q "option listen_port '8080'" /etc/config/metabox; \
    sed -i "s|option workdir '/usr/share/sing-box'|option workdir '/etc/sing-box'|" /etc/config/sing-box; \
    grep -q "option workdir '/etc/sing-box'" /etc/config/sing-box; \
    rm -f /etc/rc.d/S*dnsmasq /etc/rc.d/S*firewall /etc/rc.d/S*odhcpd /etc/rc.d/S*uhttpd; \
    ln -sf ../init.d/sing-box /etc/rc.d/S99sing-box; \
    ln -sf ../init.d/metaboxd /etc/rc.d/S98metaboxd; \
    mkdir -p /var/lock /var/run; \
    chmod +x /usr/bin/apply-cycle-check /usr/bin/stand-init; \
    /usr/bin/sing-box version

EXPOSE 8080 9090

# Не /sbin/init: цепочка preinit гасит сетевые устройства, и контейнер теряет
# адрес от Docker. procd поднимает stand-init, разложив перед этим сети.
CMD ["/usr/bin/stand-init"]
