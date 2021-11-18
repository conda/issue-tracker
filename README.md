# Conda (and friends) Issue Tracker

[badge]: https://img.shields.io/website?down_color=lightgrey&down_message=offline&up_color=blue&up_message=online&url=https%3A%2F%2Fconda.github.io%2Fissue-tracker%2F
[pages]: https://conda.github.io/issue-tracker/
[conda-org]: https://github.com/conda
[chartjs]: https://www.chartjs.org/
[vscode-issue-tracker]: https://vscode-issue-tracker.netlify.app
[github-corners]: https://github.com/tholman/github-corners

[![Website][badge]][pages]

A visualization of the issue count of [conda org][conda-org] repositories over time.

This is designed to be a serverless site with a static frontend.

Using GitHub Actions we query at set intervals for the number of issues open for a given repository. We generate snapshots for 4 kinds of graphs:

- recent (hourly interval over the past 3 days)
- month (every 3 hours over the past 31 days)
- year (every 24 hours over the past 366 days)
- all-time (every 72 hours since the start of time)

Snapshots displayed with [Chart.js][chartjs].

Inspired by [VSCode Issue Tracker by Benjamin Lannon][vscode-issue-tracker].<br>
Credit also goes to [GitHub Corners by Tim Holman][github-corners].

# Contributing
Contributions to issue-tracker are welcome, see below for details on configuring your environment.

## Code of Conduct

[code-of-conduct]: https://www.numfocus.org/code-of-conduct

The conda organization adheres to the [NumFOCUS Code of Conduct][code-of-conduct].

## Development Environment

[install-git]: https://git-scm.com/book/en/v2/Getting-Started-Installing-Git
[github-signup]: https://github.com/signup
[issue-tracker]: https://github.com/conda/issue-tracker

0. [Signup for a GitHub account][github-signup] (if you haven't already) and [install Git on your system][install-git].
1. Fork the conda repository to your personal GitHub account by clicking the "Fork" button on [conda/issue-tracker][issue-tracker] and follow GitHub's instructions.
2. Clone the repo you just forked on GitHub to your local machine. Configure your repo to point to both "upstream" (the main repo) and "origin" (your fork):

   ```bash
   # choose the repository location
   $ PROJECT_ROOT="$HOME/issue-tracker"

   # clone the project
   # replace `your-username` with your actual GitHub username
   $ git clone git@github.com:your-username/issue-tracker "$PROJECT_ROOT"
   $ cd "$PROJECT_ROOT"

   # set the `upstream` as the the main repository
   $ git remote add upstream git@github.com:conda/issue-tracker
   ```

3. Create a local development environment and activate that environment

   ```bash
   # install conda packages
   $ conda create -n conda-issue-tracker nodejs python pygithub pyyaml rich pre-commit
   $ conda activate conda-issue-tracker

   # install nodejs packages
   (conda-issue-tracker) $ npm install
   ```

## Static Code Analysis

[pre-commit]: https://pre-commit.com/
[pre-commit-docs]: https://pre-commit.com/#quick-start

This project is configured with [pre-commit][pre-commit] to automatically run linting and other static code analysis on every commit. Running these tools prior to the PR/code review process helps in two ways:

1. it helps *you* by automating the nitpicky process of identifying and
   correcting code style/quality issues
2. it helps *us* where during code review we can focus on the substance of
   your contribution

Feel free to read up on everything pre-commit related in their [docs][pre-commit-docs] but we've included the gist of what you need to get started below:

```bash
# install pre-commit hooks for conda
(conda-issue-tracker) $ pre-commit install

# manually running pre-commit on current changes
# note: by default pre-commit only runs on staged files
(conda-issue-tracker) $ pre-commit run

# automatically running pre-commit during commit
(conda-issue-tracker) $ git commit
```

Beware that some of the tools run by pre-commit can potentially modify the code (see [black](https://github.com/psf/black) and [blacken-docs](https://github.com/asottile/blacken-docs)). If pre-commit detects that any files were modified it will terminate the commit giving you the opportunity to review the code before committing again.

Strictly speaking using pre-commit on your local machine for commits is optional (if you don't install pre-commit you will still be able to commit normally). But once you open a PR to contribue your changes, pre-commit will be automatically run at which point any errors that occur will need to be addressed prior to proceeding.

## Generating Historical Snapshots

[apikey]: https://github.com/settings/tokens

While the idea is to run GitHub Actions on a regular schedule to generate snapshots of data this only appends new data. To generate the historical data run the provided Python program.

To run `history.py` you need a [GitHub personal access token][apikey]. This can be conveniently stored in your home directory (at `~/.github_apikey`) for repeated use.

```bash
(conda-issue-tracker) $ python history.py
```

The raw data generated by `history.py` will be cached to allow for faster testing and fewer expensive calls to GitHub's API. Ignore the cache via `--ignore-cache` argument:

```bash
(conda-issue-tracker) $ python history.py --ignore-cache
```

## Running Locally

To test the site locally run `http-server` from `$PROJECT_ROOT`:

```bash
(conda-issue-tracker) $ http-server
```
