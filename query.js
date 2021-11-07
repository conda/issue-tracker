import fetch from "node-fetch";
import moment from "moment";
import fs from "fs";
import core from "@actions/core";
import {repos} from "./repos.js";
import {snapshots} from "./snapshots.js";

function getIssues(repo, state) {
    let [org, prj] = repo.split("/");
    const url = "https://api.github.com/graphql";
    const options = {
        method: "POST",
        body: JSON.stringify({
            query: `
                query {
                    repository(owner: "${ org }", name:"${ prj }") {
                        issues(states:${ state }) {
                            totalCount
                        }
                    }
                }
            `
        }),
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `bearer ${ process.env.GITHUB_TOKEN }`
        }
    };

    return fetch(url, options)
        .then(resp => resp.json())
        .then(data => {
            return data.data.repository.issues.totalCount;
        });
}

// convenience functions
const getOpenIssues = repo => getIssues(repo, "OPEN");
const getClosedIssues = repo => getIssues(repo, "CLOSED");

// function getRepos() {
//     // read in repos
//     const path = './repos.js';

//     let repos;
//     try {
//         repos = require(path)
//     } catch (err) {
//         core.error(`Error reading file: ${ err }`);
//         process.exit(1);
//     }

//     console.log(repos);
//     console.log(repos.repos);

//     return repos;
// }

function writeSnapshot(snapshot) {
    // read in old data, if successful append new entry and write it out again
    const path = './snapshots.js';

    // let snapshots;
    // try {
    //     snapshots = require(path)
    // } catch (err) {
    //     core.error(`Error reading file: ${ err }`);
    //     process.exit(1);
    // }

    // console.log(snapshots);
    // process.exit(1);

    try {
        fs.writeFileSync(path, `export const snapshots = ${ JSON.stringify([...snapshots, snapshot]) };`);
    } catch (err) {
        core.error(`Error writing file: ${ err }`);
        process.exit(1);
    }

    core.notice(`${ snapshots.length + 1 } snapshots successfully written!`);
}

async function query() {
    // iterate over repos we care about and extract the number of open and closed issues
    let snapshot = {};
    let cumulativeOpen = 0;
    let cumulativeClosed = 0;
    for (let repo of repos) {
        let open = await getOpenIssues(repo);
        let closed = await getClosedIssues(repo);

        snapshot[repo] = { "open": open, "closed": closed };
        cumulativeOpen += open;
        cumulativeClosed += closed;
    }
    snapshot["cumulative"] = { "open": cumulativeOpen, "closed": cumulativeClosed };
    snapshot["timestamp"] = moment().unix();

    writeSnapshot(snapshot);
}

query();
