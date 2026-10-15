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
[the technical article](http://127.0.0.1:8765/blog/verifying-warp-specialized-gpu-kernels/),
or [the verification database](http://127.0.0.1:8765/results/).

## Verification database

`/results/` presents a versioned snapshot of
`wmdi/wasp_verification:docs/kernel-verification-results.json`. Search, library/result filters,
summary groups, sorting, pagination, and individual record links run entirely in the browser.
The snapshot date, publishing revision, verifier workspace base, conditional analysis scopes,
and incomplete checks remain visible. Summary counts are derived from the records and checked
against the source counts. Reported findings are not presented as confirmed hardware failures.

The source repository requires access, so visitors load the bundled snapshot, not the GitHub API.
No access token is embedded in the site. To refresh it, authenticate the GitHub CLI with source
repository access and run:

```sh
python3 scripts/update-verification-results.py
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -p "test_*.py"
```

The updater resolves `main` to a commit, validates the downloaded JSON, and saves the original
bytes plus provenance in `data/`. It also imports the synchronization-removal columns from
`examples/index.md` at the same publishing revision into `sync-removal-results.json`. Use `--ref <commit>` for a specific source revision. Review and
commit all three data files through a PR; merging publishes the updated snapshot. This is a dated
snapshot, not a live feed. Preserve source follow-up notes and workspace caveats when updating.
File links point to the publishing revision, while recorded SHA-256 hashes identify analyzed
files; local source changes mean those may differ.

Preview checks: filter by library and verdict, search a diagnostic, sort by runtime, move between
pages, open a conditional record, close it with Escape, and reload its permalink. Verify the
empty state and mobile table scrolling. The page shows an error and keeps the JSON download
available if data loading or validation fails.

### Synchronization removal and kernel performance

The database joins historical synchronization experiments to verification records by exact
kernel identifier. The **Recorded inputs / Larger-input study** selector switches both the
removal count and B200 timing columns. Use **Only kernels with removal counts**, or sort by
removable sites and runtime reduction. Details preserve full input-scope notes and experiment
issue links. Summary totals describe the filtered rows; counts and timings may cover different
kernel sets.

Removal counts refer to candidate sites removable together under the experiment's configuration,
not every dynamic synchronization instruction or every possible input. The study is separate from
the latest verification run. Some larger-input entries are explicitly marked as original-shape
rechecks. Unknown values, unrun experiments, measured zero, and no measurable performance change
remain distinct. Runtime percentages use the source-reported values, not ratios inferred from
rounded timings. Positive source runtime changes are displayed as **higher** (slower).

`scripts/sync_removal.py` rejects changed table formats, mismatched candidates, and unknown kernel
identifiers rather than silently dropping measurements. The UI keeps verification results usable
if the optional study file cannot load. Source study provenance is stored with the imported data.

## Files

- `index.html`: project overview and usage.
- `blog/index.html`: article listing.
- `blog/verifying-warp-specialized-gpu-kernels/index.html`: technical article.
- `css/style.css`: article and figure styles.
- `css/site.css`: shared navigation, homepage, and blog layouts.
- `results/index.html`, `css/results.css`: verification database page and responsive layout.
- `js/results.mjs`, `js/results-model.mjs`: database UI, filtering, and data validation.
- `data/`: verification snapshot, source provenance, and synchronization-removal study.
- `js/sync-removal.mjs`, `scripts/sync_removal.py`: study validation, display semantics, and import.
- `scripts/update-verification-results.py`: authenticated, validated snapshot refresh.
- `tests/results-model.test.mjs`: snapshot integrity and query behavior checks.
- `js/anim.js`: figure helpers and animation runtime.
- `js/figs1.js`, `js/figs2.js`, `js/figs3.js`: interactive figures.

Serve the repository root to preserve relative links and assets. Fonts and KaTeX load from external CDNs.

## Origin and license

The site was migrated from the `blog/` directory of
[wmdi/wasp_verification](https://github.com/wmdi/wasp_verification/tree/4645264bcbc910aee813db3a67f60ef4a4a190dd/blog),
including the saved homepage and blog navigation updates. The original Apache 2.0 license is preserved in [LICENSE](LICENSE).

The verifier implementation is in [gpu-verifier/sentryward](https://github.com/gpu-verifier/sentryward).
