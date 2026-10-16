#!/usr/bin/env bash
# Build the playground's verifier, sentryward-ptx (the whole PTX check, without a reference), to WebAssembly from
# public sources: the sentryward PyPI sdist and Z3 5.1.0 (the version the wheels link). Writes js/sim/engine/: the
# ES-module loader sentryward-ptx.js, the engine gzipped (js/sim/engine.js inflates it) and NOTICE.txt.
#   bash scripts/engine/build.sh
# Needs Emscripten and the Boost headers (macOS: brew install emscripten boost). Z3 takes about half an hour, once.
# OpenSSL is replaced by shim/ (SHA-256 is all the code uses). patches/ fixes undefined behaviour in the sdist.
# wasm64 (MEMORY64): the code assumes a 64-bit size_t; wasm32 would narrow it silently.
# -fwasm-exceptions: the code reports errors by throwing; Emscripten's default build cannot catch them.
# Z3 is multi-threaded, as in the wheels: its per-query timeout runs on a timer thread.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
VER=0.1.0 Z3VER=5.1.0
SDIST=https://files.pythonhosted.org/packages/ea/2c/77d22f01520d7fd6afc0f29b2740a837ba8c7fecc76660dee2805e3cf332/sentryward-$VER.tar.gz
SRC="$HERE/_src/sentryward-$VER" Z3SRC="$HERE/_src/z3-z3-$Z3VER" B="$HERE/_build" SITE="$HERE/../../js/sim/engine"
FLAGS="-pthread -sMEMORY64 -fwasm-exceptions"
# Assertion messages carry __FILE__: map it relative to this folder, so the binary holds no build-machine path and
# is the same in any checkout. Through EMCC_CFLAGS, not FLAGS: SentryWard hashes CMAKE_CXX_FLAGS into a cache key.
export EMCC_CFLAGS="-ffile-prefix-map=$HERE=."
BOOST="${BOOST_INCLUDE:-$(brew --prefix 2>/dev/null || echo /usr/local)/include/boost}"
mkdir -p "$HERE/_src" "$B/ssl/lib" "$B/inc" "$SITE"

[ -d "$SRC" ] || curl -sL "$SDIST" | tar xz -C "$HERE/_src"
for p in "$HERE"/patches/*.patch; do   # applied once
  patch -d "$SRC" -p1 -R -s -f --dry-run < "$p" >/dev/null 2>&1 || patch -d "$SRC" -p1 -s < "$p"
done
[ -d "$Z3SRC" ] || curl -sL "https://github.com/Z3Prover/z3/archive/refs/tags/z3-$Z3VER.tar.gz" | tar xz -C "$HERE/_src"
ln -sfn "$BOOST" "$B/inc/boost"        # Boost alone: its include directory may also hold a real OpenSSL
emcc -O2 $FLAGS -I"$HERE/shim" -c "$HERE/shim/sha256.c" -o "$B/ssl/sha256.o"
emar rcs "$B/ssl/lib/libcrypto.a" "$B/ssl/sha256.o"

if [ ! -f "$B/z3/libz3.a" ]; then
  emcmake cmake -S "$Z3SRC" -B "$B/z3" -G Ninja -DCMAKE_BUILD_TYPE=Release -DZ3_BUILD_LIBZ3_SHARED=OFF \
    -DZ3_BUILD_EXECUTABLE=OFF -DZ3_BUILD_TEST_EXECUTABLES=OFF -DZ3_ENABLE_EXAMPLE_TARGETS=OFF \
    -DZ3_BUILD_PYTHON_BINDINGS=OFF -DZ3_BUILD_DOCUMENTATION=OFF -DZ3_INCLUDE_GIT_HASH=OFF -DZ3_INCLUDE_GIT_DESCRIBE=OFF \
    -DCMAKE_C_FLAGS="$FLAGS" -DCMAKE_CXX_FLAGS="$FLAGS" >/dev/null
  ninja -C "$B/z3" libz3
fi

# -Oz at link: emcc runs wasm-opt with only the features the target has (wasm-opt --all-features would emit
# compact imports, which browsers reject)
LINK="$FLAGS -sPROXY_TO_PTHREAD -sALLOW_MEMORY_GROWTH -sMAXIMUM_MEMORY=16GB -sSTACK_SIZE=8MB -sDEFAULT_PTHREAD_STACK_SIZE=8MB \
  -sEXIT_RUNTIME -sPTHREAD_POOL_SIZE=12 -Oz -sMODULARIZE -sEXPORT_ES6 -sEXPORT_NAME=SentryWard -sENVIRONMENT=web,worker \
  -sINVOKE_RUN=0 -sEXPORTED_RUNTIME_METHODS=callMain,FS,HEAPU8"
emcmake cmake -S "$SRC" -B "$B/web" -G Ninja -DCMAKE_BUILD_TYPE=Release \
  -DSENTRYWARD_BUILD_TESTS=OFF -DSENTRYWARD_WARNINGS_AS_ERRORS=OFF -DSENTRYWARD_WITH_Z3=ON \
  -DSENTRYWARD_Z3_INCLUDE_DIR="$Z3SRC/src/api;$Z3SRC/src/api/c++" -DSENTRYWARD_Z3_LIBRARY="$B/z3/libz3.a" \
  -DOPENSSL_ROOT_DIR="$B/ssl" -DOPENSSL_INCLUDE_DIR="$HERE/shim" -DOPENSSL_CRYPTO_LIBRARY="$B/ssl/lib/libcrypto.a" \
  -DSENTRYWARD_BOOST_INCLUDE_DIR="$B/inc" \
  -DCMAKE_C_FLAGS="$FLAGS" -DCMAKE_CXX_FLAGS="$FLAGS" -DCMAKE_EXE_LINKER_FLAGS="$LINK" >/dev/null
ninja -C "$B/web" sentryward-ptx

cp "$B/web/sentryward-ptx.js" "$SITE/"                # keep the name: its thread workers load it by name
gzip -9 -n -c "$B/web/sentryward-ptx.wasm" > "$SITE/sentryward-ptx.wasm.gz"
EMSDK="$(dirname "$(readlink -f "$(which emcc)")")/.."
{   # the licenses of what the engine is built from, shipped beside it (Boost's covers source copies only)
  echo "sentryward-ptx.wasm: SentryWard $VER (PyPI sdist) compiled to WebAssembly with Emscripten, with Z3 $Z3VER,"
  echo "nlohmann/json and Boost.Multiprecision (Boost Software License 1.0). Built by scripts/engine/build.sh."
  echo "Changed from the sdist: $(cd "$HERE/patches" && ls *.patch | tr '\n' ' ')(a fix for undefined behaviour; no change in"
  echo "what is checked)."
  for f in "SentryWard|$SRC/LICENSE" "Z3|$Z3SRC/LICENSE.txt" "nlohmann/json|$SRC/vendor/nlohmann_json/LICENSE.MIT" \
           "Emscripten (runtime and JavaScript loader)|$EMSDK/LICENSE" \
           "musl libc (in the Emscripten runtime)|$EMSDK/libexec/system/lib/libc/musl/COPYRIGHT"; do
    printf '\n==================== %s ====================\n\n' "${f%%|*}"; cat "${f#*|}"
  done
} > "$SITE/NOTICE.txt"
ls -la "$SITE"
