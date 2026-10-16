/* SHA-256 (FIPS 180-4) behind the EVP calls in openssl/evp.h. Only SHA-256 exists, so EVP_sha256 is a tag. */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "openssl/evp.h"

struct evp_md_st { int unused; };
static const EVP_MD SHA256_TAG = {0};
struct evp_md_ctx_st { uint32_t h[8]; uint64_t bytes; unsigned char block[64]; size_t used; };

static const uint32_t K[64] = {
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2};

#define ROR(x, n) (((x) >> (n)) | ((x) << (32 - (n))))

static void compress(uint32_t h[8], const unsigned char *p) {
  uint32_t w[64], a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], k = h[7];
  for (int i = 0; i < 16; i++) w[i] = (uint32_t)p[4*i] << 24 | (uint32_t)p[4*i+1] << 16 | (uint32_t)p[4*i+2] << 8 | p[4*i+3];
  for (int i = 16; i < 64; i++) {
    uint32_t s0 = ROR(w[i-15], 7) ^ ROR(w[i-15], 18) ^ (w[i-15] >> 3);
    uint32_t s1 = ROR(w[i-2], 17) ^ ROR(w[i-2], 19) ^ (w[i-2] >> 10);
    w[i] = w[i-16] + s0 + w[i-7] + s1;
  }
  for (int i = 0; i < 64; i++) {
    uint32_t t1 = k + (ROR(e, 6) ^ ROR(e, 11) ^ ROR(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i];
    uint32_t t2 = (ROR(a, 2) ^ ROR(a, 13) ^ ROR(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
    k = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
  }
  h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += k;
}

const EVP_MD *EVP_sha256(void) { return &SHA256_TAG; }
EVP_MD_CTX *EVP_MD_CTX_new(void) { return calloc(1, sizeof(EVP_MD_CTX)); }
void EVP_MD_CTX_free(EVP_MD_CTX *ctx) { free(ctx); }

int EVP_DigestInit_ex(EVP_MD_CTX *ctx, const EVP_MD *type, ENGINE *impl) {
  static const uint32_t IV[8] = {0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19};
  (void)impl;
  if (!ctx || type != &SHA256_TAG) return 0;
  memcpy(ctx->h, IV, sizeof IV); ctx->bytes = 0; ctx->used = 0;
  return 1;
}

int EVP_DigestUpdate(EVP_MD_CTX *ctx, const void *data, size_t count) {
  const unsigned char *p = data;
  ctx->bytes += count;
  while (count) {
    size_t n = 64 - ctx->used < count ? 64 - ctx->used : count;
    memcpy(ctx->block + ctx->used, p, n); ctx->used += n; p += n; count -= n;
    if (ctx->used == 64) { compress(ctx->h, ctx->block); ctx->used = 0; }
  }
  return 1;
}

int EVP_DigestFinal_ex(EVP_MD_CTX *ctx, unsigned char *md, unsigned int *size) {
  uint64_t bits = ctx->bytes * 8;
  unsigned char pad = 0x80, zero = 0, len[8];
  EVP_DigestUpdate(ctx, &pad, 1);
  while (ctx->used != 56) EVP_DigestUpdate(ctx, &zero, 1);
  for (int i = 0; i < 8; i++) len[i] = (unsigned char)(bits >> (56 - 8 * i));
  EVP_DigestUpdate(ctx, len, 8);
  for (int i = 0; i < 8; i++) { md[4*i] = ctx->h[i] >> 24; md[4*i+1] = ctx->h[i] >> 16; md[4*i+2] = ctx->h[i] >> 8; md[4*i+3] = ctx->h[i]; }
  if (size) *size = 32;
  return 1;
}

int EVP_Digest(const void *data, size_t count, unsigned char *md, unsigned int *size,
               const EVP_MD *type, ENGINE *impl) {
  EVP_MD_CTX ctx;
  return EVP_DigestInit_ex(&ctx, type, impl) && EVP_DigestUpdate(&ctx, data, count) &&
         EVP_DigestFinal_ex(&ctx, md, size);
}

#ifdef SHA256_SELFTEST
#include <stdio.h>
int main(void) {   /* FIPS 180-2 test vectors, one and two blocks */
  static const char *in[3] = {"abc", "", "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"};
  static const char *want[3] = {"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
                                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                                "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"};
  for (int t = 0; t < 3; t++) {
    unsigned char md[32]; unsigned n; char hex[65];
    EVP_Digest(in[t], strlen(in[t]), md, &n, EVP_sha256(), NULL);
    for (int i = 0; i < 32; i++) sprintf(hex + 2 * i, "%02x", md[i]);
    if (strcmp(hex, want[t])) { printf("FAIL %s\n", hex); return 1; }
  }
  puts("sha256 ok");
  return 0;
}
#endif
