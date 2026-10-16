/* The few OpenSSL EVP calls sentryward-ptx makes (SHA-256 digests only), for the WebAssembly build.
   Implemented in sha256.c; links in place of libcrypto. */
#pragma once
#include <stddef.h>
#ifdef __cplusplus
extern "C" {
#endif

#define EVP_MAX_MD_SIZE 64
typedef struct evp_md_st EVP_MD;
typedef struct evp_md_ctx_st EVP_MD_CTX;
typedef struct engine_st ENGINE;

const EVP_MD *EVP_sha256(void);
EVP_MD_CTX *EVP_MD_CTX_new(void);
void EVP_MD_CTX_free(EVP_MD_CTX *ctx);
int EVP_DigestInit_ex(EVP_MD_CTX *ctx, const EVP_MD *type, ENGINE *impl);
int EVP_DigestUpdate(EVP_MD_CTX *ctx, const void *data, size_t count);
int EVP_DigestFinal_ex(EVP_MD_CTX *ctx, unsigned char *md, unsigned int *size);
int EVP_Digest(const void *data, size_t count, unsigned char *md, unsigned int *size,
               const EVP_MD *type, ENGINE *impl);

#ifdef __cplusplus
}
#endif
