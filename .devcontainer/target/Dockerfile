# Настоящий procd, а не заглушка: цикл Apply должен отрабатывать как на роутере.

ARG SINGBOX_VERSION=1.14.0-extended-2.7.1
ARG SINGBOX_ARCH=arm64
ARG OPENWRT_TAG=aarch64_generic-24.10.8
# Архитектура в манифесте OpenWrt нестандартная (`linux/aarch64_generic`), Docker
# не сопоставит её с хостом сам — платформа задаётся явно и совпадает с тегом.
# Глобальные ARG объявлены до первой FROM: ниже BuildKit отнёс бы их к стадии.
ARG OPENWRT_PLATFORM=linux/aarch64_generic

# Отдельная стадия: в rootfs OpenWrt нет ни curl, ни install, а opkg — лишняя
# точка отказа. $BUILDPLATFORM: иначе BuildKit искал бы alpine под aarch64_generic.
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

# netifd забирает eth0 в br-lan и теряет адрес от Docker — проброс портов после
# этого не работает; procd/ubus/logd/rpcd остаются настоящими. `init.d disable`
# на сборке не срабатывает (procd и ubus ещё не подняты) — снимаем симлинки.
# /var в rootfs — симлинк на пустой /tmp: без /var/lock и /var/run ubusd не создаст
# сокет, и procd поднимется, не запустив ни одного сервиса.
RUN rm -f /etc/rc.d/S*dnsmasq /etc/rc.d/S*firewall /etc/rc.d/S*odhcpd /etc/rc.d/S*uhttpd \
 && rm -f /etc/rc.d/S*network /etc/rc.d/K*network \
 && ln -sf ../init.d/sing-box /etc/rc.d/S99sing-box \
 && ln -sf ../init.d/metaboxd /etc/rc.d/S98metaboxd \
 && mkdir -p /var/lock /var/run \
 && chmod +x /etc/init.d/sing-box /etc/init.d/metaboxd /usr/bin/apply-cycle-check \
 && /usr/bin/sing-box version

VOLUME /opt/metabox

EXPOSE 8080 9090

# Не /sbin/init: цепочка preinit гасит сетевые устройства, и контейнер теряет
# адрес от Docker.
CMD ["/sbin/procd"]
