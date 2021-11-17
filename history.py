#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Generating the history using the GitHub API.

Normally this should not be used. This is ideally only used to generate the initial
historical data points for repos that have not been previously tracked.
"""
import argparse
import json
import time
from contextlib import suppress
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timedelta
from os import environ
from pathlib import Path
from threading import Thread
from typing import Any, Optional, Union

import yaml
from github import Github
from rich.progress import (
    BarColumn,
    Progress,
    SpinnerColumn,
    TextColumn,
    TimeRemainingColumn,
)


@dataclass
class History:
    ignore_cache: bool

    LIMIT: Union[bool, int] = False

    @property
    def repos(self) -> list[str]:
        try:
            return self._repos
        except AttributeError:
            self._repos = self._get_repos()
            return self._repos

    def _get_repos(self) -> list[str]:
        # fetch cache
        cache_file = Path(".cache/github/index").expanduser().resolve()
        if not self.ignore_cache and cache_file.is_file():
            with cache_file.open() as fh:
                return yaml.safe_load(fh)

        repos = [
            r.full_name
            for r in self.github.get_organization("conda").get_repos()
            if not r.archived
        ]

        # cache for future
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        with cache_file.open("w") as fh:
            yaml.dump(repos, fh)

        return repos

    @property
    def github(self) -> Github:
        try:
            return self._github
        except AttributeError:
            self._github = self._get_github()
            return self._github

    @staticmethod
    def _get_github() -> Github:
        apikey: Optional[str] = None

        # attempt to fetch stored API key
        apikey_file = Path("~/.github_apikey").expanduser().resolve()
        if apikey_file.is_file():
            with apikey_file.open() as fh:
                apikey = fh.read().strip()

        # no key stored, resort to envvar
        if not apikey:
            with suppress(KeyError):
                apikey = environ["GITHUB_APIKEY"].strip()

        # no envvar, resort to prompting
        if not apikey:
            with suppress(KeyboardInterrupt):
                apikey = input("GitHub API Key? ").strip()

        if not apikey:
            raise ValueError(
                "Missing GitHub API Key (attempted ~/.github_apikey, "
                "$GITHUB_APIKEY, and user prompt)."
            )

        return Github(apikey)

    @property
    def github_issues(self):
        try:
            return self._github_issues
        except AttributeError:
            self._github_issues = {}

            crepos = [r for r in self.repos if self.is_cached(r)]
            frepos = [r for r in self.repos if not self.is_cached(r)]

            cthreads = []
            fthreads = []

            with Progress(
                TextColumn("{task.fields[icon]}"),
                TextColumn("[progress.description]{task.description}"),
                BarColumn(),
                TextColumn("[progress.total]{task.percentage:>3.0f}%"),
                TextColumn("[progress.total]{task.completed}/{task.total}"),
                TimeRemainingColumn(),
            ) as progress:
                while crepos or cthreads or frepos or fthreads:
                    # while more repos to query or still running threads keep running

                    # allow up to 10 concurrent cthreads
                    while len(cthreads) < 10 and crepos:
                        cthreads.append(
                            Thread(
                                target=self._get_github_issues,
                                args=(
                                    repo := crepos.pop(0),
                                    progress,
                                    progress.add_task(repo, total=0, icon=" "),
                                ),
                            )
                        )
                        cthreads[-1].start()

                    # allow only 1 fetch thread (fthreads) to avoid GitHub complaining
                    while len(fthreads) < 1 and frepos:
                        fthreads.append(
                            Thread(
                                target=self._get_github_issues,
                                args=(
                                    repo := frepos.pop(0),
                                    progress,
                                    progress.add_task(repo, total=0, icon=" "),
                                ),
                            )
                        )
                        fthreads[-1].start()

                    # check for completed threads
                    cthreads = [t for t in cthreads if t.is_alive()]
                    fthreads = [t for t in fthreads if t.is_alive()]

                    # short pause
                    time.sleep(0.5)

            return self._github_issues

    def is_cached(self, repo):
        cache_file = Path(f".cache/github/{repo}").expanduser().resolve()
        return not self.ignore_cache and cache_file.is_file()

    def _get_github_issues(self, repo, progress, task) -> dict[int, dict[str, Any]]:
        data: dict[int, dict[str, Any]] = {}

        # fetch cache
        cache_file = Path(f".cache/github/{repo}").expanduser().resolve()
        if not self.ignore_cache and cache_file.is_file():
            progress.update(task, icon="📂")
            with cache_file.open() as fh:
                data = yaml.safe_load(fh)
                progress.update(task, completed=len(data), total=len(data))
                self._github_issues[repo] = data
                return

        # fetch from GitHub
        progress.update(task, icon="🌐")
        total, chunk, i = 0, 100, 0
        for issue in self.github.get_repo(repo).get_issues(state="all"):
            # don't include PRs
            # (use private var so the PullRequest object isn't instantiated)
            if "pull_request" in issue._rawData:
                continue

            if i >= total:
                total += chunk
                chunk *= 2  # double chunk each time we increase the side
                progress.update(task, total=total)

            progress.update(task, advance=1)
            data[issue.number] = {
                "created": issue.created_at,
                "closed": issue.closed_at,
            }

            if self.LIMIT and i > self.LIMIT:
                break

            i += 1

        progress.update(task, completed=len(data), total=len(data))

        # cache for future
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        with cache_file.open("w") as fh:
            yaml.dump(data, fh)

        self._github_issues[repo] = data

    def get_snapshots(self, out, rate, trim):
        now = datetime.now()
        current = datetime(
            year=now.year,
            month=now.month,
            day=now.day,
            hour=int(now.hour / rate) * rate,
            minute=0,
            second=0,
        )

        allIssues = deepcopy(self.github_issues)
        repos = [r for r in self.repos if r in allIssues]
        snapshots = {}

        start = min(
            next(iter(issues.values()))["created"]
            for issues in allIssues.values()
            if issues
        )

        total, chunk, i = 50, 50, 0

        with Progress(
            SpinnerColumn(finished_text="✔"),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TextColumn("[progress.total]{task.percentage:>3.0f}%"),
            TextColumn("[progress.total]{task.completed}/{task.total}"),
            TimeRemainingColumn(),
        ) as progress:
            task = progress.add_task(description=f"Processing {out}", total=total)

            while current > start and (not trim or i < trim):
                # grow progress bar if total surpassed
                if i >= total:
                    total += chunk
                    chunk *= 2  # double chunk each time we increase the size
                    progress.update(task, total=total)

                # iterate over repos so we preserve the natural repo order for insertion
                for repo in repos:
                    open_ = 0

                    for number, issue in list(allIssues[repo].items()):
                        if current < issue["created"]:
                            # the issue doesn't exist yet, since we are going backwards
                            # through the history, this means we can skip checking this
                            # issue in subsequent iterations
                            allIssues[repo].pop(number)
                        elif not issue["closed"]:
                            open_ += 1
                        elif current < issue["closed"]:
                            open_ += 1
                        elif issue["closed"] < current:
                            # issue has been closed
                            pass

                    if not allIssues[repo]:
                        # no issues exist before this time, since we are going backwards
                        # through the history, this means we can skip checking this repo
                        # in subsequent iterations
                        allIssues.pop(repo)
                        repos.remove(repo)
                        continue

                    snapshots.setdefault(repo, []).append(open_)

                snapshots.setdefault("timestamp", []).append(
                    int(current.timestamp() * 1000)
                )

                # increment
                current -= timedelta(hours=rate)
                i += 1
                progress.update(task, advance=1)

            progress.update(task, completed=i, total=i)

        return snapshots

    def write_repos(self):
        # get repos, convert to JSON
        data = json.dumps(self.repos, separators=(",", ":"))

        # write out
        file = Path("snapshots/repos.js")
        with file.open("w") as fh:
            fh.write(f"export const repos = {data};\n")

    def write_snapshots(self, out, rate, trim=None):
        # get snapshots, convert to JSON
        data = json.dumps(self.get_snapshots(out, rate, trim), separators=(",", ":"))

        # write out
        file = Path(f"snapshots/{out}.js")
        with file.open("w") as fh:
            fh.write(f"const {out} = {data};\nexport default {out};\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--ignore-cache",
        action="store_true",
        default=False,
        help="Ignore cache if present.",
    )
    args = parser.parse_args()

    h = History(args.ignore_cache)

    h.write_repos()
    h.write_snapshots("recent", rate=1, trim=72)  # every hour, keep 3 days worth
    h.write_snapshots("month", rate=3, trim=248)  # every 3 hours, keep 31 days worth
    h.write_snapshots("year", rate=24, trim=366)  # every day, keep 366 days worth
    h.write_snapshots("alltime", rate=72)  # every 3 days, keep everything
