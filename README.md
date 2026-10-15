# SentryWard website

The SentryWard project website and technical blog, maintained in
[gpu-verifier/sentryward-website](https://github.com/gpu-verifier/sentryward-website).

This is a static HTML, CSS, and JavaScript site. No build step or package installation is required.

## Publishing

The [deployment workflow](.github/workflows/deploy-pages.yml) publishes the repository root to
GitHub Pages whenever a pull request is merged into `main` or another commit is pushed to `main`.
No build step or deployment secret is required. GitHub Pages must use **GitHub Actions** as its
publishing source in the repository's **Settings → Pages**.

Follow deployments in [GitHub Actions](https://github.com/gpu-verifier/sentryward-website/actions/workflows/deploy-pages.yml).
To republish manually, select **Run workflow** on `main`. Deployments run one at a time;
other branches do not publish the production site.

The custom domain is [sentryward.io](https://sentryward.io); keep the root `CNAME` file and the
custom domain setting in GitHub Pages. The
[GitHub Pages address](https://gpu-verifier.github.io/sentryward-website/) redirects to this domain.

Namecheap manages DNS. The root host (`@`) uses these GitHub Pages A records:
`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, and `185.199.111.153`.
The `www` host is a CNAME pointing to `gpu-verifier.github.io`.
GitHub Pages redirects `www.sentryward.io` to the root domain once DNS and its HTTPS certificate are ready.

## Preview locally

From the repository root:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open [the homepage](http://127.0.0.1:8765/), [the blog index](http://127.0.0.1:8765/blog/),
or [the technical article](http://127.0.0.1:8765/blog/verifying-warp-specialized-gpu-kernels/).

## Files

- `index.html`: project overview and usage.
- `blog/index.html`: article listing.
- `blog/verifying-warp-specialized-gpu-kernels/index.html`: technical article.
- `css/style.css`: article and figure styles.
- `css/site.css`: shared navigation, homepage, and blog layouts.
- `js/anim.js`: figure helpers and animation runtime.
- `js/figs1.js`, `js/figs2.js`, `js/figs3.js`: interactive figures.

Serve the repository root to preserve relative links and assets. Fonts and KaTeX load from external CDNs.

## Origin and license

The site was migrated from the `blog/` directory of
[wmdi/wasp_verification](https://github.com/wmdi/wasp_verification/tree/4645264bcbc910aee813db3a67f60ef4a4a190dd/blog),
including the saved homepage and blog navigation updates. The original Apache 2.0 license is preserved in [LICENSE](LICENSE).

The verifier implementation is in [gpu-verifier/sentryward](https://github.com/gpu-verifier/sentryward).
