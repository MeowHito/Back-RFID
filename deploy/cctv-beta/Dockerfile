# MediaMTX 1.9.0-ffmpeg (alpine 3.19) + curl + openssl for hook scripts.
#
# The default :1.9.0 image is scratch-based and can't run /bin/sh — hooks fail
# with "fork/exec /hooks/on-publish.sh: no such file or directory". The ffmpeg
# variant has alpine + sh + awk + printf, but still lacks curl and openssl
# which on-publish.sh / on-unpublish.sh need for HMAC signing + webhook POST.
FROM bluenviron/mediamtx:1.9.0-ffmpeg
USER root
RUN apk add --no-cache curl openssl
